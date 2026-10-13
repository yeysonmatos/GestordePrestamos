// Lógica server-side del panel admin (service role). Solo importable desde
// handlers de server functions via import dinámico: await import('@/lib/admin-api.server')
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/integrations/supabase/types'

type AdminClient = SupabaseClient

// ===================== GUARD =====================

export interface AdminCtx {
  admin: AdminClient
  userId: string
}

export async function requireAdmin(): Promise<AdminCtx> {
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const auth = getRequestHeaders().get('authorization') || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('No autenticado')
  const { data: ud, error: uErr } = await supabaseAdmin.auth.getUser(token)
  if (uErr || !ud?.user) throw new Error('No autenticado')
  const uid = ud.user.id
  const { data: au } = await supabaseAdmin
    .from('app_users')
    .select('role,status')
    .eq('id', uid)
    .maybeSingle()
  if (!au || au.role !== 'admin') throw new Error('Acceso denegado')
  if (au.status === 'blocked') throw new Error('Cuenta bloqueada')
  return { admin: supabaseAdmin as unknown as AdminClient, userId: uid }
}

/** Autentica a CUALQUIER usuario logueado (sin exigir rol admin). */
export async function requireAuth(): Promise<AdminCtx> {
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const auth = getRequestHeaders().get('authorization') || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('No autenticado')
  const { data: ud, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !ud?.user) throw new Error('No autenticado')
  return { admin: supabaseAdmin as unknown as AdminClient, userId: ud.user.id }
}

// ===================== SMTP =====================
export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  pass: string
  from_name: string
  from_email: string
  enabled: boolean
}

export async function getSmtpConfig(admin: AdminClient): Promise<SmtpConfig | null> {
  const { data } = await admin
    .from('smtp_config')
    .select('host, port, secure, username, pass, from_name, from_email, enabled')
    .limit(1)
    .maybeSingle()
  return (data as SmtpConfig | null) ?? null
}

export function isSmtpConfigured(cfg: SmtpConfig | null): boolean {
  return !!cfg && cfg.enabled && !!cfg.host && cfg.port > 0 && !!cfg.username && !!cfg.pass && !!cfg.from_email
}

export async function sendViaSmtp(
  admin: AdminClient,
  input: { to: string; subject: string; html: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getSmtpConfig(admin)
  if (!cfg || !isSmtpConfigured(cfg)) {
    return { ok: false, error: 'SMTP no configurado o deshabilitado' }
  }
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.username, pass: cfg.pass },
    })
    await transporter.sendMail({
      from: `${cfg.from_name} <${cfg.from_email}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    return { ok: true }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const sslHint = /wrong version number|SSL routines/i.test(raw)
      ? ' — Parece un problema del SSL: si usas puerto 587 (STARTTLS) la casilla "Conexión segura (SSL)" debe estar DESMARCADA. Si usas puerto 465, debe estar MARCADA.'
      : ''
    return { ok: false, error: raw + sslHint }
  }
}

// ===================== COLA DE CORREOS =====================

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

export function retryDelayMs(attempts: number): number {
  if (attempts <= 1) return 10 * 60 * 1000
  if (attempts === 2) return 60 * 60 * 1000
  if (attempts === 3) return 6 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

export async function enqueueEmail(admin: AdminClient, input: EnqueueEmailInput): Promise<string | null> {
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

export async function attemptSend(admin: AdminClient, id: string): Promise<void> {
  const { data: row, error } = await admin.from('email_messages').select('*').eq('id', id).maybeSingle()
  if (error || !row) return
  if (row.status === 'sent' || row.status === 'failed') return

  await admin.from('email_messages').update({ status: 'sending' }).eq('id', id)

  const result = await sendViaSmtp(admin, {
    to: row.recipient_email,
    subject: row.subject,
    html: row.html_body,
  })

  if (result.ok) {
    await admin
      .from('email_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
      .eq('id', id)
    return
  }

  const attempts = (row.attempts || 0) + 1
  const patch: { status?: string; attempts?: number; last_error?: string | null; next_retry_at?: string | null } = { attempts, last_error: result.error }
  if (attempts >= (row.max_attempts || 3)) {
    patch.status = 'failed'
    patch.next_retry_at = null
  } else {
    patch.status = 'queued'
    patch.next_retry_at = new Date(Date.now() + retryDelayMs(attempts)).toISOString()
  }
  const { error: upErr } = await admin.from('email_messages').update(patch).eq('id', id)
  if (upErr) console.error('[notify/queue] update error:', upErr.message)
}

export async function enqueueAndSend(admin: AdminClient, input: EnqueueEmailInput): Promise<string | null> {
  const id = await enqueueEmail(admin, input)
  if (id) {
    attemptSend(admin, id).catch(err => console.error('[notify/queue] attemptSend:', err))
  }
  return id
}

export async function retryFailed(admin: AdminClient, ids?: string[]): Promise<number> {
  let query = admin.from('email_messages').select('id').eq('status', 'failed')
  if (ids && ids.length) query = query.in('id', ids)
  const { data: rows, error } = await query
  if (error || !rows) return 0
  await admin
    .from('email_messages')
    .update({ status: 'queued', attempts: 0, next_retry_at: null })
    .in('id', rows.map(r => r.id))
  return rows.length
}

// ===================== PLANTILLAS (simplificadas, mismo estilo) =====================

function shell(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
  <h2 style="margin:0 0 12px;color:#2563EB;font-size:18px">${title}</h2>
  <div style="color:#334155;font-size:14px;line-height:1.6">${bodyHtml}</div>
  <p style="margin-top:24px;color:#94a3b8;font-size:12px">Gestor de Prestamos</p>
</div>`
}

// ===================== MÓDULOS =====================

// ---- Platform config (datos de pago) ----
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
const PC_FIELDS = 'bank_name, account_name, account_number, payment_phone'

export async function platformConfigGet() {
  const { admin } = await requireAdmin()
  const { data, error } = await admin.from('platform_config').select(PC_FIELDS).eq('id', SINGLETON_ID).maybeSingle()
  if (error) throw new Error(error.message)
  return { config: data || { bank_name: '', account_name: '', account_number: '', payment_phone: '' } }
}

export async function platformConfigUpdate(body: Record<string, unknown>) {
  const { admin } = await requireAdmin()
  const payload: Record<string, string> = {}
  for (const key of ['bank_name', 'account_name', 'account_number', 'payment_phone']) {
    if (typeof body[key] === 'string') payload[key] = body[key]
  }
  const { data, error } = await admin
    .from('platform_config')
    .upsert({ id: SINGLETON_ID, ...payload, updated_at: new Date().toISOString() })
    .select(PC_FIELDS)
    .single()
  if (error) throw new Error(error.message)
  return { ok: true, config: data }
}

// ---- Correos (cola) ----
export async function emailsList(q: { status?: string; q?: string; page?: number; page_size?: number }) {
  const { admin } = await requireAdmin()
  const status = q.status || ''
  const term = q.q || ''
  const page = Math.max(1, q.page || 1)
  const pageSize = Math.max(1, Math.min(100, q.page_size || 25))

  let query = admin
    .from('email_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (status && ['queued', 'sending', 'sent', 'failed'].includes(status)) query = query.eq('status', status)

  const [{ data, error }, countRes] = await Promise.all([
    query,
    admin.from('email_messages').select('id', { count: 'exact', head: true }),
  ])
  if (error) throw new Error(error.message)
  const rows = data || []
  const filtered = term
    ? rows.filter(
        r =>
          r.recipient_email.toLowerCase().includes(term.toLowerCase()) ||
          (r.recipient_name || '').toLowerCase().includes(term.toLowerCase()) ||
          r.subject.toLowerCase().includes(term.toLowerCase()),
      )
    : rows
  return { messages: filtered, total: countRes.count || 0, page, page_size: pageSize }
}

export async function emailsRetry(body: { ids?: string[] }) {
  const { admin } = await requireAdmin()
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string') : undefined
  const count = await retryFailed(admin, ids?.length ? ids : undefined)
  return { ok: true, requeued: count }
}

export async function emailsDelete(body: { ids?: string[]; status?: string }) {
  const { admin } = await requireAdmin()
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : undefined
  const status =
    body.status && ['queued', 'sending', 'sent', 'failed'].includes(body.status) ? body.status : undefined
  if ((!ids || !ids.length) && !status) throw new Error('Se requiere ids o status')
  let query = admin.from('email_messages').delete()
  if (ids && ids.length) query = query.in('id', ids)
  else query = query.eq('status', status!)
  const { data, error } = await query.select('id')
  if (error) throw new Error(error.message)
  return { ok: true, deleted: (data || []).length }
}

// ---- Recordatorios ----
export async function remindersList() {
  const { admin } = await requireAdmin()
  const [appUsersR, subsR, plansR] = await Promise.all([
    admin.from('app_users').select('id, display_name'),
    admin.from('subscriptions').select('*').not('status', 'eq', 'cancelled'),
    admin.from('plans').select('*'),
  ])
  const appErr = appUsersR.error, subErr = subsR.error, planErr = plansR.error
  if (appErr || subErr || planErr) throw new Error(appErr?.message || subErr?.message || planErr?.message || 'Error')

  const planMap = new Map((plansR.data || []).map(p => [p.id, p.name]))
  const nameMap = new Map((appUsersR.data || []).map(u => [u.id, u.display_name || null]))
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  const subsRows = subsR.data || []
  const latestByUser = new Map<string, (typeof subsRows)[number]>()
  for (const s of subsRows) {
    if (!(s.status === 'active' || s.status === 'trial' || s.status === 'expired')) continue
    const prev = latestByUser.get(s.user_id)
    if (!prev || new Date(s.created_at || '').getTime() >= new Date(prev.created_at || '').getTime()) {
      latestByUser.set(s.user_id, s)
    }
  }

  const reminders = Array.from(latestByUser.values())
    .map(s => {
      const ends = s.ends_at ? new Date(s.ends_at).getTime() : null
      const daysLeft = ends ? Math.ceil((ends - now) / dayMs) : null
      return {
        id: s.id,
        user_id: s.user_id,
        user_name: nameMap.get(s.user_id) || '—',
        plan_id: s.plan_id ?? '',
        plan_name: (s.plan_id && planMap.get(s.plan_id)) || '—',
        status: s.status,
        ends_at: s.ends_at,
        days_left: daysLeft,
      }
    })
    .filter(r => r.days_left !== null && (r.days_left <= 7 || r.status === 'expired'))
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))

  return { reminders }
}

