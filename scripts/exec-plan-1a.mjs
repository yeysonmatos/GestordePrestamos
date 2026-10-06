// Ejecuta supabase/plan-1a.sql (crea/actualiza el plan cortesía "1A").
// Uso:  $env:SUPABASE_ACCESS_TOKEN="sbp_..." ; node scripts/exec-plan-1a.mjs
import { readFileSync } from 'fs'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'snwwvvmszizarakrozah'

if (!ACCESS_TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.')
  process.exit(1)
}

const sql = readFileSync('supabase/plan-1a.sql', 'utf-8').trim()

const apply = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})
const applyText = await apply.text()
console.log('Apply status:', apply.status)
console.log(applyText ? applyText : '(sin salida — OK)')
if (!apply.ok) process.exit(1)
console.log('✅ plan-1a.sql aplicado.')