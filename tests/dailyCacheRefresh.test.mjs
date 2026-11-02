import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function load(path, imports = {}) {
  const exports = {}
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Request, Response, URL, crypto: webcrypto, TextEncoder,
    require: name => { assert.ok(imports[name], name); return imports[name] } })
  return exports
}
const { isCacheRefreshAuthorized } = load('functions/lib/cacheRefreshAuth.ts')
const secret = 'a'.repeat(48)
const request = (token, cache = 'dashboard') => new Request(
  `https://example.com/api/internal/daily-cache-refresh?cache=${cache}`,
  { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} },
)

test('scheduled refresh rejects absent, short and incorrect credentials', async () => {
  for (const [token, configured] of [[undefined, secret], [secret, undefined], ['short', 'short'], ['b'.repeat(48), secret]]) {
    assert.equal(await isCacheRefreshAuthorized(request(token), configured), false)
  }
  assert.equal(await isCacheRefreshAuthorized(request(secret), secret), true)
})

test('scheduled endpoint protects work, hides cache data, and reports failures', async () => {
  const calls = []
  let response = () => Response.json({ privateCustomerData: 'hidden' })
  const { onRequestPost } = load('functions/api/internal/daily-cache-refresh.ts', {
    '../../lib/cacheRefreshAuth': { isCacheRefreshAuthorized },
    '../home-sales-orders': { getDashboardResponse: async () => { calls.push('dashboard'); return response() } },
    '../customers': { onRequestGet: async () => { calls.push('customers'); return response() } },
  })
  const invoke = (token, cache) => onRequestPost({ request: request(token, cache), env: { CACHE_REFRESH_TOKEN: secret } })
  assert.equal((await invoke('invalid')).status, 401)
  assert.equal((await invoke(secret, 'unknown')).status, 400)
  assert.deepEqual(calls, [])
  for (const cache of ['dashboard', 'customers']) {
    const result = await invoke(secret, cache)
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { cache, ok: true })
    assert.equal(result.headers.get('Cache-Control'), 'no-store')
  }
  response = () => Response.json({ errors: { sales: 'refresh in progress' } })
  assert.equal((await invoke(secret)).status, 502)
  response = () => new Response('private error', { status: 500 })
  assert.equal((await invoke(secret, 'customers')).status, 502)
  response = () => { throw new Error('private error') }
  assert.equal((await invoke(secret)).status, 502)
})