export async function remindersSend(body: { subscription_ids?: string[] }) {
  const { admin, userId } = await requireAdmin()
  let ids: string[] = Array.isArray(body.subscription_ids) ? body.subscription_ids.filter(x => typeof x === 'string') : []
  let query = admin.from('subscriptions').select('id, user_id, status, ends_at, plans(name)').not('status', 'eq', 'cancelled')

  if (!ids.length) {
    const { data: all } = await admin.from('subscriptions').select('id, user_id, created_at').not('status', 'eq', 'cancelled')
    const latest = new Map<string, { id: string; created_at: string | null }>()
    for (const s of all || []) {
      const prev = latest.get(s.user_id)
      if (!prev || new Date(s.created_at as string).getTime() >= new Date(prev.created_at as string).getTime()) {
        latest.set(s.user_id, { id: s.id, created_at: s.created_at })
      }
    }
    ids = Array.from(latest.values()).map(s => s.id)
  }
  if (ids.length) query = query.in('id', ids)

  const { data: subs, error } = await query
  if (error) throw new Error(error.message)

  let sent = 0
  let failed = 0
  for (const s of subs || []) {
    const planEmbed = (s as unknown as { plans?: { name?: string } | { name?: string }[] | null }).plans
    const plan = Array.isArray(planEmbed) ? planEmbed[0] : planEmbed ?? null
    const { data: au } = await admin.auth.admin.getUserById(s.user_id)
    const email = au?.user?.email
    if (!email) { failed++; continue }
    const endsAt = typeof s.ends_at === 'string' ? s.ends_at : null
    const daysLeft = endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null
    const expired = daysLeft !== null && daysLeft <= 0
    const title = expired ? 'Tu suscripción ha vencido' : 'Tu suscripción vence pronto'
    const detail = expired
      ? `<p>Tu plan <strong>${plan?.name || 'actual'}</strong> venció el <strong>${(endsAt || '').slice(0, 10)}</strong>.</p><p>Para continuar usando Gestor de Prestamos contacta al administrador.</p>`
      : `<p>Tu plan <strong>${plan?.name || 'actual'}</strong> vence el <strong>${(endsAt || '').slice(0, 10)}</strong> (${daysLeft} día${daysLeft === 1 ? '' : 's'}).</p><p>Para renovar contacta al administrador.</p>`
    const id = await enqueueAndSend(admin, {
      recipientType: 'prestamista',
      recipientUserId: s.user_id,
      recipientEmail: email,
      recipientName: (au?.user?.user_metadata?.['display_name'] as string | undefined) || null,
      templateKey: 'plan_expiring',
      subject: title,
      htmlBody: shell(title, detail),
      eventType: 'subscription.expiring',
      entityType: 'subscription',
      entityId: s.id,
      dedupeKey: `expiring:${s.id}:${(endsAt || '').slice(0, 10)}:${userId}`,
    })
    if (id) sent++
    else failed++
  }
  return { ok: true, sent, failed }
}

