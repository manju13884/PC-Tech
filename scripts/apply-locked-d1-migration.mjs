import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const migrationPath = process.argv[2]
const checkOnly = process.argv.includes('--check-only')
const allowedMigrations = new Set([
  '0038_create_stock_adjustments.sql',
  '0039_add_job_tracking_reel_consumption.sql',
  '0040_create_inventory_reel_reservations.sql',
  '0041_add_job_process_completion.sql',
  '0042_add_job_card_supervisor_user.sql',
  '0043_create_material_issues.sql',
  '0044_add_material_issue_invoice_mapping.sql',
  '0045_add_finished_goods_stock_permission.sql',
])
const migrationName = migrationPath ? basename(migrationPath) : ''
if (!allowedMigrations.has(migrationName)) {
  throw new Error('Only reviewed Inventory and Job Tracking recovery migrations 0038-0045 are allowed.')
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
function makeCloudflareCompatible(statement) {
  if (!statement.includes('SELECT CASE')) return statement
  const lines = statement.split('\n')
  const caseStart = lines.findIndex((line) => line.trim() === 'SELECT CASE')
  const caseEnd = lines.findIndex((line, index) => index > caseStart && /^  END;\s*$/.test(line))
  if (caseStart < 0 || caseEnd < 0) throw new Error(`${migrationName} contains an unsupported validation trigger.`)
  const clauses = lines.slice(caseStart + 1, caseEnd).join('\n')
  const replacements = []
  const pattern = /WHEN\s+([\s\S]*?)\s+THEN\s+(RAISE\(ABORT,\s*'[^']+'\))(?=\s+WHEN|\s*$)/g
  for (const match of clauses.matchAll(pattern)) replacements.push(`  SELECT ${match[2]} WHERE ${match[1].trim()};`)
  if (!replacements.length) throw new Error(`${migrationName} validation trigger could not be translated safely.`)
  return [...lines.slice(0, caseStart), ...replacements, ...lines.slice(caseEnd + 1)].join('\n')
}
if (checkOnly) {
  statements.forEach(makeCloudflareCompatible)
  console.log(`${migrationName}: ${statements.length} complete SQL statements validated.`)
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

const applied = await query('SELECT name FROM d1_migrations WHERE name = ?', [migrationName])
if (applied.some((result) => Array.isArray(result.results) && result.results.some((row) => row.name === migrationName))) {
  console.log(`${migrationName} is already applied.`)
  process.exit(0)
}

for (const [index, statement] of statements.entries()) {
  console.log(`Applying reviewed statement ${index + 1} of ${statements.length}...`)
  try {
    await query(makeCloudflareCompatible(statement))
  } catch (error) {
    const safelyAlreadyApplied = /^ALTER\s+TABLE\b/i.test(statement) && error instanceof Error && /duplicate column name/i.test(error.message)
    if (!safelyAlreadyApplied) throw error
    console.log(`Reviewed statement ${index + 1} was already applied by the interrupted additive migration.`)
  }
}
await query('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)', [migrationName])
console.log(`${migrationName} applied statement-by-statement and recorded successfully.`)
