import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Stock Ledger reuses Inventory Transactions permission and remains read-only', async () => {
  const [dashboard, api, ui, service] = await Promise.all([
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('functions/api/stock-ledger.ts', 'utf8'),
    readFile('src/features/inventory/StockLedger.tsx', 'utf8'),
    readFile('src/features/inventory/stockLedgerService.ts', 'utf8'),
  ])
  assert.match(dashboard, /key: 'inventory-transactions',[\s\S]*title: 'Stock Ledger'/)
  assert.match(dashboard, /<StockLedger \/>/)
  assert.match(api, /menu_key='inventory-transactions'/)
  assert.match(api, /inventory_stock_ledger/)
  assert.match(api, /Material Receipt/)
  assert.match(api, /PRODUCTION_CONSUMPTION|JOB_TRACKING/)
  assert.doesNotMatch(api, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i)
  assert.doesNotMatch(service, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  for (const heading of ['Date / Time','Transaction Type','Reference Type','Reference No.','Material','Reel / Lot No.','IN Qty','OUT Qty','Balance','UOM','Source','Created By','Approved By','Remarks']) assert.ok(ui.includes(heading))
  for (const filter of ['Date From','Date To','Transaction Type','Material','Reel No.','Reference No.','Location','User']) assert.ok(ui.includes(filter))
})
