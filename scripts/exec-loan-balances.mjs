// Aplica supabase/loan-balances.sql y COMPARA el RPC contra el cálculo hecho en SQL
// con la misma regla del navegador (finance.ts -> installmentStatus), préstamo por
// préstamo, para garantizar que los números de la lista de Préstamos no cambien.
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-loan-balances.mjs [user_uuid]
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

// 1) DDL
const ddl = readFileSync('supabase/loan-balances.sql', 'utf-8').trim()
await query(ddl)
console.log('DDL aplicado ✅')

// 2) Cálculo "esperado" escrito aparte (regla del navegador, sin usar el RPC)
const expectedSql = `
WITH hoy AS (SELECT public.today_rd() AS d)
SELECT
  i.loan_id::text AS loan_id,
  SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0))::numeric AS pendiente,
  COUNT(*) FILTER (
    WHERE ROUND(i.amount - COALESCE(i.paid_amount, 0), 2) > 0.009
      AND i.due_date < (SELECT d FROM hoy)
  )::int AS vencidas,
  COALESCE(MAX(
    CASE WHEN ROUND(i.amount - COALESCE(i.paid_amount, 0), 2) > 0.009
          AND i.due_date < (SELECT d FROM hoy)
         THEN ((SELECT d FROM hoy) - i.due_date) END
  ), 0)::int AS dias
FROM public.installments i
JOIN public.loans l ON l.id = i.loan_id
WHERE l.user_id = '${USER_ID}'::uuid
GROUP BY i.loan_id
ORDER BY i.loan_id;
`
const expected = await query(expectedSql)

// 3) Lo que devuelve el RPC
const rpcRows = await query(`SELECT public.loan_balances('${USER_ID}'::uuid) AS res;`)
const rpc = rpcRows[0].res
const got = new Map((rpc?.balances ?? []).map((b) => [b.loan_id, b]))

console.log(`\nPréstamos con cuotas (esperado): ${expected.length} · RPC: ${got.size}`)

let mismatches = 0
for (const e of expected) {
  const g = got.get(e.loan_id)
  if (!g) {
    mismatches++
    console.log(`  ✗ ${e.loan_id}: el RPC no lo devolvió`)
    continue
  }
  const ok =
    Math.abs(Number(g.pendiente) - Number(e.pendiente)) < 0.005 &&
    Number(g.vencidas) === Number(e.vencidas) &&
    Number(g.dias) === Number(e.dias)
  if (!ok) {
    mismatches++
    console.log(
      `  ✗ ${e.loan_id}: esperado {${e.pendiente}, ${e.vencidas}, ${e.dias}} vs RPC {${g.pendiente}, ${g.vencidas}, ${g.dias}}`,
    )
  }
}

// préstamos que el RPC devuelve y el esperado no (no debería pasar)
for (const [id] of got) {
  if (!expected.some((e) => e.loan_id === id)) {
    mismatches++
    console.log(`  ✗ ${id}: el RPC lo devolvió y el esperado no`)
  }
}

console.log(
  mismatches === 0
    ? `\n✅ COINCIDE TODO (${expected.length} préstamos, 0 diferencias)`
    : `\n❌ ${mismatches} diferencias`,
)

console.log('\nMuestra (primeros 6):')
for (const e of expected.slice(0, 6)) {
  console.log(
    `  ${e.loan_id.slice(0, 8)}…  pendiente=${Number(e.pendiente).toFixed(2)}  vencidas=${e.vencidas}  dias=${e.dias}`,
  )
}

const totalPendiente = expected.reduce((s, e) => s + Number(e.pendiente), 0)
const totalVencidas = expected.reduce((s, e) => s + Number(e.vencidas), 0)
console.log(
  `\nTotales de la cuenta: por cobrar=${totalPendiente.toFixed(2)} · cuotas vencidas=${totalVencidas}`,
)
