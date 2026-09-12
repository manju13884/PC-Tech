import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Stock Report is permission-controlled and read-only', async () => {
  const [dashboard, ui, service, api, styles] = await Promise.all([
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('src/features/inventory/StockReport.tsx', 'utf8'),
    readFile('src/features/inventory/stockReportService.ts', 'utf8'),
    readFile('functions/api/stock-report.ts', 'utf8'),
    readFile('src/features/inventory/stock-report.css', 'utf8'),
  ])
  assert.match(dashboard, /key: 'stock-report'/)
  assert.match(dashboard, /<StockReport username=\{username\} \/>/)
  assert.match(api, /menu_key IN \('stock-report','material-stock'\)/)
  assert.match(api, /inventory_stock_ledger/)
  assert.match(api, /Production \/ Job Consumption/)
  assert.match(api, /Job Consumption/)
  assert.match(api, /transaction_at < datetime\(\?,'\+1 day','-5 hours','-30 minutes'\)/)
  assert.match(api, /adjustment_increase/)
  assert.match(api, /adjustment_decrease/)
  assert.match(api, /SUM\(CASE WHEN closing_stock>0 THEN 1 ELSE 0 END\) in_stock/)
  assert.doesNotMatch(api, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i)
  assert.doesNotMatch(service, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  assert.match(ui, /Export Excel/)
  assert.match(ui, /View Transactions/)
  assert.match(ui, /In Stock \(No\. of Reels\)/)
  assert.match(ui, /Zero Stock \(No\. of Reels\)/)
  assert.match(ui, /Low Stock — threshold not configured/)
  assert.doesNotMatch(ui, /<small>Threshold not configured<\/small>/)
  assert.match(ui, /title="Threshold not configured"/)
  assert.match(styles, /height:34px;min-width:0;min-height:34px/)
  assert.match(styles, /display:flex;align-items:center;gap:7px/)
  assert.match(styles, /font-size:12px/)
  assert.match(styles, /font-size:14px/)
  assert.match(styles, /input\[type='number'\].*appearance:textfield/)
  assert.match(styles, /::-webkit-inner-spin-button/)
})
