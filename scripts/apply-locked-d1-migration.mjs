import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const migrationPath = process.argv[2]
const checkOnly = process.argv.includes('--check-only')
const allowedMigration = '0038_create_stock_adjustments.sql'
if (!migrationPath || basename(migrationPath) !== allowedMigration) {
  throw new Error(`Only the reviewed recovery migration ${allowedMigration} is allowed.`)
}

function splitSql(sql) {
  const statements = []
  let current = []
  let trigger = false
  for (const line of sql.replace(/\r\n?/g, '\n').split('\n')) {
    if (!current.length && !line.trim()) continue
    current.push(line)
    if (/^CREATE\s+TRIGGER\b/i.test(line.trim())) trigger = true
    const complete = trigger ? /^END;\s*$/.test(line) : /;\s*$/.test(line.trim())
    if (complete) {
      statements.push(current.join('\n').trim())
      current = []
      trigger = false
    }
  }
  if (current.some((line) => line.trim())) throw new Error('Locked migration contains incomplete SQL.')
  return statements
}

const statements = splitSql(readFileSync(resolve(migrationPath), 'utf8'))
if (checkOnly) {
  console.log(`${allowedMigration}: ${statements.length} complete SQL statements validated.`)
  process.exit(0)
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID
if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare production migration credentials are unavailable.')
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`

async function query(sql, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  const payload = await response.json().catch(() => null)
  const results = Array.isArray(payload?.result) ? payload.result : []
  if (!response.ok || payload?.success !== true || results.some((result) => result?.success === false)) {
    const message = payload?.errors?.[0]?.message || results.find((result) => result?.error)?.error || `Cloudflare D1 returned HTTP ${response.status}`
    throw new Error(message)
  }
  return results
}

const applied = await query('SELECT name FROM d1_migrations WHERE name = ?', [allowedMigration])
if (applied.some((result) => Array.isArray(result.results) && result.results.some((row) => row.name === allowedMigration))) {
  console.log(`${allowedMigration} is already applied.`)
  process.exit(0)
}

for (const [index, statement] of statements.entries()) {
  console.log(`Applying reviewed statement ${index + 1} of ${statements.length}...`)
  await query(statement)
}
await query('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)', [allowedMigration])
console.log(`${allowedMigration} applied statement-by-statement and recorded successfully.`)