// ---- SMTP config ----
const CONFIG_ID = '00000000-0000-0000-0000-00000000e601'

export async function smtpGet() {
  const { admin } = await requireAdmin()
  const { data } = await admin.from('smtp_config').select('*').eq('id', CONFIG_ID).maybeSingle()
  return {
    config: data
      ? {
          host: data.host,
          port: data.port,
          secure: data.secure,
          username: data.username,
          pass: '', // la contraseña NUNCA se devuelve al cliente
          from_name: data.from_name,
          from_email: data.from_email,
          enabled: data.enabled,
          configured: isSmtpConfigured(data as never),
        }
      : null,
  }
}

export async function smtpSave(body: Record<string, unknown>) {
  const { admin } = await requireAdmin()
  const patch: {
    host?: string; port?: number; secure?: boolean; username?: string; pass?: string;
    from_name?: string; from_email?: string; enabled?: boolean; updated_at?: string;
  } = {
    host: String(body['host'] ?? ''),
    port: Number(body['port'] ?? 587),
    secure: !!body['secure'],
    username: String(body['username'] ?? ''),
    from_name: String(body['from_name'] ?? 'Gestor de Prestamos'),
    from_email: String(body['from_email'] ?? ''),
    enabled: !!body['enabled'],
    updated_at: new Date().toISOString(),
  }
  if (typeof body['pass'] === 'string' && (body['pass'] as string).length > 0) patch.pass = body['pass'] as string
  const { error } = await admin.from('smtp_config').upsert({ id: CONFIG_ID, ...patch })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function smtpTest(body: { to?: string }) {
  const { admin } = await requireAdmin()
  const config = await getSmtpConfig(admin)
  if (!config || !isSmtpConfigured(config)) {
    return { ok: false, error: 'SMTP no configurado' }
  }
  const result = await sendViaSmtp(admin, {
    to: body.to && typeof body.to === 'string' ? body.to : config.from_email,
    subject: 'Prueba — Gestor de Prestamos',
    html: shell('Correo de prueba', '<p>Este es un correo de prueba de <strong>Gestor de Prestamos</strong>.</p><p>Si lo ves, tu configuración SMTP funciona correctamente.</p>'),
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

// ---- Soporte ----
export async function supportList(q: { status?: string; priority?: string; q?: string; user_id?: string; type?: string }) {
  const { admin } = await requireAdmin()
  let query = admin.from('support_tickets').select('*').order('updated_at', { ascending: false }).limit(200)
  if (q.status === 'open') query = query.in('status', ['open', 'replied'])
  else if (q.status === 'replied') query = query.eq('status', 'replied')
  else if (q.status === 'closed') query = query.eq('status', 'closed')
  if (q.priority && ['low', 'normal', 'high'].includes(q.priority)) query = query.eq('priority', q.priority)
  if (q.user_id) query = query.eq('user_id', q.user_id)
  if (q.type) query = query.eq('type', q.type)
  const { data, error } = await query
  if (error) throw new Error(error.message)

  const userIds = [...new Set((data || []).map(t => t.user_id))]
  const { data: profiles } = userIds.length
    ? await admin.from('app_users').select('id, display_name').in('id', userIds)
    : { data: [] }
  const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name || null]))

  let tickets = (data || []).map(t => ({
    id: t.id,
    subject: t.subject,
    body: t.body,
    status: t.status,
    priority: t.priority,
    type: t.type,
    created_at: t.created_at,
    updated_at: t.updated_at,
    closed_at: t.closed_at,
    user_id: t.user_id,
    author_name: nameMap.get(t.user_id) || null,
  }))
  if (q.q) {
    const term = q.q.toLowerCase()
    tickets = tickets.filter(
      t => (t.subject || '').toLowerCase().includes(term) || (t.author_name || '').toLowerCase().includes(term),
    )
  }
  return { tickets }
}

export async function supportGet(id: string) {
  const { admin } = await requireAdmin()
  const [tRes, mRes] = await Promise.all([
    admin.from('support_tickets').select('*').eq('id', id).maybeSingle(),
    admin.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
  ])
  if (tRes.error) throw new Error(tRes.error.message)
  if (mRes.error) throw new Error(mRes.error.message)
  const t = tRes.data
  let authorName: string | null = null
  if (t?.user_id) {
    const { data: prof } = await admin.from('app_users').select('display_name').eq('id', t.user_id).maybeSingle()
    authorName = prof?.display_name || null
  }
  const ticket = t
    ? {
        id: t.id,
        subject: t.subject,
        body: t.body,
        status: t.status,
        priority: t.priority,
        type: t.type,
        attachments: t.attachments || [],
        created_at: t.created_at,
        user_id: t.user_id,
        author_name: authorName,
      }
    : null
  return { ticket, messages: mRes.data || [] }
}

export async function supportReply(body: { id: string; body?: string; attachments?: { path: string; name: string; mime_type?: string; size?: number }[] }) {
  const { admin, userId } = await requireAdmin()
  const text = (body.body ?? '').trim()
  const files = Array.isArray(body.attachments) ? body.attachments : []
  if (!text && files.length === 0) throw new Error('Mensaje es requerido')
  const { data: msg, error: insErr } = await admin
    .from('support_messages')
    .insert({ ticket_id: body.id, user_id: userId, body: text, is_staff: true, attachments: files })
    .select()
    .single()
  if (insErr) throw new Error(insErr.message)
  await admin.from('support_tickets').update({ status: 'replied' }).eq('id', body.id)

  try {
    const { data: tRes } = await admin.from('support_tickets').select('user_id, subject').eq('id', body.id).single()
    if (tRes) {
      const { data: au } = await admin.auth.admin.getUserById(tRes.user_id)
      const email = au?.user?.email
      if (email) {
        await enqueueAndSend(admin, {
          recipientType: 'prestamista',
          recipientUserId: tRes.user_id,
          recipientEmail: email,
          recipientName: (au?.user?.user_metadata?.['display_name'] as string | undefined) || null,
          templateKey: 'ticket_reply',
          subject: `Respuesta a tu solicitud: ${tRes.subject}`,
          htmlBody: shell('Nueva respuesta', `<p>El equipo respondió tu solicitud "<strong>${tRes.subject}</strong>". Entra a la sección de soporte para ver la respuesta.</p>`),
          eventType: 'support.reply',
          entityType: 'ticket',
          entityId: body.id,
          dedupeKey: `reply:${body.id}:${msg.id}`,
        })
      }
    }
  } catch (err) {
    console.error('[admin notify]', err)
  }
  return { message: msg }
}

export async function supportUpdate(body: { id: string; status?: string; priority?: string }) {
  const { admin, userId } = await requireAdmin()
  if (!body.id) throw new Error('Falta id')
  const patch: { status?: string; priority?: string; closed_at?: string | null } = {}
  if (body.status) patch.status = body.status
  if (body.priority) patch.priority = body.priority
  if (body.status === 'closed') patch.closed_at = new Date().toISOString()
  if (body.status === 'open') patch.closed_at = null
  const { error } = await admin.from('support_tickets').update(patch).eq('id', body.id)
  if (error) throw new Error(error.message)

  if (body.status === 'closed') {
    const { data: ticket } = await admin.from('support_tickets').select('user_id, subject').eq('id', body.id).maybeSingle()
    if (ticket) {
      try {
        const { data: au } = await admin.auth.admin.getUserById(ticket.user_id)
        const email = au?.user?.email
        if (email) {
          await enqueueAndSend(admin, {
            recipientType: 'prestamista',
            recipientUserId: ticket.user_id,
            recipientEmail: email,
      recipientName: (au?.user?.user_metadata?.['display_name'] as string | undefined) || null,
            templateKey: 'ticket_closed',
            subject: `Solicitud cerrada: ${ticket.subject}`,
            htmlBody: shell('Solicitud cerrada', `<p>Tu solicitud "<strong>${ticket.subject}</strong>" fue marcada como resuelta.</p>`),
            eventType: 'support.closed',
            entityType: 'ticket',
            entityId: body.id,
            dedupeKey: `closed:${body.id}:${userId}`,
          })
        }
      } catch (err) {
        console.error('[admin support] notify closed:', err)
      }
    }
  }
  return { ok: true }
}

/**
 * Avisa por correo AL ADMIN cuando un suscriptor abre un ticket o responde.
 * (Las respuestas del admin al suscriptor ya se notifican en supportReply.)
 */
export async function supportNotifyAdmin(body: {
  ticketId: string
  kind?: 'created' | 'reply'
  message?: string
}) {
  const { admin, userId } = await requireAuth()
  const id = String(body.ticketId || '')
  if (!id) throw new Error('Falta ticketId')
  const kind: 'created' | 'reply' = body.kind === 'reply' ? 'reply' : 'created'

  // El ticket debe pertenecer al usuario que llama (evita avisos ajenos).
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, user_id, subject, body, priority')
    .eq('id', id)
    .maybeSingle()
  if (!ticket || ticket.user_id !== userId) throw new Error('Ticket no encontrado')

  const { data: adm } = await admin.from('app_users').select('id').eq('role', 'admin').limit(1).maybeSingle()
  if (!adm) return { ok: false }
  const { data: au } = await admin.auth.admin.getUserById(adm.id)
  const adminEmail = au?.user?.email
  if (!adminEmail) return { ok: false }

  const { data: st } = await admin.from('settings').select('business_name').eq('user_id', userId).maybeSingle()
  const { data: caller } = await admin.auth.admin.getUserById(userId)
  const name = st?.business_name || caller?.user?.email || 'Un suscriptor'

  const raw = kind === 'reply' ? body.message || '' : ticket.body || ''
  const text = raw.slice(0, 800).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const title = kind === 'reply' ? 'Nueva respuesta de un suscriptor' : 'Nueva solicitud de soporte'
  const subject =
    kind === 'reply'
      ? `Respuesta de ${name}: ${ticket.subject}`
      : `Nueva solicitud de soporte: ${ticket.subject}`

  await enqueueAndSend(admin, {
    recipientType: 'admin',
    recipientEmail: adminEmail,
    templateKey: kind === 'reply' ? 'ticket_user_reply' : 'ticket_created',
    subject,
    htmlBody: shell(
      title,
      `<p><strong>${name}</strong> ${kind === 'reply' ? 'respondió a' : 'abrió'} la solicitud "<strong>${ticket.subject}</strong>" (prioridad ${ticket.priority || 'normal'}).</p>` +
        `<div style="margin:12px 0;padding:12px;border-left:3px solid #2563EB;background:#f8fafc;white-space:pre-wrap">${text}</div>` +
        `<p>Revísalo en el panel de administración, sección Soporte.</p>`,
    ),
    eventType: kind === 'reply' ? 'support.user_reply' : 'support.created',
    entityType: 'ticket',
    entityId: id,
    dedupeKey: kind === 'created' ? `admin-ticket:${id}` : null,
  })
  return { ok: true }
}


// ===================== DATOS GLOBALES (service role) =====================

function planKeyOf(name: string): string {
  const n = (name || '').toLowerCase()
  if (n.startsWith('trial') || n.startsWith('grat')) return 'trial'
  if (n.startsWith('bas')) return 'basico'
  if (n.startsWith('pro')) return 'pro'
  return n
}

const STATUS_UI_MAP: Record<string, string> = {
  trial: 'prueba',
  active: 'activo',
  expired: 'suspendido',
  cancelled: 'suspendido',
}

function esActivo(status: string) {
  return status !== 'paid' && status !== 'cancelled'
}

export async function dashboardData() {
  const { admin } = await requireAdmin()
  const [subsR, settingsR, clientsR, loansR, paymentsR, plansR, usersR, subPaysR] = await Promise.all([
    admin.from('subscriptions').select('*').order('created_at', { ascending: false }),
    admin.from('settings').select('user_id, business_name, personal_name, business_phone'),
    admin.from('clients').select('id, user_id'),
    admin.from('loans').select('id, user_id, amount, status, deleted_at'),
    admin.from('payments').select('id, user_id, amount, interest_amount, late_amount, status').neq('status', 'reversed'),
    admin.from('plans').select('id, name, price'),
    admin.from('app_users').select('id, status, display_name, role'),
    admin.from('subscription_payments').select('id, user_id, amount, status, payment_date, created_at'),
  ])
  const err = subsR.error ?? settingsR.error ?? clientsR.error ?? loansR.error ?? paymentsR.error ?? plansR.error ?? usersR.error ?? subPaysR.error
  if (err) throw new Error(err.message)

  const blockedBy = new Map<string, boolean>()
  const displayBy = new Map<string, string>()
  const adminIds = new Set<string>()
  for (const u of usersR.data ?? []) {
    blockedBy.set(u.id, u.status === 'blocked')
    if (u.display_name) displayBy.set(u.id, u.display_name)
    if (u.role === 'admin') adminIds.add(u.id)
  }
  const planById = new Map((plansR.data ?? []).map(p => [p.id, p]))
  const byUserSetting = new Map<string, NonNullable<typeof settingsR.data>[number]>()
  for (const s of settingsR.data ?? []) byUserSetting.set(s.user_id, s)
  const clientsByUser = new Map<string, number>()
  for (const c of clientsR.data ?? []) clientsByUser.set(c.user_id, (clientsByUser.get(c.user_id) ?? 0) + 1)

  const nameFor = (uid: string) =>
    byUserSetting.get(uid)?.business_name || displayBy.get(uid) || 'Mi Negocio'

  // Estadisticas GLOBALES de pagos de suscripcion (no dependen de la pagina 1 del listado).
  const monthKeys: string[] = []
  {
    const now = new Date()
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
  }
  const byMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))
  const counts = { pending: 0, confirmed: 0, rejected: 0 }
  let totalCobrado = 0
  const confirmados = new Set<string>()
  for (const x of subPaysR.data ?? []) {
    const st = String(x.status)
    if (st === 'pending' || st === 'confirmed' || st === 'rejected') counts[st] += 1
    if (st === 'confirmed') {
      totalCobrado += Number(x.amount)
      if (x.user_id) confirmados.add(x.user_id)
      const k = String(x.payment_date ?? '').slice(0, 7)
      if (k in byMonth) byMonth[k] = (byMonth[k] ?? 0) + Number(x.amount)
    }
  }
  const recientes = (subPaysR.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        String(b.payment_date ?? '').localeCompare(String(a.payment_date ?? '')) ||
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    )
    .slice(0, 8)
    .map((x) => ({
      id: x.id,
      business_name: nameFor(x.user_id),
      amount: Number(x.amount),
      status: String(x.status),
      payment_date: x.payment_date as string | null,
    }))

  const seen = new Set<string>()
  const negocios = [] as {
    id: string; business_name: string; owner_name: string | null; phone: string | null
    plan: string; plan_display: string; plan_status: string; plan_renews_at: string | null; created_at: string
    plan_price: number
    clientes: number; prestamos: number; prestamosActivos: number
    capital: number; cobrado: number; ingreso: number; blocked: boolean
  }[]
  for (const sub of subsR.data ?? []) {
    if (seen.has(sub.user_id)) continue
    if (adminIds.has(sub.user_id)) continue
    seen.add(sub.user_id)
    const set = byUserSetting.get(sub.user_id)
    const planName = sub.plan_id ? planById.get(sub.plan_id)?.name ?? '' : ''
    const misLoans = (loansR.data ?? []).filter(l => l.user_id === sub.user_id && !l.deleted_at)
    const misPagos = (paymentsR.data ?? []).filter(x => x.user_id === sub.user_id)
    negocios.push({
      id: sub.user_id,
      business_name: set?.business_name || displayBy.get(sub.user_id) || 'Mi Negocio',
      owner_name: set?.personal_name || displayBy.get(sub.user_id) || null,
      phone: set?.business_phone || null,
      plan: planKeyOf(planName),
      plan_display: planName || "Sin plan",
      plan_status: STATUS_UI_MAP[sub.status] ?? 'suspendido',
      plan_renews_at: sub.ends_at,
      plan_price: Number(sub.plan_id ? planById.get(sub.plan_id)?.price ?? 0 : 0),
      created_at: sub.starts_at ?? new Date().toISOString(),
      clientes: clientsByUser.get(sub.user_id) ?? 0,
      prestamos: misLoans.length,
      prestamosActivos: misLoans.filter(l => esActivo(l.status ?? '')).length,
      capital: misLoans.reduce((s, l) => s + Number(l.amount), 0),
      cobrado: misPagos.reduce((s, x) => s + Number(x.amount), 0),
      ingreso: misPagos.reduce((s, x) => s + Number(x.interest_amount) + Number(x.late_amount), 0),
      blocked: blockedBy.get(sub.user_id) ?? false,
    })
  }

  return {
    negocios,
    totalPrestamos: (loansR.data ?? []).length,
    totalClientes: (clientsR.data ?? []).length,
    totalPagos: (paymentsR.data ?? []).length,
    planPrices: (plansR.data ?? []).map(p => ({ name: p.name, price: p.price })),
    pagosStats: { monthKeys, byMonth, counts, totalCobrado, confirmadosUsers: confirmados.size, recientes },
  }
}

