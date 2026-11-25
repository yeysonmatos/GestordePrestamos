import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { sendViaSmtp } from './smtp'

export interface EnqueueEmailInput {
  recipientType: 'admin' | 'prestamista'
  recipientUserId?: string | null
  recipientEmail: string
  recipientName?: string | null
  templateKey: string
  subject: string
  htmlBody: string
  eventType: string
  entityType?: string | null
  entityId?: string | null
  dedupeKey?: string | null
}

// Backoff de reintentos: intento 1→10min, 2→1h, 3→6h (y siguientes 24h)
export function retryDelayMs(attempts: number): number {
  if (attempts <= 1) return 10 * 60 * 1000
  if (attempts === 2) return 60 * 60 * 1000
  if (attempts === 3) return 6 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

// Encola un mensaje (nunca lanza). Devuelve null si falla el insert.
export async function enqueueEmail(admin: SupabaseClient, input: EnqueueEmailInput): Promise<string | null> {
  const { data, error } = await admin
    .from('email_messages')
    .insert({
      recipient_type: input.recipientType,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_email: input.recipientEmail,
      recipient_name: input.recipientName ?? null,
      template_key: input.templateKey,
      subject: input.subject,
      html_body: input.htmlBody,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      event_type: input.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[notify/queue] enqueue error:', error.message)
    return null
  }
  return data.id as string
}

// Un mensaje en 'sending' más tiempo que esto se considera abandonado (la
// función que lo enviaba terminó antes de actualizarlo) y se puede reintentar.
export const SENDING_LEASE_MS = 10 * 60 * 1000

// Un mensaje que no salió en este plazo ya no tiene sentido enviarlo (avisos de
// vencimiento, recordatorios…): se marca 'failed' y el admin decide si reintentar.
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

/**
 * Filtro PostgREST de mensajes que se pueden tomar para enviar ahora:
 * en cola sin reintento programado o con reintento vencido, o en 'sending'
 * con la reserva vencida (o sin reserva, como los atascados de versiones viejas).
 */
export function claimableFilter(nowIso: string): string {
  const now = `"${nowIso}"`
  return [
    'and(status.eq.queued,next_retry_at.is.null)',
    `and(status.eq.queued,next_retry_at.lte.${now})`,
    'and(status.eq.sending,next_retry_at.is.null)',
    `and(status.eq.sending,next_retry_at.lte.${now})`,
  ].join(',')
}

// Reserva el mensaje de forma atómica: solo una ejecución lo puede enviar.
// next_retry_at guarda hasta cuándo dura la reserva.
async function claim(admin: SupabaseClient, id: string): Promise<boolean> {
  const now = Date.now()
  const { data, error } = await admin
    .from('email_messages')
    .update({ status: 'sending', next_retry_at: new Date(now + SENDING_LEASE_MS).toISOString() })
    .eq('id', id)
    .or(claimableFilter(new Date(now).toISOString()))
    .select('id')
  if (error) {
    console.error('[notify/queue] claim error:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

// Intenta enviar un mensaje una vez. Actualiza estado/attempts/next_retry_at.
async function attemptSend(admin: SupabaseClient, id: string): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  if (!(await claim(admin, id))) return 'skipped'

  const { data: row, error } = await admin.from('email_messages').select('*').eq('id', id).maybeSingle()
  if (error || !row) return 'skipped'

  const result = await sendViaSmtp(admin, {
    to: row.recipient_email,
    subject: row.subject,
    html: row.html_body,
  })

  if (result.ok) {
    await admin.from('email_messages').update({ status: 'sent', sent_at: new Date().toISOString(), next_retry_at: null, last_error: null }).eq('id', id)
    return 'sent'
  }

  const attempts = (row.attempts || 0) + 1
  const patch: Record<string, unknown> = { attempts, last_error: result.error }
  let outcome: 'retry' | 'failed'

  if (attempts >= (row.max_attempts || 3)) {
    patch.status = 'failed'
    patch.next_retry_at = null
    outcome = 'failed'
  } else {
    patch.status = 'queued'
    patch.next_retry_at = new Date(Date.now() + retryDelayMs(attempts)).toISOString()
    outcome = 'retry'
  }

  const { error: upErr } = await admin.from('email_messages').update(patch).eq('id', id)
  if (upErr) console.error('[notify/queue] update error:', upErr.message)
  return outcome
}

// Ejecuta el trabajo cuando termine la respuesta (after de Next.js), para que
// Vercel no corte el envío. Fuera de una petición (scripts, tests) lo corre ya.
function runAfterResponse(task: () => Promise<unknown>): void {
  const safe = () => task().catch(err => console.error('[notify/queue] background:', err))
  try {
    after(safe)
  } catch {
    void safe()
  }
}

// Encola y envía al terminar la respuesta; de paso procesa pendientes de la cola.
export async function enqueueAndSend(admin: SupabaseClient, input: EnqueueEmailInput): Promise<string | null> {
  const id = await enqueueEmail(admin, input)
  if (id) {
    runAfterResponse(async () => {
      await attemptSend(admin, id)
      await flushQueue(admin, 10)
    })
  }
  return id
}

// Marca como 'failed' los mensajes que llevan demasiado tiempo sin salir y nunca
// tuvieron programación (next_retry_at nulo): los atascados de versiones viejas o
// los que no se llegaron a tomar. Un reintento manual del admin programa
// next_retry_at, así que no se vuelve a vencer de inmediato.
export async function expireStale(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data, error } = await admin
    .from('email_messages')
    .update({ status: 'failed', next_retry_at: null, last_error: 'No se envió a tiempo (más de 48 h en cola). Reintenta desde el panel si aún aplica.' })
    .in('status', ['queued', 'sending'])
    .is('next_retry_at', null)
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.error('[notify/queue] expire error:', error.message)
    return 0
  }
  return data?.length ?? 0
}

// Procesa la cola: vence los muy viejos y envía los que estén listos.
export async function flushQueue(admin: SupabaseClient, max: number = 50): Promise<{ sent: number; failed: number; retry: number; expired: number }> {
  const out = { sent: 0, failed: 0, retry: 0, expired: 0 }
  out.expired = await expireStale(admin)

  const { data: rows, error } = await admin
    .from('email_messages')
    .select('id')
    .or(claimableFilter(new Date().toISOString()))
    .order('created_at', { ascending: true })
    .limit(max)

  if (error) {
    console.error('[notify/queue] flush select error:', error.message)
    return out
  }

  for (const row of rows || []) {
    const result = await attemptSend(admin, row.id)
    if (result === 'sent') out.sent++
    else if (result === 'failed') out.failed++
    else if (result === 'retry') out.retry++
  }
  return out
}

// Re-encola mensajes fallidos (el admin los puede reprocesar con un click).
export async function retryFailed(admin: SupabaseClient, ids?: string[]): Promise<number> {
  let query = admin.from('email_messages').select('id').eq('status', 'failed')
  if (ids && ids.length) query = query.in('id', ids)
  const { data: rows, error } = await query
  if (error || !rows) return 0
  await admin.from('email_messages')
    .update({ status: 'queued', attempts: 0, next_retry_at: new Date().toISOString(), last_error: null })
    .in('id', rows.map(r => r.id))
  return rows.length
}

// Devuelve true si ya existe un mensaje con esa dedupe_key (evita duplicados del cron).
export async function existsByDedupe(admin: SupabaseClient, dedupeKey: string): Promise<boolean> {
  const { data, error } = await admin
    .from('email_messages')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle()
  if (error) return false
  return !!data
}