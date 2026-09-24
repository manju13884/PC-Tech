import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { build } from 'esbuild'
import { parseProductionUps } from '../src/features/production-planning/productionUps.ts'
import { updateProductionUps } from '../src/features/production-planning/productionMachineDimensions.ts'

test('Ups requires a positive whole number and does not restrict valid values to the suggested options', () => {
  for (const value of [1, 2, 3, 4, 5, '2', ' 3 ']) {
    assert.equal(parseProductionUps(value), Number(value))
  }
  for (const value of [undefined, null, '', ' ', 0, -1, 1.5, '2.5', 'abc', NaN, Infinity, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseProductionUps(value), null)
  }
})

test('Ups migration preserves historical dimensions and quantities and stores the explicit multi-up configuration', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE production_plan_lines (
      id INTEGER PRIMARY KEY, deckle_size TEXT, cut_length_cm REAL,
      production_quantity REAL, two_ply_quantity REAL);
      INSERT INTO production_plan_lines VALUES (1, '565', 154.2, 1000, 2000);`)
    db.exec(readFileSync('migrations/0057_add_production_ups.sql', 'utf8'))
    const legacy = db.prepare('SELECT * FROM production_plan_lines WHERE id=1').get()!
    assert.deepEqual({ ...legacy }, { id: 1, deckle_size: '565', cut_length_cm: 154.2, production_quantity: 1000, two_ply_quantity: 2000, ups: 1, flute_run: null })
    db.prepare(`INSERT INTO production_plan_lines
      (id, deckle_size, cut_length_cm, production_quantity, two_ply_quantity, ups, flute_run)
      VALUES (2, '1100', 154.2, 1000, 2000, 2, 'B')`).run()
    const planned = db.prepare('SELECT ups, deckle_size, cut_length_cm, flute_run FROM production_plan_lines WHERE id=2').get()!
    assert.deepEqual({ ...planned }, { ups: 2, deckle_size: '1100', cut_length_cm: 154.2, flute_run: 'B' })
    for (const invalid of [0, -1, 1.5, null]) {
      assert.throws(() => db.prepare('UPDATE production_plan_lines SET ups=? WHERE id=2').run(invalid))
    }
  } finally { db.close() }
})

test('changing Ups immediately recalculates production dimensions and leaves other rows unchanged', () => {
  const source = readFileSync('src/features/production-planning/ProductionPlanning.tsx', 'utf8')
  const handler = source.match(/<input aria-label="Ups"[^\n]+?onChange=\{\(e\) => \{ (.*?) \}\}/)?.[1]
  assert.ok(handler)
  const original = { salesOrderId: 'so1', lineItemId: 'line1', ups: 1, deckleSize: '56.50', cutLengthCm: 154.2, productionQuantity: 1000, lengthMm: 355, widthMm: 385, heightMm: 160, ply: 5, fluteRun: 'B', productType: 'BOX' }
  const other = { ...original, lineItemId: 'line2' }
  let lines = [original, other]
  // Execute the actual field handler to verify immediate recalculation, without saving.
  new Function('e', 'v', 'setLines', 'updateProductionUps', handler)(
    { target: { value: '2' } }, original,
    (update: (current: typeof lines) => typeof lines) => { lines = update(lines) }, updateProductionUps,
  )
  assert.deepEqual(lines[0], { ...original, ups: 2, deckleSize: '110' })
  assert.equal(lines[1], other)
})

test('saved Ups and flute snapshot propagate through planned, job cards, tracking and shared print', () => {
  for (const path of ['functions/api/production-plans.ts', 'functions/api/job-cards.ts', 'functions/api/job-tracking.ts']) {
    const api = readFileSync(path, 'utf8')
    assert.match(api, /line\.ups, line\.flute_run, line\.deckle_size, line\.cut_length_cm/)
  }
  const planned = readFileSync('src/features/production-planned/ProductionPlanned.tsx', 'utf8')
  assert.match(planned, /<td>\{line\.ups \?\? 1\}<\/td>/)
  const cards = readFileSync('src/features/job-cards/JobCards.tsx', 'utf8')
  assert.match(cards, /<dt>Ups<\/dt><dd>\{line\.ups \?\? 1\}<\/dd>/)
  assert.match(cards, /job-card-machine-summary"><MachineConfiguration line=\{line\}/)
  const tracking = readFileSync('src/features/job-tracking/JobTracking.tsx', 'utf8')
  assert.match(tracking, /<JobCard line=\{job\}/)
})

test('Production Plan API rejects invalid Ups and saves the supplied dimensions without multiplying', async () => {
  const bundled = await build({
    entryPoints: ['functions/api/production-plans.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'production-test-services', setup(builder) {
      builder.onLoad({ filter: /authenticatedUser\.ts$/ }, () => ({ contents: `export async function getAuthenticatedUser() { return { id: 1, roleId: 1, roleName: 'SUPERADMIN', fullName: 'Test', email: 'test@example.com' } }` }))
      builder.onLoad({ filter: /salesOrderCache\.ts$/ }, () => ({ contents: `export async function cachedSalesOrder(env, id, load) { return load() }` }))
      builder.onLoad({ filter: /salesOrders\.ts$/ }, () => ({ contents: `export async function getZohoSalesOrderById() { return { salesorder_id: 'so1', salesorder_number: 'SO-1', status: 'open', line_items: [{ line_item_id: 'line1', item_id: 'item1', name: 'Box', description: 'Box', quantity: 1000, quantity_invoiced: 0, unit: 'pcs' }] } }` }))
    } }],
  })
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
  const batches: Array<Array<{ sql: string; values: unknown[] }>> = []
  const db = { prepare(sql: string) {
    return { sql, values: [] as unknown[], bind(...values: unknown[]) { this.values = values; return this },
      async first() { return { sequence: 0 } },
      async all() { return { results: sql.includes('FROM so_specification_mappings') ? [{ line_id: 'line1', source_line_id: 'line1', product_specification_id: 1, customer_id: 'c1', customer_name: 'Customer', specification_type: 'Box', ply: 5, attributes_json: JSON.stringify({ paper_layers: [{ flute: 'B' }] }) }] : [] } },
    }
  }, async batch(statements: Array<{ sql: string; values: unknown[] }>) { batches.push(statements) } }
  const line = { salesOrderId: 'so1', lineItemId: 'line1', productionQuantity: 1000, topSheetQuantity: 1000, twoPlyQuantity: 2000, ups: 2, fluteRun: 'B', deckleSize: '110.00', cutLengthCm: 154.2, productionDate: '2099-01-01', deliveryDate: '2099-01-02' }
  const submit = (values: Record<string, unknown>) => api.onRequestPost({ env: { DB: db }, request: new Request('https://example.com/api/production-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', lines: [values] }) }) })
  for (const ups of [undefined, null, '', 0, -1, 1.5]) {
    const response = await submit({ ...line, ups })
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Ups must be a positive whole number/)
  }
  assert.equal(batches.length, 0)
  const response = await submit(line)
  assert.equal(response.status, 201, await response.text())
  const saved = batches[0].find((statement) => statement.sql.includes('INSERT INTO production_plan_lines'))!
  assert.equal((saved.sql.match(/\?/g) ?? []).length, saved.values.length)
  const columns = saved.sql.match(/INSERT INTO production_plan_lines \(([\s\S]*?)\)\s+VALUES/)![1].split(',').map((column) => column.trim())
  const values = Object.fromEntries(columns.map((column, index) => [column, saved.values[index]]))
  assert.equal(values.ups, 2)
  assert.equal(values.flute_run, 'B')
  assert.equal(values.deckle_size, '1100')
  assert.equal(values.cut_length_cm, 154.2)
  assert.equal(values.production_quantity, 1000)
})