// ---- Planes con suscritos correctos (ultima sub no cancelada por usuario) ----
export async function plansList() {
  const { admin } = await requireAdmin()
  const [plansR, subsR] = await Promise.all([
    admin.from('plans').select('*').order('price', { ascending: true }),
    admin.from('subscriptions').select('user_id, plan_id, status, created_at').neq('status', 'cancelled'),
  ])
  if (plansR.error) throw new Error(plansR.error.message)
  const latestByUser = new Map<string, { plan_id: string; created_at: string }>()
  for (const s of subsR.data ?? []) {
    if (!s.plan_id || !s.user_id) continue
    const prev = latestByUser.get(s.user_id)
    if (!prev || new Date(s.created_at || '').getTime() >= new Date(prev.created_at).getTime()) {
      latestByUser.set(s.user_id, { plan_id: s.plan_id, created_at: s.created_at || '' })
    }
  }
  const byPlan = new Map<string, number>()
  for (const v of latestByUser.values()) byPlan.set(v.plan_id, (byPlan.get(v.plan_id) ?? 0) + 1)
  return { plans: (plansR.data ?? []).map(p => ({ ...p, clients: byPlan.get(p.id) ?? 0 })) }
}

// ===================== AUDITORIA (estilo GP) =====================

export interface AuditEntryData {
  id: string
  user_id: string | null
  user_name: string
  role: string
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Json | null
  created_at: string | null
}

