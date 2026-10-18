// Aplica supabase/system-checks.sql y corre el revisor sobre TODA la base
// (como lo hace el cron) y sobre una cuenta concreta.
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-system-checks.mjs [user_uuid]
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'
const USER_ID = process.argv[2] || null

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

const ddl = readFileSync('supabase/system-checks.sql', 'utf-8').trim()
await query(ddl)
console.log('DDL aplicado ✅')

async function run(scope) {
  const arg = scope ? `'${scope}'::uuid` : 'NULL'
  const r = (await query(`select public.system_checks(${arg}) as res;`))[0].res
  console.log(`\n===== REVISIÓN (${r.scope}) =====`)
  console.log(`  Comprobaciones corridas: ${r.checks_run}`)
  console.log(`  Hallazgos: ${r.issues.length} tipo(s), ${r.issue_count} caso(s)`)
  if (!r.issues.length) {
    console.log('  ✅ Todo consistente')
  } else {
    for (const i of r.issues) {
      console.log(`  ⚠️  [${i.severity}] ${i.title}`)
      console.log(`      código=${i.code} · casos=${i.count} · ejemplos=${JSON.stringify(i.samples)}`)
    }
  }
  return r
}

await run(null)
if (USER_ID) await run(USER_ID)

// Prueba negativa: ¿detecta algo si rompemos algo a propósito? (dentro de una
// transacción que se revierte, para no tocar datos reales)
console.log('\n===== PRUEBA NEGATIVA (se revierte) =====')
const probe = await query(`
BEGIN;
INSERT INTO public.installments (loan_id, client_id, number, amount, capital, interest, balance, paid_amount, due_date, status)
  SELECT l.id, l.client_id, 99, 1, 1, 0, 1, 0, public.today_rd(), 'pending'
  FROM public.loans l WHERE l.open_ended AND l.deleted_at IS NULL LIMIT 1;
SELECT public.system_checks(NULL) AS res;
ROLLBACK;
`)
const probeRes = probe[0]?.res
if (probeRes) {
  console.log(`  Con un préstamo abierto con cuotas: hallazgos=${probeRes.issues.length}`)
  for (const i of probeRes.issues) console.log(`    ⚠️  ${i.code}: ${i.count}`)
  const detected = probeRes.issues.some((i) => i.code === 'abierto_con_cuotas')
  console.log(detected ? '  ✅ El revisor LO DETECTA' : '  ❌ NO lo detectó')
} else {
  console.log('  (sin resultado)')
}
