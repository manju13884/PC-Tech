import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Finished Goods Stock is a read-only Job Card projection with stable linkage',async()=>{
  const[migration,api,component,service,dashboard]=await Promise.all([
    readFile('migrations/0045_add_finished_goods_stock_permission.sql','utf8'),
    readFile('functions/api/finished-goods-stock.ts','utf8'),
    readFile('src/features/inventory/FinishedGoodsStock.tsx','utf8'),
    readFile('src/features/inventory/finishedGoodsStockService.ts','utf8'),
    readFile('src/Dashboard.tsx','utf8'),
  ])
  assert.doesNotMatch(migration,/\b(?:DELETE|DROP|TRUNCATE|REPLACE|UPDATE|ALTER|CREATE TABLE)\b/i)
  assert.match(migration,/'finished-goods-stock'/)
  assert.match(migration,/name = 'SUPERADMIN'/)
  assert.match(api,/card\.manufactured_quantity > 0/)
  assert.match(api,/card\.id AS job_card_id/)
  assert.match(api,/line\.id AS production_plan_line_id/)
  assert.match(api,/MAX\(entry\.completed_at\)/)
  assert.match(api,/ORDER BY manufactured_date DESC,card\.id DESC/)
  assert.match(api,/values\.length\?await reportStatement\.bind\(\.\.\.values\)\.all\(\):await reportStatement\.all\(\)/)
  assert.match(api,/\[finished-goods-stock\] load failed/)
  assert.doesNotMatch(api,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i)
  assert.match(component,/Finished Goods Stock/)
  for(const label of ['SO','Customer','Item & Description','Job Card No.','Manufactured Date','Manufactured Qty'])assert.ok(component.includes(label))
  assert.match(component,/Export Excel/)
  assert.doesNotMatch(component,/Save|Edit|Delete/)
  assert.doesNotMatch(service,/method\s*:/)
  assert.match(dashboard,/menuTitle: 'Finished Goods Stock'/)
  assert.match(dashboard,/selectedItem\.key === 'finished-goods-stock'/)
})