export async function auditList(opts: {
  limit?: number
  user?: string
  action?: string
  entity?: string
  q?: string
  from?: string
  to?: string
}) {
  const { admin } = await requireAdmin()
  const limit = Math.max(1, Math.min(200, opts.limit || 50))
  let query = admin
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts.user) query = query.eq('user_id', opts.user)
  if (opts.action) query = query.eq('action', opts.action)
  if (opts.entity) query = query.eq('entity_type', opts.entity)
  if (opts.from) query = query.gte('created_at', new Date(opts.from).toISOString())
  if (opts.to) query = query.lte('created_at', new Date(opts.to + 'T23:59:59.999').toISOString())

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const { data: allUsers } = await admin.from('app_users').select('id, display_name, role')
  const nameMap = new Map((allUsers ?? []).map(u => [u.id, u.display_name || null]))
  const roleMap = new Map((allUsers ?? []).map(u => [u.id, u.role || 'client']))

  let rows: AuditEntryData[] = (data ?? []).map(l => ({
    id: l.id,
    user_id: l.user_id,
    user_name: (l.user_id && nameMap.get(l.user_id)) || '—',
    role: (l.user_id && roleMap.get(l.user_id)) || 'client',
    action: l.action,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    details:
      l.details && typeof l.details === 'object' && !Array.isArray(l.details)
        ? (l.details as Json)
        : null,
    created_at: l.created_at,
  }))

  if (opts.q) {
    const term = opts.q.toLowerCase()
    rows = rows.filter(
      e =>
        (e.user_name || '').toLowerCase().includes(term) ||
        e.action.toLowerCase().includes(term) ||
        (e.entity_type || '').toLowerCase().includes(term),
    )
  }

  const users = (allUsers ?? []).map(u => ({ id: u.id, label: u.display_name || u.id }))
  return { rows, total: count ?? rows.length, users }
}

