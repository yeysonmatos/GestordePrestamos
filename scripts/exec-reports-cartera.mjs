// Aplica supabase/reports-cartera.sql y VERIFICA la coherencia:
//   * El "vencido" de Reportes (al día de hoy) debe ser EXACTAMENTE el
//     "Vencido por cobrar" del Inicio (dashboard_summary.en_mora).
//   * El "al_dia" de Reportes con cierre de hoy debe seguir cuadrando con las
//     cuotas (101.84 en la cuenta de prueba).
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-reports-cartera.mjs [user_uuid]
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return JSON.parse(text)
}

const ddl = readFileSync('supabase/reports-cartera.sql', 'utf-8').trim()
await query(ddl)
console.log('DDL aplicado ✅')

const today = (await query(`select public.today_rd()::text as d`))[0].d
console.log(`hoy = ${today}`)

const cartera = (await query(`select public.reports_cartera('${USER_ID}'::uuid, '${today}'::date) as res;`))[0].res
const dash = (await query(`select public.dashboard_summary('${USER_ID}'::uuid) as res;`))[0].res

console.log('\n===== CARTERA DE REPORTES (cierre hoy) =====')
console.log(`  Al día   : ${Number(cartera.al_dia).toFixed(2)}`)
console.log(`  Vencido  : ${Number(cartera.vencido).toFixed(2)}`)
console.log(`  Total    : ${Number(cartera.total).toFixed(2)}`)
console.log(`  Morosidad: ${Number(cartera.tasa).toFixed(1)}%`)
console.log(
  `  Aging    : 1-30=${Number(cartera.aging.d1_30).toFixed(2)} · 31-60=${Number(cartera.aging.d31_60).toFixed(2)} · 61-90=${Number(cartera.aging.d61_90).toFixed(2)} · 90+=${Number(cartera.aging.d90plus).toFixed(2)}`,
)
console.log(
  `  Préstamos: en curso=${cartera.loans_active} · pagados=${cartera.loans_paid} · archivados=${cartera.loans_archived}`,
)

console.log('\n===== CONTRASTE CON EL INICIO =====')
const vencido = Number(cartera.vencido)
const enMora = Number(dash.en_mora)
console.log(`  Vencido (Reportes)  = ${vencido.toFixed(2)}`)
console.log(`  En mora (Inicio)    = ${enMora.toFixed(2)}`)
console.log(
  Math.abs(vencido - enMora) < 0.005
    ? '  ✅ COINCIDEN (la morosidad quedó unificada)'
    : `  ❌ DIFEREN (${(vencido - enMora).toFixed(2)})`,
)

const sumaAging =
  Number(cartera.aging.d1_30) +
  Number(cartera.aging.d31_60) +
  Number(cartera.aging.d61_90) +
  Number(cartera.aging.d90plus)
console.log(
  Math.abs(sumaAging - vencido) < 0.005
    ? `  ✅ Las rebanadas suman el vencido (${sumaAging.toFixed(2)})`
    : `  ❌ Las rebanadas (${sumaAging.toFixed(2)}) no suman el vencido (${vencido.toFixed(2)})`,
)
console.log(
  Math.abs(Number(cartera.al_dia) + Number(cartera.vencido) - Number(cartera.total)) < 0.005
    ? `  ✅ Al día + vencido = total (${Number(cartera.total).toFixed(2)})`
    : '  ❌ Al día + vencido ≠ total',
)

console.log('\n===== CARTERA EN FECHAS ANTERIORES =====')
for (const asOf of ['2026-09-30', '2026-10-10', '2026-10-16']) {
  const c = (await query(`select public.reports_cartera('${USER_ID}'::uuid, '${asOf}'::date) as res;`))[0].res
  console.log(
    `  ${asOf}: al día=${Number(c.al_dia).toFixed(2)} · vencido=${Number(c.vencido).toFixed(2)} · total=${Number(c.total).toFixed(2)} · morosidad=${Number(c.tasa).toFixed(1)}%`,
  )
}
