// Aplica supabase/expired-subs.sql y muestra lo que devuelve la funcion
// (las suscripciones vigentes vencidas, de TODOS los planes).
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-expired-subs.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return JSON.parse(text)
}

const ddl = readFileSync('supabase/expired-subs.sql', 'utf-8').trim()
await query(ddl)
console.log('DDL aplicado ✅')

const rows = await query(`select public.expired_subscriptions() as res;`)
let list = rows[0].res
if (typeof list === 'string') list = JSON.parse(list)

console.log(`\n===== SUSCRIPCIONES VENCIDAS (vigentes) — ${list.length} =====`)
for (const s of list) {
  console.log(
    `  ${s.business_name ?? '(sin nombre)'} <${s.email}> · plan ${s.plan_name} (RD$ ${s.plan_price}) · ${s.status} · venció ${s.ends_at ? String(s.ends_at).slice(0, 10) : '—'}${s.dias != null ? ` (hace ${s.dias} d)` : ''} · ${s.loans} préstamos / ${s.clients} clientes · tel ${s.business_phone ?? '—'}`,
  )
}

const priv = await query(
  `select has_function_privilege('authenticated','public.expired_subscriptions()','execute') as auth_puede,
          has_function_privilege('anon','public.expired_subscriptions()','execute') as anon_puede,
          has_function_privilege('service_role','public.expired_subscriptions()','execute') as svc_puede`,
)
console.log(
  `\nGuarda: authenticated=${priv[0].auth_puede} · anon=${priv[0].anon_puede} · service_role=${priv[0].svc_puede} (debe ser false,false,true)`,
)