// ---- Pagos de suscripcion con nombres reales (service role) ----
export interface PaymentRowData {
  id: string
  amount: number
  status: string
  method: string
  payment_date: string | null
  notes: string | null
  created_at: string | null
  user_id: string
  target_plan_id: string | null
  business_name: string
  plan_name: string
}

export interface PaymentFilters {
  month?: string
  method?: string
  user_id?: string
  status?: string
  page?: number
  page_size?: number
}

function firstOfNextMonthYm(month: string): string {
  const parts = month.split("-").map(Number)
  const y = parts[0] ?? 2026
  const m = parts[1] ?? 1
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
}

async function paymentsCore(opts: PaymentFilters, allRows: boolean) {
  const { admin } = await requireAdmin()
  let query = admin
    .from('subscription_payments')
    .select('*', { count: 'exact' })
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    query = query.gte('payment_date', `${opts.month}-01`).lt('payment_date', firstOfNextMonthYm(opts.month))
  }
  if (opts.method && ['cash', 'transfer', 'deposit', 'other'].includes(opts.method)) query = query.eq('method', opts.method)
  if (opts.user_id) query = query.eq('user_id', opts.user_id)
  if (opts.status && ['pending', 'confirmed', 'rejected'].includes(opts.status)) query = query.eq('status', opts.status)

  const page = Math.max(1, opts.page || 1)
  const pageSize = Math.max(1, Math.min(100, opts.page_size || 20))
  if (!allRows) query = query.range((page - 1) * pageSize, page * pageSize - 1)

  const [payR, settingsR, subsR, plansR, usersR, allPayR] = await Promise.all([
    query,
    admin.from('settings').select('user_id, business_name'),
    admin.from('subscriptions').select('user_id, plan_id, created_at').order('created_at', { ascending: false }),
    admin.from('plans').select('id, name'),
    admin.from('app_users').select('id, display_name'),
    admin.from('subscription_payments').select('status, amount'),
  ])
  const err = payR.error ?? settingsR.error ?? subsR.error ?? plansR.error
  if (err) throw new Error(err.message)

  const displayBy = new Map((usersR.data ?? []).map(u => [u.id, u.display_name || '']))
  const settingsBy = new Map<string, string>()
  for (const s of settingsR.data ?? []) {
    if (!settingsBy.has(s.user_id)) settingsBy.set(s.user_id, s.business_name || '')
  }
  const planById = new Map<string, string>()
  for (const p of plansR.data ?? []) if (p.id) planById.set(p.id, p.name ?? '')
  const byUserPlan = new Map<string, string>()
  for (const s of subsR.data ?? []) {
    if (!byUserPlan.has(s.user_id) && s.plan_id) byUserPlan.set(s.user_id, planById.get(s.plan_id) ?? '')
  }
  const nameFor = (uid: string) => settingsBy.get(uid) || displayBy.get(uid) || 'Mi Negocio'

  const items: PaymentRowData[] = (payR.data ?? []).map((x) => ({
    id: x.id,
    amount: Number(x.amount),
    status: x.status,
    method: x.method,
    payment_date: x.payment_date,
    notes: x.notes,
    created_at: x.created_at,
    user_id: x.user_id,
    target_plan_id: x.target_plan_id,
    business_name: nameFor(x.user_id),
    plan_name: x.target_plan_id ? planById.get(x.target_plan_id) ?? byUserPlan.get(x.user_id) ?? '' : byUserPlan.get(x.user_id) ?? '',
  }))

  // Conteos globales (sin filtros), igual que GP
  const counts = { pending: 0, confirmed: 0, rejected: 0 }
  let total = 0
  for (const x of allPayR.data ?? []) {
    const st = x.status as string
    if (st === 'pending' || st === 'confirmed' || st === 'rejected') counts[st] += 1
    if (st === 'confirmed') total += Number(x.amount)
  }

  return { items, counts, total, total_rows: payR.count ?? items.length, page, page_size: pageSize }
}

export async function paymentsList(opts: PaymentFilters = {}) {
  return paymentsCore(opts, false)
}

export async function paymentsExport(opts: PaymentFilters = {}) {
  const res = await paymentsCore({ ...opts, page_size: 100 }, true)
  return { items: res.items }
}

// ===================== SUSCRIPCIONES / NOTIFICACIONES =====================

