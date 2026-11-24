import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

test('eligible customers include only customers with qualifying orders across pages', async () => {
  const exports = {}
  const pages = [
    { salesorders: [
      { salesorder_id: '1', salesorder_number: 'SO-1', customer_id: 'a', status: 'open' },
      { salesorder_id: '2', salesorder_number: 'SO-2', customer_id: 'b', status: 'void' },
      { salesorder_id: '3', salesorder_number: 'SO-3', customer_id: 'c', status: 'confirmed' },
    ], page_context: { has_more_page: true } },
    { salesorders: [
      { salesorder_id: '4', salesorder_number: 'SO-4', customer_id: 'd', status: 'partially_invoiced' },
      { salesorder_id: '5', salesorder_number: 'SO-5', customer_id: 'e', status: 'closed' },
      { salesorder_id: '6', salesorder_number: 'SO-6', customer_id: 'a', status: 'open' },
    ], page_context: { has_more_page: false } },
  ]
  runInNewContext(ts.transpileModule(readFileSync('lib/salesOrders.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URLSearchParams, console, require: () => ({ zohoGet: async () => pages.shift() }),
  })
  assert.deepEqual(Array.from(await exports.getProductionPlanningCustomerIds()), ['a', 'c', 'd'])
})

test('customer lookup requires Production Planning access', async () => {
  const exports = {}
  let role = null
  const db = { prepare: () => ({ bind: () => ({ first: async () => role === 'allowed' ? { allowed: 1 } : null }) }) }
  const imports = {
    '../../../lib/salesOrders': { getProductionPlanningCustomerIds: async () => ['customer-1'] },
    '../../lib/authenticatedUser': { getAuthenticatedUser: async () => role ? { roleId: 1, roleName: 'SALES' } : null },
  }
  runInNewContext(ts.transpileModule(readFileSync('functions/api/production-planning/customers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Response, console, require: name => imports[name],
  })
  const context = { request: new Request('https://example.test/'), env: { DB: db } }
  assert.equal((await exports.onRequestGet(context)).status, 401)
  role = 'denied'
  assert.equal((await exports.onRequestGet(context)).status, 403)
  role = 'allowed'
  const response = await exports.onRequestGet(context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), ['customer-1'])
})
