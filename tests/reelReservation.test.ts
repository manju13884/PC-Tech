import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('reel reservations are additive, exclusive, auditable and released by terminal job actions', async () => {
  const [migration, api, tracking, reportApi, reportUi] = await Promise.all([
    readFile('migrations/0040_create_inventory_reel_reservations.sql', 'utf8'),
    readFile('functions/api/job-tracking.ts', 'utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx', 'utf8'),
    readFile('functions/api/stock-report.ts', 'utf8'),
    readFile('src/features/inventory/StockReport.tsx', 'utf8'),
  ])

  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_reel_reservations/)
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_reel_reservation_one_active_per_reel/)
  assert.match(migration, /WHERE status = 'ACTIVE'/)
  assert.match(migration, /reserved_by_user_id/)
  assert.match(migration, /released_by_user_id/)
  assert.match(migration, /release_reason/)

  assert.match(api, /LEFT JOIN inventory_reel_reservations/)
  assert.match(api, /stock\.reel_weight_kg > 0/)
  assert.match(api, /already reserved for Job/)
  assert.match(api, /was reserved by another Job/)
  assert.match(api, /REEL_CHANGED/)
  assert.match(api, /REEL_REMOVED/)
  assert.match(api, /JOB_CANCELLED/)
  assert.match(api, /PROCESS_COMPLETED/)
  assert.match(api, /await db\.batch/)
  assert.match(api, /PRODUCTION_CONSUMPTION/)
  assert.match(api, /if \(body\.action === 'selectReel'\)/)

  assert.match(tracking, /!reel\.reserved_job_card_id \|\| reel\.reserved_job_card_id === job\.job_card_id/)
  assert.match(api, /Reel reservation released/)
  assert.match(reportApi, /COALESCE\(ld\.net_asof,0\)\) <= 0 THEN 'Consumed'/)
  assert.match(reportApi, /reservation\.job_number AS reserved_for_job/)
  assert.match(reportApi, /SUM\(CASE WHEN closing_stock>0 THEN 1 ELSE 0 END\) in_stock/)
  assert.match(reportUi, /Reel Status/)
  assert.match(reportUi, /Reserved For Job/)
})