async function userEmailOf(admin: AdminClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

function fechaRD(iso: string | null | undefined): string {
  if (!iso) return ""
  const p = iso.slice(0, 10).split("-")
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso.slice(0, 10)
}

const PLAN_NAME_BY_KEY: Record<string, string> = {
  trial: "Trial",
  gratis: "Trial",
  basico: "Básico",
  pro: "Pro",
  ilimitado: "Pro",
}

/** Asigna/renueva plan: crea suscripción nueva (historial) + auditoría + correo. */
export async function assignPlanAction(o: { userId: string; plan: string; estado: string }) {
  const { admin } = await requireAdmin()
  const wantName = PLAN_NAME_BY_KEY[o.plan] ?? o.plan
  const { data: planRow, error: pErr } = await admin
    .from("plans")
    .select("id, name, price, billing_cycle")
    .ilike("name", wantName)
    .limit(1)
    .maybeSingle()
  if (pErr) throw new Error(pErr.message)
  if (!planRow) throw new Error(`No existe el plan "${wantName}"`)

  const isTrial = /trial|prueba/i.test(planRow.name ?? "")
  let status: "trial" | "active" | "cancelled" = "active"
  if (o.estado === "prueba") status = "trial"
  else if (o.estado === "suspendido") status = "cancelled"
  else if (isTrial) status = "trial"

  const now = new Date()
  const endsAt =
    status === "cancelled"
      ? null
      : status === "trial"
        ? new Date(now.getTime() + 14 * 86400000).toISOString()
        : Number(planRow.price) === 0
          ? null // plan de cortesía (0): acceso completo sin vencimiento ni mensualidad
          : new Date(now.getTime() + (planRow.billing_cycle === "yearly" ? 365 : 30) * 86400000).toISOString()

  const { data: created, error: insErr } = await admin
    .from("subscriptions")
    .insert({
      user_id: o.userId,
      plan_id: planRow.id,
      status,
      starts_at: now.toISOString(),
      ends_at: endsAt,
    })
    .select("id")
    .single()
  if (insErr) throw new Error(insErr.message)

  await admin.from("audit_logs").insert({
    user_id: o.userId,
    action: "subscription.plan_assigned",
    entity_type: "subscription",
    entity_id: created?.id ?? null,
    details: { plan: planRow.name, estado: o.estado, ends_at: endsAt?.slice(0, 10) ?? null },
  })

  notifyPlanAssignedInner(admin, o.userId, planRow.name ?? wantName, endsAt).catch(() => {})
  return { ok: true, ends_at: endsAt }
}

async function notifyPlanAssignedInner(admin: AdminClient, userId: string, planName: string, endsAt: string | null) {
  const email = await userEmailOf(admin, userId)
  if (!email) return
  const body = `<p>Tu suscripción ahora está en el plan <strong>${planName}</strong>${endsAt ? `, con vencimiento el <strong>${fechaRD(endsAt)}</strong>` : ""}.</p><p>Gracias por confiar en Gestor de Prestamos.</p>`
  await enqueueAndSend(admin, {
    recipientType: "prestamista",
    recipientUserId: userId,
    recipientEmail: email,
    templateKey: "plan_updated",
    subject: "Tu plan fue actualizado",
    htmlBody: shell("Plan actualizado", body),
    eventType: "plan.updated",
    entityType: "subscription",
    entityId: userId,
  })
}

/** Aviso por correo tras confirmar un pago (helper interno reutilizable). */
async function sendPaymentApprovedNotice(
  admin: AdminClient,
  o: { userId: string; amount: number; planName?: string; endsAt?: string | null },
) {
  const email = await userEmailOf(admin, o.userId)
  if (!email) return false
  const rd = `${Number(o.amount).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`
  const body = `<p>Tu pago de <strong>${rd}</strong>${o.planName ? ` por el plan <strong>${o.planName}</strong>` : ""} fue confirmado.</p>${o.endsAt ? `<p>Tu suscripción está activa hasta el <strong>${fechaRD(o.endsAt)}</strong>.</p>` : ""}`
  await enqueueAndSend(admin, {
    recipientType: "prestamista",
    recipientUserId: o.userId,
    recipientEmail: email,
    templateKey: "payment_approved",
    subject: "Tu pago fue confirmado",
    htmlBody: shell("Pago confirmado", body),
    eventType: "payment.approved",
    entityType: "subscription",
    entityId: o.userId,
  })
  return true
}

export async function notifyPaymentApproved(o: { userId: string; amount: number; planName?: string; endsAt?: string | null }) {
  const { admin } = await requireAdmin()
  return { ok: await sendPaymentApprovedNotice(admin, o) }
}

/**
 * Confirma un pago de forma ATÓMICA (service role):
 * gate "solo si sigue pendiente" antes de tocar la suscripción → imposible doble-confirmación.
 */
export async function confirmPaymentAction(paymentId: string) {
  const { admin } = await requireAdmin()
  const { data: pay } = await admin
    .from("subscription_payments")
    .select("id, user_id, amount, target_plan_id, subscription_id, status, subscription:subscriptions(id, plan_id, ends_at, status)")
    .eq("id", paymentId)
    .maybeSingle()
  if (!pay) throw new Error("Pago no encontrado")
  if (pay.status !== "pending") throw new Error("Ese pago ya fue procesado")
  const subRaw = pay.subscription as unknown
  const subObj = (Array.isArray(subRaw) ? subRaw[0] : subRaw) as
    | { id: string; plan_id: string; ends_at: string | null; status: string }
    | null
    | undefined
  const sub = subObj ?? null
  if (!sub) throw new Error("El pago no tiene suscripción asociada")

  const planIds = [pay.target_plan_id ?? "", sub.plan_id].filter(Boolean)
  const { data: plans } = await admin.from("plans").select("id, name, billing_cycle").in("id", planIds)
  const planById = new Map((plans ?? []).map((p) => [p.id, p]))
  const resolvedPlanId = pay.target_plan_id ?? sub.plan_id
  const isUpgrade = !!(pay.target_plan_id && pay.target_plan_id !== sub.plan_id)

  // Gate atómico: solo se pasa a confirmed si sigue pendiente.
  const { data: flipped } = await admin
    .from("subscription_payments")
    .update({ status: "confirmed" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
  if (!flipped || flipped.length === 0) throw new Error("Ese pago ya fue procesado")

  const cycle = planById.get(resolvedPlanId)?.billing_cycle ?? "monthly"
  let newEnd = sub.ends_at
  if (!isUpgrade) {
    const baseMs =
      sub.ends_at && new Date(sub.ends_at).getTime() > Date.now()
        ? new Date(sub.ends_at).getTime()
        : Date.now()
    newEnd = new Date(baseMs + (cycle === "yearly" ? 365 : 30) * 86400000).toISOString()
  }
  const { error: subErr } = await admin
    .from("subscriptions")
    .update({ plan_id: resolvedPlanId, status: "active", ends_at: newEnd, updated_at: new Date().toISOString() })
    .eq("id", sub.id)
  if (subErr) throw new Error(subErr.message)

  await admin.from("audit_logs").insert({
    user_id: pay.user_id,
    action: "subscription.payment_confirmed",
    entity_type: "subscription",
    entity_id: sub.id,
    details: { amount: Number(pay.amount), payment_id: paymentId, upgraded: isUpgrade },
  })

  sendPaymentApprovedNotice(admin, {
    userId: pay.user_id,
    amount: Number(pay.amount),
    planName: planById.get(resolvedPlanId)?.name,
    endsAt: newEnd,
  }).catch(() => {})

  return { ok: true, ends_at: newEnd }
}

/** Procesa la cola de correos: enviados + reintenta pendientes (incluye next_retry_at NULL). */
export async function flushQueueAction(max = 20) {
  const { admin } = await requireAdmin()
  const now = new Date().toISOString()
  const { data: rows, error } = await admin
    .from("email_messages")
    .select("id")
    .in("status", ["queued", "sending"])
    .or(`next_retry_at.lte.${now},next_retry_at.is.null`)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, max)))
  if (error) throw new Error(error.message)
  if (!rows || !rows.length) return { sent: 0, failed: 0, done: 0 }
  for (const r of rows) await attemptSend(admin, r.id)
  const { data: after } = await admin.from("email_messages").select("status").in("id", rows.map((r) => r.id))
  const st = after ?? []
  return {
    sent: st.filter((x) => x.status === "sent").length,
    failed: st.filter((x) => x.status === "failed").length,
    done: st.length,
  }
}

