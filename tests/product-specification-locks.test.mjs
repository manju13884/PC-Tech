import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { attachSpecificationLocks } from '../functions/lib/productSpecificationLocks.ts'

test('loads direct, revision and child locks in one query and leaves unrelated specifications editable', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE production_plans (id INTEGER, plan_number TEXT, status TEXT);
    CREATE TABLE production_plan_lines (production_plan_id INTEGER, customer_product_specification_id INTEGER, approved_specification_revision_id INTEGER, sales_order_number TEXT, zoho_sales_order_id TEXT, zoho_sales_order_line_item_id TEXT);
    CREATE TABLE so_line_child_specifications (product_specification_id INTEGER, sales_order_id TEXT, sales_order_line_item_id TEXT);
    INSERT INTO production_plans VALUES (1, 'PP-001', 'PLANNED');
    INSERT INTO production_plan_lines VALUES (1, 10, 11, 'SO-001', 'so1', 'line1'), (1, NULL, NULL, 'SO-002', 'so2', 'line2:child:12');
    INSERT INTO so_line_child_specifications VALUES (12, 'so2', 'line2');
  `)
  let queries = 0
  const db = { prepare(sql) {
    queries++
    return { bind(...args) { return { async all() { return { results: sqlite.prepare(sql).all(...args) } } } } }
  } }
  try {
    const rows = await attachSpecificationLocks(db, [10, 11, 12, 13].map(id => ({ id, name: `Spec ${id}` })))
    assert.equal(queries, 1)
    assert.deepEqual(rows.map(row => row.locked_sales_orders), ['SO-001', 'SO-001', 'SO-002', ''])
    assert.deepEqual(rows.map(row => row.locked_production_plans), ['PP-001 (PLANNED)', 'PP-001 (PLANNED)', 'PP-001 (PLANNED)', ''])
    assert.equal(rows[3].name, 'Spec 13')
    assert.deepEqual(await attachSpecificationLocks(db, []), [])
    assert.equal(queries, 1)
  } finally { sqlite.close() }
})
