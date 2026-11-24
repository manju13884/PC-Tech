import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
const bundle = await build({ entryPoints: ['lib/productionPlanningItems.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { readProductionPlanningItems } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const db = value => ({ prepare: () => ({ bind: () => ({ first: async () => value == null ? null : { value } }) }) })
test('production selection defaults to no items and preserves selected IDs', async () => {
  assert.deepEqual([...await readProductionPlanningItems(db(null))], [])
  assert.deepEqual([...await readProductionPlanningItems(db('["a","b","a"]'))], ['a', 'b'])
  await assert.rejects(readProductionPlanningItems(db('{"unexpected":true}')))
})