/** Extiende la suscripción vigente N días desde el vencimiento (o desde hoy). */
export async function extendSubscription(o: { userId: string; days: number }) {
  const { admin } = await requireAdmin()
  const days = Math.max(1, Math.floor(Number(o.days) || 30))
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, status, ends_at")
    .eq("user_id", o.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!sub) throw new Error("El usuario no tiene suscripción")
  const now = Date.now()
  const base = sub.ends_at && new Date(sub.ends_at).getTime() > now ? new Date(sub.ends_at).getTime() : now
  const newEnd = new Date(base + days * 86400000).toISOString()
  const patch: { ends_at: string; status?: string; updated_at?: string } = { ends_at: newEnd, updated_at: new Date().toISOString() }
  if (sub.status === "expired" || sub.status === "cancelled") patch.status = "active"
  const { error } = await admin.from("subscriptions").update(patch).eq("id", sub.id)
  if (error) throw new Error(error.message)
  await admin.from("audit_logs").insert({
    user_id: o.userId,
    action: "subscription.extended",
    entity_type: "subscription",
    entity_id: sub.id,
    details: { days, ends_at: newEnd.slice(0, 10) },
  })
  return { ok: true, ends_at: newEnd }
}

/** Historial de suscripciones de un usuario (para su ficha). */
export async function userSubscriptions(userId: string) {
  const { admin } = await requireAdmin()
  const [subsR, plansR] = await Promise.all([
    admin.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    admin.from("plans").select("id, name"),
  ])
  if (subsR.error) throw new Error(subsR.error.message)
  const planById = new Map((plansR.data ?? []).map((p) => [p.id, p.name ?? ""]))
  return {
    subscriptions: (subsR.data ?? []).map((s) => ({
      id: s.id,
      plan_name: (s.plan_id && planById.get(s.plan_id)) || "—",
      status: s.status,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      created_at: s.created_at,
    })),
  }
}

/** Reenvía al usuario el correo para definir/restablecer su clave. */
export async function resendPasswordEmail(o: { userId: string; redirect?: string }) {
  const { admin } = await requireAdmin()
  const email = await userEmailOf(admin, o.userId)
  if (!email) throw new Error("No hay correo registrado para este usuario")
  const { error } = await admin.auth.resetPasswordForEmail(email, o.redirect ? { redirectTo: o.redirect } : undefined)
  if (error) throw new Error(error.message)
  return { ok: true }
}


/** Autenticación de cualquier usuario (sin exigir rol admin) para actions de suscriptor. */
async function requireCaller(): Promise<{ admin: AdminClient; userId: string }> {
  const { getRequestHeaders } = await import("@tanstack/react-start/server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const auth = getRequestHeaders().get("authorization") || "";
  const token = String(auth).replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("No autenticado");
  const { data: ud, error: uErr } = await supabaseAdmin.auth.getUser(token);
  if (uErr || !ud?.user) throw new Error("No autenticado");
  return { admin: supabaseAdmin as unknown as AdminClient, userId: ud.user.id };
}

/** El suscriptor avisa al admin que solicitó un cambio de plan (correo). */
export async function notifyAdminUpgradeRequest(o: { paymentId: string }) {
  const { admin, userId } = await requireCaller();
  const { data: pay } = await admin
    .from("subscription_payments")
    .select("id, user_id, amount, notes")
    .eq("id", o.paymentId)
    .maybeSingle();
  if (!pay) throw new Error("Pago no encontrado");
  if (pay.user_id !== userId) throw new Error("Acceso denegado");

  const { data: adm } = await admin.from("app_users").select("id").eq("role", "admin").limit(1).maybeSingle();
  if (!adm) return { ok: false };
  const email = await userEmailOf(admin, adm.id);
  if (!email) return { ok: false };

  const { data: business } = await admin.from("settings").select("business_name").eq("user_id", userId).maybeSingle();
  const name = business?.business_name || "Un suscriptor";
  const rd = `${Number(pay.amount).toLocaleString("es-DO", { maximumFractionDigits: 0 })}`;
  await enqueueAndSend(admin, {
    recipientType: "admin",
    recipientEmail: email,
    templateKey: "upgrade_request",
    subject: "Nueva solicitud de cambio de plan",
    htmlBody: shell(
      "Solicitud de cambio de plan",
      `<p><strong>${name}</strong> solicitó un cambio de plan por <strong>${rd}</strong>.${pay.notes ? ` (${pay.notes})` : ""}</p><p>Revísalo en el panel de administración, sección Pagos.</p>`,
    ),
    eventType: "upgrade.request",
    entityType: "subscription_payment",
    entityId: pay.id,
  });
  return { ok: true };
}
