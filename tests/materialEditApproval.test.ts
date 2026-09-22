import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Material edits are additive, approval-gated, auditable, and concurrency protected', async () => {
  const [api, migration, stockApi, ledgerApi, ui] = await Promise.all([
    readFile('functions/api/material-edit-requests.ts', 'utf8'),
    readFile('migrations/0052_create_material_edit_requests.sql', 'utf8'),
    readFile('functions/api/stock-report.ts', 'utf8'),
    readFile('functions/api/stock-ledger.ts', 'utf8'),
    readFile('src/features/inventory/MaterialEditWorkflow.tsx', 'utf8'),
  ])
  assert.match(migration, /material_inventory_edit_requests/)
  assert.match(migration, /WHERE status = 'PENDING_APPROVAL'/)
  assert.match(migration, /material_inventory_edit_history/)
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i)
  assert.match(api, /old_values/)
  assert.match(api, /proposed_values/)
  assert.match(api, /Reason for Edit is required/)
  assert.match(api, /already been consumed or issued/)
  assert.match(api, /inventory_stock_ledger WHERE inventory_stock_id=\? AND movement='OUT'/)
  assert.match(api, /job_tracking_reel_consumptions/)
  assert.match(api, /inventory_material_issues/)
  assert.match(api, /already has an Edit Pending Approval request/)
  assert.match(api, /inventory activity after the edit request was submitted/)
  assert.match(api, /WHERE id=\? AND updated_at=\?/)
  assert.match(api, /Only SUPERADMIN can approve or reject Material Edits/)
  assert.match(api, /Rejection Reason is required/)
  assert.match(api, /getZohoInventoryVendors/)
  assert.match(api, /getZohoInventoryPurchaseOrders/)
  assert.match(api, /getZohoInventoryPurchaseOrderItems/)
  assert.match(stockApi, /edit_pending/)
  assert.match(stockApi, /can_edit/)
  assert.match(ledgerApi, /'MATERIAL EDIT' AS transaction_type/)
  assert.match(ui, /Current Value/)
  assert.match(ui, /Proposed Value/)
  assert.match(ui, /className=\{changed\?'changed':''\}/)
  assert.match(ui, /Submit for Approval/)
})

test('Material edit approval updates the original row without inserting duplicate stock', async () => {
  const api = await readFile('functions/api/material-edit-requests.ts', 'utf8')
  assert.match(api, /UPDATE material_inventory_records SET/)
  assert.doesNotMatch(api, /INSERT INTO material_inventory_records/)
})

test('Existing Material Stock delete safeguards remain in place', async () => {
  const [api, migration] = await Promise.all([
    readFile('functions/api/stock-report.ts', 'utf8'),
    readFile('migrations/0048_add_material_stock_deletion_audit.sql', 'utf8'),
  ])
  assert.match(api, /onRequestDelete/)
  assert.match(api, /material_stock_is_in_use/)
  assert.match(migration, /trg_material_inventory_prevent_used_delete/)
})
