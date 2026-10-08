// Respaldo local completo de la base actual (tablas public + auth users + blobs de Storage).
// Uso:  node scripts/backup-full-db.mjs   (desde la raíz de GestordePrestamos)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const envText = readFileSync(join(root, '.env.local'), 'utf-8')
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const srk = envText.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
if (!url || !srk) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(url, srk, { auth: { persistSession: false } })

const TABLES = [
  'clients',
  'loans',
  'installments',
  'payments',
  'settings',
  'documents',
  'audit_logs',
  'app_users',
  'plans',
  'subscriptions',
  'subscription_payments',
  'support_tickets',
  'support_messages',
  'smtp_config',
  'email_messages',
  'platform_config',
]

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = join('C:\\Users\\YMatos\\Desktop\\BACKUP-GestordePrestamos', `db-backup-${stamp}`)
mkdirSync(outDir, { recursive: true })

const manifest = { createdAt: new Date().toISOString(), projectUrl: url, tables: {}, authUsers: 0, storage: {} }

async function fetchAll(table) {
  const rows = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

for (const t of TABLES) {
  try {
    const rows = await fetchAll(t)
    writeFileSync(join(outDir, `${t}.json`), JSON.stringify(rows, null, 2))
    manifest.tables[t] = rows.length
    console.log(`OK  ${t}: ${rows.length} filas`)
  } catch (e) {
    manifest.tables[t] = `ERROR: ${e.message}`
    console.error(`ERR ${t}: ${e.message}`)
  }
}

try {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  writeFileSync(join(outDir, 'auth_users.json'), JSON.stringify(data.users, null, 2))
  manifest.authUsers = data.users.length
  console.log(`OK  auth users: ${data.users.length}`)
} catch (e) {
  manifest.authUsers = `ERROR: ${e.message}`
  console.error(`ERR auth users: ${e.message}`)
}

async function listRecursive(prefix) {
  const { data, error } = await supabase.storage.from('documents').list(prefix, { limit: 1000 })
  if (error) throw error
  let files = []
  for (const item of data) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) files = files.concat(await listRecursive(full))
    else files.push(full)
  }
  return files
}

try {
  const files = await listRecursive('')
  const dir = join(outDir, 'documents')
  mkdirSync(dir, { recursive: true })
  let saved = 0
  for (const path of files) {
    const { data, error } = await supabase.storage.from('documents').download(path)
    if (error) {
      console.error(`ERR blob ${path}: ${error.message}`)
      continue
    }
    writeFileSync(join(dir, path.replace(/\//g, '__')), Buffer.from(await data.arrayBuffer()))
    saved++
  }
  manifest.storage = { bucket: 'documents', found: files.length, saved }
  console.log(`OK  storage documents: ${saved}/${files.length} archivos`)
} catch (e) {
  manifest.storage = `ERROR: ${e.message}`
  console.error(`ERR storage: ${e.message}`)
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\nRespaldo en: ${outDir}`)
