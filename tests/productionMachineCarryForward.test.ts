import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import test from 'node:test'
import { build } from 'esbuild'

async function fixture() {
  const compiled = await build({
    stdin: { contents: `export * as plans from './functions/api/production-plans'; export * as prepare from './functions/api/production-planning/prepare';`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'test-services', setup(builder) {
      builder.onLoad({ filter: /authenticatedUser\.ts$/ }, () => ({ contents: `export async function getAuthenticatedUser() { return { id: 1, roleId: 1, roleName: 'SUPERADMIN', fullName: 'Test', email: 'test@example.com' } }` }))
      builder.onLoad({ filter: /salesOrderCache\.ts$/ }, () => ({ contents: `export async function cachedSalesOrder(env, id, load) { return load() }` }))
      builder.onLoad({ filter: /salesOrders\.ts$/ }, () => ({ contents: `export async function getZohoSalesOrderById() { return { salesorder_id: 'so1', salesorder_number: 'SO-1', customer_id: 'c1', customer_name: 'Customer', status: 'open', line_items: [{ line_item_id: 'line1', item_id: 'item1', name: 'Box', description: 'Box', quantity: 1000, quantity_invoiced: 0, unit: 'pcs' }] } }` }))
    } }],
  })
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync('migrations').filter((file) => /^\d+.*\.sql$/.test(file)).sort()) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'))
  sqlite.exec(`
    INSERT INTO users (id,email,full_name,password_hash,password_salt,role_id)
      VALUES (1,'test@example.com','Test','test','test',(SELECT id FROM roles WHERE name='SUPERADMIN'));
    INSERT INTO product_specification_records (id,specification_name,customer_id,customer_name,item_id,item_name,
      specification_type,length_mm,width_mm,height_mm,ply,attributes_json,created_by_user_id,updated_by_user_id)
      VALUES (1,'Box','c1','Customer','item1','Box','Box',355,385,160,5,'{"paper_layers":[{"flute":"B"}]}',1,1);
    INSERT INTO so_specification_mappings (sales_order_id,sales_order_number,customer_id,customer_name,
      sales_order_line_item_id,item_id,item_name,product_specification_id,created_by_user_id,updated_by_user_id)
      VALUES ('so1','SO-1','c1','Customer','line1','item1','Box',1,1,1);
  `)
  const db = {
    prepare(sql: string) {
      return {
        values: [] as SQLInputValue[],
        bind(...values: SQLInputValue[]) { this.values = values; return this },
        async first() { return sqlite.prepare(sql).get(...this.values) ?? null },
        async all() { return { results: sqlite.prepare(sql).all(...this.values) } },
        run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...this.values).changes) } } },
      }
    },
    async batch(statements: Array<{ run(): unknown }>) {
      sqlite.exec('BEGIN')
      try { const results = statements.map((statement) => statement.run()); sqlite.exec('COMMIT'); return results }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const context = (path: string, method = 'GET', body?: unknown) => ({ env: { DB: db }, request: new Request(`https://example.com${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }) })
  const input = { salesOrderId: 'so1', lineItemId: 'line1', productionQuantity: 1000, topSheetQuantity: 1000, twoPlyQuantity: 2000, fluteRun: 'B', ups: 2, deckleSize: '110.00', cutLengthCm: 154.2, productionDate: '2099-01-01', deliveryDate: '2099-01-02' }
  const plan = (values = input) => api.plans.onRequestPost(context('/api/production-plans', 'POST', { action: 'generate', lines: [values] }))
  const read = () => api.plans.onRequestGet(context('/api/production-plans?view=lines'))
  const unplan = (id: number, remove = false) => api.plans.onRequestDelete(context(`/api/production-plans?line_id=${id}&remove_job_cards=${remove}`, 'DELETE'))
  const prepare = () => api.prepare.onRequestPost(context('/api/production-planning/prepare', 'POST', { salesOrderIds: ['so1'] }))
  return { sqlite, input, plan, read, unplan, prepare }
}

test('Planning -> Planned -> Unplan -> Replan carries all four values despite specification changes', async () => {
  const f = await fixture()
  try {
    const created = await f.plan()
    assert.equal(created.status, 201, await created.text())
    f.sqlite.exec(`UPDATE product_specification_records SET width_mm=900, attributes_json='{"paper_layers":[{"flute":"A"}]}' WHERE id=1`)
    const first = (await (await f.read()).json()).lines[0]
    assert.deepEqual([first.flute_run, first.ups, first.deckle_size, first.cut_length_cm], ['B', 2, '1100', 154.2])
    const removed = await f.unplan(first.id)
    assert.equal(removed.status, 200, await removed.text())
    assert.equal((await (await f.read()).json()).lines.length, 0)
    const prepared = await f.prepare()
    assert.equal(prepared.status, 200)
    const restored = (await prepared.json()).lines[0]
    assert.deepEqual([restored.fluteRun, restored.ups, restored.deckleSize, restored.cutLengthCm], ['B', 2, '110', 154.2])
    assert.equal(restored.restoredMachineSettings, true)
    const changed = { ...f.input, ups: 3, deckleSize: '160.25', cutLengthCm: 155.4, fluteRun: restored.fluteRun }
    const replanned = await f.plan(changed)
    assert.equal(replanned.status, 201, await replanned.text())
    const second = (await (await f.read()).json()).lines[0]
    assert.deepEqual([second.flute_run, second.ups, second.deckle_size, second.cut_length_cm], ['B', 3, '1602.5', 155.4])
    assert.equal(second.production_quantity, 1000)
    assert.equal((await f.unplan(second.id)).status, 200)
    const restoredAgain = (await (await f.prepare()).json()).lines[0]
    assert.deepEqual([restoredAgain.fluteRun, restoredAgain.ups, restoredAgain.deckleSize, restoredAgain.cutLengthCm], ['B', 3, '160.25', 155.4])
  } finally { f.sqlite.close() }
})

test('Unplan keeps existing Job Card protection and only retains configuration when removal succeeds', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.plan()).status, 201)
    const line = (await (await f.read()).json()).lines[0]
    f.sqlite.prepare(`INSERT INTO job_cards (job_number,production_plan_line_id,status,created_by_user_id,created_by_name) VALUES ('JC-TEST',?,'CREATED',1,'Test')`).run(line.id)
    assert.equal((await f.unplan(line.id)).status, 409)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM production_planning_machine_settings').get()!.n, 0)
    f.sqlite.exec("UPDATE job_cards SET status='IN_PROGRESS'")
    assert.equal((await f.unplan(line.id, true)).status, 409)
    f.sqlite.exec("UPDATE job_cards SET status='CREATED'")
    const removed = await f.unplan(line.id, true)
    assert.equal(removed.status, 200, await removed.text())
    const restored = (await (await f.prepare()).json()).lines[0]
    assert.equal(restored.ups, 2)
    assert.equal(restored.deckleSize, '110')
  } finally { f.sqlite.close() }
})

test('legacy flute fallback and dimensions survive unplan without changing the specification', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.plan()).status, 201)
    f.sqlite.exec('UPDATE production_plan_lines SET ups=1, flute_run=NULL')
    const line = (await (await f.read()).json()).lines[0]
    assert.equal((await f.unplan(line.id)).status, 200)
    const restored = (await (await f.prepare()).json()).lines[0]
    assert.deepEqual([restored.fluteRun, restored.ups, restored.deckleSize, restored.cutLengthCm], ['B', 1, '110', 154.2])
  } finally { f.sqlite.close() }
})
