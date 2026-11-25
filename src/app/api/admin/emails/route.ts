import { NextRequest, NextResponse, after } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { retryFailed, flushQueue } from '@/lib/notify/queue'

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || ''
  const event = searchParams.get('event') || ''
  const q = searchParams.get('q') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('page_size') || '25') || 25))

  let query = adminClient
    .from('email_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (status && ['queued', 'sending', 'sent', 'failed'].includes(status)) query = query.eq('status', status)
  if (event) query = query.eq('event_type', event)

  const [{ data, error }, countRes] = await Promise.all([
    query,
    adminClient.from('email_messages').select('id', { count: 'exact', head: true }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  const rows = (data || []) as { recipient_email: string; recipient_name?: string | null; subject: string; template_key: string; html_body: string }[]
  const filtered = q
    ? rows.filter(r =>
        r.recipient_email.toLowerCase().includes(q.toLowerCase()) ||
        (r.recipient_name || '').toLowerCase().includes(q.toLowerCase()) ||
        r.subject.toLowerCase().includes(q.toLowerCase())
      )
    : rows

  return NextResponse.json({
    messages: filtered,
    total: countRes.count || 0,
    page,
    page_size: pageSize,
  }, supabaseResponse)
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : undefined

  const count = await retryFailed(adminClient, ids?.length ? ids : undefined)
  // Enviar al terminar la respuesta, sin esperar al cron diario.
  if (count > 0) {
    after(() => flushQueue(adminClient, 50).catch(err => console.error('[admin/emails] flush:', err)))
  }
  return NextResponse.json({ ok: true, requeued: count }, supabaseResponse)
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  const { adminClient, supabaseResponse } = guard
  const body = await request.json().catch(() => ({})) as { ids?: string[]; status?: string }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string') : undefined
  const status = body.status && ['queued', 'sending', 'sent', 'failed'].includes(body.status) ? body.status : undefined

  if ((!ids || ids.length === 0) && !status) {
    return NextResponse.json({ error: 'Se requiere ids o status' }, { status: 400, headers: supabaseResponse.headers })
  }

  let query = adminClient.from('email_messages').delete()
  if (ids && ids.length) query = query.in('id', ids)
  else query = query.eq('status', status!)

  const { data, error } = await query.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: supabaseResponse.headers })

  return NextResponse.json({ ok: true, deleted: (data || []).length }, supabaseResponse)
}