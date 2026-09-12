import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

test('Stock Adjustment implements explicit approval and ledger-enforced stock movement', async () => {
  const [ui, service, api, migration, inventoryApi, dashboard] = await Promise.all([
    readFile('src/features/inventory/StockAdjustment.tsx', 'utf8'),
    readFile('src/features/inventory/stockAdjustmentService.ts', 'utf8'),
    readFile('functions/api/stock-adjustments.ts', 'utf8'),
    readFile('migrations/0038_create_stock_adjustments.sql', 'utf8'),
    readFile('functions/api/material-inventory-records.ts', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
  ])
  assert.match(dashboard, /<StockAdjustment userRole=\{userRole\} \/>/)
  assert.match(ui, /New Stock Adjustment/)
  assert.match(ui, /Save Draft/)
  assert.match(ui, /Submit for Approval/)
  assert.match(ui, /Stock changes only after explicit SUPERADMIN approval/)
  assert.match(ui, /preview_approval/)
  assert.match(service, /\/api\/stock-adjustments/)
  assert.match(inventoryApi, /reel_weight_kg AS current_stock/)
  assert.match(api, /Only SUPERADMIN can approve Stock Adjustments/)
  assert.match(api, /Only SUPERADMIN can reject Stock Adjustments/)
  assert.match(api, /status = 'PENDING_APPROVAL'/)
  assert.match(api, /expected_current_stock/)
  assert.match(api, /db\.batch/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_stock_adjustments/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_stock_adjustment_history/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_stock_ledger/)
  assert.match(migration, /stock_adjustment_not_pending/)
  assert.match(migration, /stock_balance_changed/)
  assert.match(migration, /negative_stock_not_allowed/)
  assert.match(migration, /UNIQUE \(reference_type, reference_id\)/)
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i)
})

test('Stock Adjustment remains migration 0038 and later features stay additive', async () => {
  const migrations = (await readdir('migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(migrations[37], '0038_create_stock_adjustments.sql')
  assert.ok(migrations.slice(38).every((name) => /^00(?:39|[4-9]\d)_/.test(name)))
})
