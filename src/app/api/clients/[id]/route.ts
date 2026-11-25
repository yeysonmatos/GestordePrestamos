import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-route'
import { requireActiveSubscriptionApi } from '@/lib/subscription-guard'
import { normalizeDocument } from '@/lib/utils'

// Whitelist de columnas actualizables (evita mass-assignment de campos
// gestionados por el sistema: trust_score, trust_level, balance, status, user_id).
const CLIENT_UPDATE_FIELDS = [
  'first_name', 'last_name', 'nickname', 'name', 'sex', 'document', 'document_type',
  'phone', 'phone_alt', 'whatsapp', 'email', 'provincia', 'municipio', 'sector',
  'calle', 'numero', 'referencia', 'gps_lat', 'gps_lng', 'notes', 'monthly_income', 'references',
] as const

function pickClientFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of CLIENT_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  if ('document' in out) out.document = normalizeDocument(out.document as string | null)
  return out
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const guard = await requireActiveSubscriptionApi({ supabase, supabaseResponse })
  if (!guard.ok) return guard.response

  const body = await request.json().catch(() => ({}))
  const fields = pickClientFields(body as Record<string, unknown>)

  const { data, error } = await supabase
    .from('clients')
    .update(fields)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, supabaseResponse)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, supabaseResponse } = await createRouteHandlerClient(request)
  const guard = await requireActiveSubscriptionApi({ supabase, supabaseResponse })
  if (!guard.ok) return guard.response

  const { error } = await supabase.from('clients').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true }, supabaseResponse)
}
