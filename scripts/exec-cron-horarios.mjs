// Aplica supabase/cron-horarios.sql: mueve el pintado de estados de los préstamos
// (late_*) a las 04:00 UTC = 00:00 RD, ANTES del revisor semanal (05:00 UTC).
//
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-cron-horarios.mjs
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
  return { ok: res.ok, status: res.status, text }
}

const ddl = readFileSync('supabase/cron-horarios.sql', 'utf-8').trim()
const ddlRes = await query(ddl)
console.log('DDL status:', ddlRes.status, ddlRes.text || '(sin salida - OK)')
if (!ddlRes.ok) process.exit(1)

const state = await query(
  "select format('jobid=%s | %s | %s | activo=%s', jobid, schedule, command, active) as r from cron.job order by jobid",
)
console.log('\nCron agendados:')
const rows = JSON.parse(state.text)
for (const row of rows) console.log('  ' + row.r)
