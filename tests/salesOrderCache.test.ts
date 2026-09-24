import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { cachedSalesOrder, cachedCustomerSalesOrders, SALES_ORDER_CACHE_TTL_MS } from '../lib/salesOrderCache.ts'

const order = { salesorder_id: 'so1', salesorder_number: 'SO-1', customer_id: 'c1', status: 'open', total: 100, line_items: [
  { line_item_id: 'l1', item_id: 'i1', name: 'Box', description: '', quantity: 10, quantity_invoiced: 0, unit: 'Nos', rate: 10, amount: 100 },
] }

function database() {
  const rows = new Map<string, { payload_json: string; refreshed_at: string }>()
  const env = { ZOHO_ORG_ID: 'org1', DB: {
    prepare: (_sql: string) => ({ bind: (key: string, payload?: string, timestamp?: string) => ({
      first: async () => rows.get(key) ?? null,
      run: async () => { rows.set(key, { payload_json: payload!, refreshed_at: timestamp! }) },
    }) }),
  } } as unknown as Parameters<typeof cachedSalesOrder>[0]
  return { env, rows }
}

test('mapping data is reused by planning without another Zoho read', async () => {
  const { env } = database()
  let calls = 0
  const load = async () => { calls++; return order }
  await cachedSalesOrder(env, 'so1', load, true)
  assert.deepEqual(await cachedSalesOrder(env, 'so1', load), order)
  assert.equal(calls, 1)
})

test('customer lists are cached separately from full order details and organizations', async () => {
  const { env } = database()
  let lists = 0, details = 0
  const loadList = async () => { lists++; return [order] }
  const loadDetail = async () => { details++; return order }
  await cachedCustomerSalesOrders(env, 'c1', loadList)
  await cachedCustomerSalesOrders(env, 'c1', loadList)
  await cachedSalesOrder(env, 'so1', loadDetail)
  await cachedSalesOrder({ ...env, ZOHO_ORG_ID: 'org2' }, 'so1', loadDetail)
  assert.equal(lists, 1)
  assert.equal(details, 2)
})

test('expired, malformed, mismatched and incomplete cache entries fetch live data', async () => {
  for (const row of [
    { payload_json: JSON.stringify(order), refreshed_at: new Date(Date.now() - SALES_ORDER_CACHE_TTL_MS - 1).toISOString() },
    { payload_json: '{broken', refreshed_at: new Date().toISOString() },
    { payload_json: JSON.stringify({ ...order, salesorder_id: 'wrong' }), refreshed_at: new Date().toISOString() },
    { payload_json: JSON.stringify({ ...order, line_items: [{}] }), refreshed_at: new Date().toISOString() },
  ]) {
    const { env, rows } = database()
    rows.set('org1:order:so1', row)
    let calls = 0
    assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => { calls++; return order }), order)
    assert.equal(calls, 1)
  }
})

test('save validation forces a live read and updates the cache', async () => {
  const { env } = database()
  await cachedSalesOrder(env, 'so1', async () => order)
  const closed = { ...order, status: 'closed' }
  assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => closed, true), closed)
  assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => { throw Error('Unexpected fetch') }), closed)
})

test('failed live validation is not replaced with stale cached data', async () => {
  const { env } = database()
  await cachedSalesOrder(env, 'so1', async () => order)
  await assert.rejects(cachedSalesOrder(env, 'so1', async () => { throw Error('Zoho unavailable') }, true), /Zoho unavailable/)
})

test('missing orders invalidate old detail and are not negative-cached', async () => {
  const { env } = database()
  await cachedSalesOrder(env, 'so1', async () => order)
  assert.equal(await cachedSalesOrder(env, 'so1', async () => null, true), null)
  assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => order), order)
})

test('missing DB or unapplied migration falls back to live data', async () => {
  assert.deepEqual(await cachedSalesOrder({}, 'so1', async () => order), order)
  const { env } = database()
  env.DB!.prepare = () => { throw Error('no such table: sales_order_cache') }
  assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => order), order)
})

test('migration and cache SQL work together with idempotent creation and upserts', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const sql = readFileSync('migrations/0055_create_sales_order_cache.sql', 'utf8')
    db.exec(sql)
    db.exec(sql)
    const env = { ZOHO_ORG_ID: 'org1', DB: {
      prepare: (query: string) => ({ bind: (...values: string[]) => ({
        first: async () => db.prepare(query).get(...values) ?? null,
        run: async () => db.prepare(query).run(...values),
      }) }),
    } } as unknown as Parameters<typeof cachedSalesOrder>[0]
    await cachedCustomerSalesOrders(env, 'c1', async () => [order])
    await cachedSalesOrder(env, 'so1', async () => order)
    const updated = { ...order, status: 'invoiced' }
    await cachedSalesOrder(env, 'so1', async () => updated, true)
    assert.deepEqual(await cachedSalesOrder(env, 'so1', async () => { throw Error('Unexpected fetch') }), updated)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales_order_cache').get()!.count, 2)
  } finally {
    db.close()
  }
})
