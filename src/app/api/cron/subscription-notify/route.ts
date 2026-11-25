import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getUserSubscription } from '@/lib/subscription-guard'
import { flushQueue } from '@/lib/notify/queue'
import { getLocalDate } from '@/lib/utils'

/**
 * Cron diario de notificación de pruebas vencidas:
 *  - Iterar todos los usuarios de la plataforma (app_users).
 *  - Detectar cuyos planes Trial hayan vencido (modo lectura).
 *  - Notificar al admin una vez por usuario por día (dedupe).
 *
 * Protegido con CRON_SECRET (vercel.json añade el header automáticamente).
 */
export async function POST(request: NextRequest) {
  return handleCron(request)
}

export async function GET(request: NextRequest) {
  return handleCron(request)
}

async function handleCron(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }, { status: 500 })
  }

  const { data: appUsers, error: usersError } = await admin.from('app_users').select('id')
  if (usersError) {
    return NextResponse.json({ error: `Error cargando usuarios: ${usersError.message}` }, { status: 500 })
  }

  const today = getLocalDate()
  let notified = 0
  const errors: string[] = []

  const { notifyTrialExpired } = await import('@/lib/notify/actions')

  for (const appUser of appUsers || []) {
    try {
      const sub = await getUserSubscription(admin, appUser.id)
      if (sub.isTrial && (sub.status === 'expired' || sub.status === 'cancelled' || (sub.ends_at ? new Date(sub.ends_at).getTime() < Date.now() : false))) {
        const dedupeKey = `trial-expired-${appUser.id}-${today}`
        const { existsByDedupe } = await import('@/lib/notify/queue')
        const already = await existsByDedupe(admin, dedupeKey)
        if (already) continue
        const id = await notifyTrialExpired(admin, { userId: appUser.id, dedupeKey })
        if (id) notified++
      }
    } catch (err: any) {
      errors.push(`usuario ${appUser.id}: ${String(err?.message || err)}`)
    }
  }

  // Reintentos de la cola de correos (pendientes, atascados en 'sending' y vencidos).
  const queue = await flushQueue(admin, 100)

  return NextResponse.json({ ok: true, notified, users: (appUsers || []).length, queue, errors })
}
