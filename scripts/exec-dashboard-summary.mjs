// Aplica supabase/dashboard-summary.sql y muestra el resultado del RPC para un
// usuario (por defecto, la cuenta de prueba) para comparar con lo que muestra Inicio.
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-dashboard-summary.mjs [user_uuid]
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'
const USER_ID = process.argv[2] || 'babfefb8-4d52-4488-9268-28b437cffd68'

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
  return { ok: res.ok, status: res.status, text }
}

const ddl = readFileSync('supabase/dashboard-summary.sql', 'utf-8').trim()
const ddlRes = await query(ddl)
console.log('DDL status:', ddlRes.status, ddlRes.text || '(sin salida — OK)')
if (!ddlRes.ok) process.exit(1)

const run = await query(`SELECT public.dashboard_summary('${USER_ID}'::uuid) AS res;`)
console.log('\nRUN status:', run.status)
try {
  const parsed = JSON.parse(run.text)
  const data = parsed?.[0]?.res
  console.log('\n===== DASHBOARD SUMMARY =====')
  console.log('Capital prestado    :', data.capital_prestado)
  console.log('Capital recuperado  :', data.capital_recuperado)
  console.log('Intereses + mora    :', data.interes_ganado)
  console.log('Por cobrar          :', data.por_cobrar)
  console.log('En mora             :', data.en_mora, `(cuotas ${data.mora_cuotas} + abiertos ${data.mora_abiertos})`)
  console.log('Cuotas vencidas     :', data.vencidas, '| Cobros vencidos:', data.vencidas_count)
  console.log('Clientes morosos    :', data.clientes_morosos)
  console.log('Cobros de hoy       :', data.cobro_hoy, `(${data.hoy_count} cuotas)`)
  console.log('Préstamos en curso  :', data.activos)
  console.log('Clientes activos    :', data.clientes_activos)
  console.log('Próximos pagos      :', JSON.stringify(data.proximos))
  console.log('Serie mensual       :', JSON.stringify(data.meses))
} catch {
  console.log(run.text)
}
