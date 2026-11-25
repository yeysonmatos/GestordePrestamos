import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-admin'
import { isAdminUser } from '@/lib/admin'
import { getLocalDate } from '@/lib/utils'

export interface SubscriptionSnapshot {
  status: string | null
  ends_at: string | null
  planName: string | null
  isTrial: boolean
}

// Lee la suscripción más reciente del usuario (status, fin, plan).
// Mismo patrón que src/proxy.ts y dashboard/page.tsx.
export async function getUserSubscription(supabase: SupabaseClient, userId: string): Promise<SubscriptionSnapshot> {
  const fallback: SubscriptionSnapshot = { status: null, ends_at: null, planName: null, isTrial: false }
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, ends_at, plan:plans(price, name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!sub) return fallback
    const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan
    return {
      status: sub.status,
      ends_at: sub.ends_at,
      planName: plan?.name ?? null,
      isTrial: Number(plan?.price || 0) === 0,
    }
  } catch {
    return fallback
  }
}

// Cualquier plan vencido/cancelado (Trial, Básico o Pro) entra en modo lectura:
// puede leer pero no escribir. Las escrituras se bloquean en el API guard
// (requireActiveSubscriptionApi) y en src/proxy.ts para las rutas de escritura.
export function isExpiredForReadOnly(sub: SubscriptionSnapshot): boolean {
  if (sub.status === 'expired' || sub.status === 'cancelled') return true
  if (sub.ends_at) {
    const ended = new Date(sub.ends_at).getTime() < Date.now()
    if (ended) return true
  }
  return false
}

export interface GuardInput {
  supabase: SupabaseClient
  supabaseResponse: NextResponse
  message?: string
  notifyAdmin?: boolean
}

export interface GuardSuccess {
  ok: true
  userId: string
}

export interface GuardFailure {
  ok: false
  response: NextResponse
}

// Guard para rutas API de escritura: bloquea al usuario cuyo Trial venció
// (modo lectura). Se usa tras el check de auth. El admin siempre pasa.
// Recibe el supabase/supabaseResponse ya creados por la ruta para no duplicar
// clientes y conservar la propagación de cookies.
export async function requireActiveSubscriptionApi(input: GuardInput): Promise<GuardSuccess | GuardFailure> {
  const { supabase, supabaseResponse } = input

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: supabaseResponse.headers }) }
  }

  const isAdmin = await isAdminUser(supabase)
  if (isAdmin) {
    return { ok: true, userId: user.id }
  }

  const sub = await getUserSubscription(supabase, user.id)
  if (isExpiredForReadOnly(sub)) {
    if (input.notifyAdmin !== false) {
      void notifyTrialExpiredAsync(user.id)
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: input.message || 'Tu período de prueba venció. Tu cuenta está en modo lectura: contacta a tu administrador para renovar tu plan.' },
        { status: 403, headers: supabaseResponse.headers }
      ),
    }
  }

  return { ok: true, userId: user.id }
}

// Notifica al admin por email (fire-and-forget, nunca lanza).
// Dedupe por usuario + día para no spamear en cada 403 del mismo día.
async function notifyTrialExpiredAsync(userId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    if (!admin) return

    const { notifyTrialExpired } = await import('@/lib/notify/actions')
    await notifyTrialExpired(admin, {
      userId,
      dedupeKey: `trial-expired-${userId}-${getLocalDate()}`,
    })
  } catch (err) {
    console.error('[subscription-guard] notify error:', err)
  }
}
