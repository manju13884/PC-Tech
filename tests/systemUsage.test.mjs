import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const api = await load('functions/api/system-usage.ts')
const { collectSystemUsage, usageEnvironment } = await load('functions/lib/systemUsage.ts')
const { formatUsage, formatUsageTime } = await load('src/features/system-usage/systemUsageFormatting.ts')
const account = 'a'.repeat(32)
const stagingId = '0d749a66-9654-4767-b56a-afd4f8bcd9a1'
const productionId = 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf'
const envCredentials = { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'secret-not-for-browser' }

function fixture({ role = 'SUPERADMIN', permission = false, size = 24600000, brokenSize = false, expired = false } = {}) {
  const sql = []
  return { sql, DB: { prepare(query) {
    sql.push(query)
    assert.match(query.trim(), /^SELECT\s/i, 'Monitoring only prepares reads')
    return {
      bind() { return this },
      async first() {
        if (query.includes('FROM sessions')) return {
          user_id: 1, role_id: 1, role_name: role, user_status: 'ACTIVE', role_is_active: 1,
          session_revoked_at: null, session_version: 1, user_session_version: 1,
          session_expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString(),
        }
        if (query.includes('role_menu_permissions')) return permission ? { allowed: 1 } : null
        throw new Error('Unexpected auth query')
      },
      async all() {
        assert.equal(query, 'SELECT 1', 'No business-table scans')
        if (brokenSize) throw new Error('Sensitive database internals')
        return { success: true, meta: { size_after: size, rows_written: 0 }, results: [{ 1: 1 }] }
      },
    }
  } } }
}
function request(host = 'http://localhost', method = 'GET', authenticated = true) {
  return new Request(`${host}/api/system-usage`, { method, headers: authenticated ? { Cookie: 'pc_tech_session=test' } : {} })
}
function cloudflare({ production = false, denyProject = false, denyStorage = false, denyAnalytics = false, incomplete = false, wrongBinding = false, reads = 1210000, writes = 12420, emptyAnalytics = false } = {}) {
  const calls = []
  const id = production ? productionId : stagingId
  const otherId = '12345678-1234-1234-1234-123456789abc'
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/'))
    assert.equal(init.headers.Authorization, `Bearer ${envCredentials.CLOUDFLARE_API_TOKEN}`)
    assert.equal(init.redirect, 'error')
    const ok = result => Response.json({ success: true, result })
    if (url.includes('/pages/projects/')) {
      if (denyProject) return new Response('secret upstream failure', { status: 403 })
      return ok({ production_branch: production ? 'production' : 'main', deployment_configs: { production: { d1_databases: { DB: { id: wrongBinding ? productionId : id } } } } })
    }
    if (url.endsWith('/graphql')) {
      if (denyAnalytics) return Response.json({ errors: [{ message: 'secret upstream failure' }] })
      const body = JSON.parse(init.body)
      assert.match(body.query, /^query /)
      assert.equal(body.variables.day, new Date().toISOString().slice(0, 10))
      assert.equal(body.variables.accountTag, account)
      assert.ok(!body.query.includes('databaseId'), 'Daily totals cover the account quota scope')
      return Response.json({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: emptyAnalytics ? [] : [{ sum: { rowsRead: reads, rowsWritten: writes } }] }] } } })
    }
    if (denyStorage) return new Response('secret upstream failure', { status: 403 })
    if (url.includes('?')) return Response.json({ success: true, result: [{ uuid: id }, { uuid: otherId }], result_info: { total_count: incomplete ? 3 : 2 } })
    if (url.endsWith(id)) return ok({ file_size: 24600000 })
    if (url.endsWith(otherId)) return ok({ file_size: 103800000 })
    throw new Error('Unexpected external call')
  }
  return { calls, fetcher }
}

test('anonymous, expired, forbidden and non-GET requests are rejected before monitoring', async () => {
  for (const [options, req, status] of [
    [{}, request('http://localhost', 'GET', false), 401],
    [{ expired: true }, request(), 401],
    [{ role: 'SALES' }, request(), 403],
    [{}, request('http://localhost', 'POST'), 405],
  ]) {
    const f = fixture(options)
    const response = await api.onRequest({ request: req, env: { DB: f.DB } })
    assert.equal(response.status, status)
    assert.ok(!f.sql.includes('SELECT 1'))
  }
})

test('SUPERADMIN and existing Data Management permission can read all five rows', async () => {
  for (const options of [{}, { role: 'SALES', permission: true }]) {
    const f = fixture(options)
    const response = await api.onRequest({ request: request(), env: { DB: f.DB } })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const body = await response.json()
    assert.equal(body.environment, 'LOCAL')
    assert.equal(Object.keys(body.metrics).length, 5)
    assert.equal(body.metrics.d1Database.current, 24600000)
    assert.equal(body.metrics.zohoApi.current, null)
    assert.equal(body.metrics.d1Database.limit, null)
    assert.equal(body.metrics.d1Database.remaining, null)
    assert.ok(Date.parse(body.refreshedAt))
  }
})

test('local and unknown hosts never contact remote accounts even with credentials', async () => {
  for (const origin of ['http://localhost', 'http://127.0.0.1:8788', 'http://192.168.1.5:5173', 'https://preview.pc-tech-production.pages.dev', 'https://polarcanvas.in.attacker.test']) {
    const f = fixture()
    const body = await collectSystemUsage(request(origin), { DB: f.DB, ...envCredentials }, async () => { assert.fail('Remote call from unmapped or local environment') })
    assert.equal(body.metrics.d1Database.current, 24600000)
    assert.equal(body.metrics.totalD1.current, null)
    assert.equal(usageEnvironment(origin).target, null)
  }
})

test('staging and production reuse the correct deployment target; actual API values only', async () => {
  for (const production of [false, true]) {
    const f = fixture(), cf = cloudflare({ production })
    const body = await collectSystemUsage(request(production ? 'https://polarcanvas.in' : 'https://pc-tech.pages.dev'), { DB: f.DB, ...envCredentials }, cf.fetcher)
    assert.equal(body.environment, production ? 'PRODUCTION' : 'STAGING')
    assert.equal(body.metrics.totalD1.current, 128400000)
    assert.equal(body.metrics.d1RowsRead.current, 1210000)
    assert.equal(body.metrics.d1RowsWritten.current, 12420)
    assert.ok(cf.calls[0].url.endsWith(production ? '/pc-tech-production' : '/pc-tech'))
    assert.ok(!JSON.stringify(body).includes('secret'))
    assert.ok(!JSON.stringify(body).includes(account))
    for (const metric of Object.values(body.metrics)) {
      assert.equal(metric.limit, null, 'No assumed subscription limits')
      assert.equal(metric.remaining, null)
      if (metric.current !== null) assert.ok(Date.parse(metric.asOf))
    }
  }
})

test('wrong deployment binding or denied project metadata prevents account calls', async () => {
  for (const options of [{ wrongBinding: true }, { denyProject: true }]) {
    const f = fixture(), cf = cloudflare(options)
    const body = await collectSystemUsage(request('https://pc-tech.pages.dev'), { DB: f.DB, ...envCredentials }, cf.fetcher)
    assert.equal(cf.calls.length, 1)
    assert.equal(body.metrics.totalD1.current, null)
    assert.equal(body.metrics.d1Database.current, 24600000)
  }
})

test('storage and analytics failures are isolated; incomplete storage never appears as a total', async () => {
  for (const options of [{ denyStorage: true }, { incomplete: true }, { denyAnalytics: true }, { emptyAnalytics: true }]) {
    const f = fixture(), cf = cloudflare(options)
    const body = await collectSystemUsage(request('https://pc-tech.pages.dev'), { DB: f.DB, ...envCredentials }, cf.fetcher)
    const storageFailed = options.denyStorage || options.incomplete
    assert.equal(body.metrics.totalD1.current, storageFailed ? null : 128400000)
    assert.equal(body.metrics.d1RowsRead.current, storageFailed ? 1210000 : null)
    assert.equal(body.metrics.d1Database.current, 24600000)
    assert.ok(!JSON.stringify(body).includes('secret upstream'))
  }
})

test('bad size metadata does not hide other metrics and missing analytics is not zero', async () => {
  const f = fixture({ brokenSize: true }), cf = cloudflare({ reads: null, writes: 0 })
  const body = await collectSystemUsage(request('https://pc-tech.pages.dev'), { DB: f.DB, ...envCredentials }, cf.fetcher)
  assert.equal(body.metrics.d1Database.current, null)
  assert.equal(body.metrics.totalD1.current, 128400000)
  assert.equal(body.metrics.d1RowsRead.current, null)
  assert.equal(body.metrics.d1RowsWritten.current, 0)
})

test('malformed or negative metadata is unavailable, never guessed', async () => {
  for (const size of [null, undefined, '12345', -5, NaN, Infinity]) {
    const f = fixture({ size: size === undefined ? null : size })
    const body = await collectSystemUsage(request(), { DB: f.DB })
    assert.equal(body.metrics.d1Database.current, null)
  }
})

test('counts, storage and second-resolution IST times use readable formatting', () => {
  assert.equal(formatUsage(12420), '12,420')
  assert.equal(formatUsage(0, true), '0 Bytes')
  assert.equal(formatUsage(24600000, true), '24.6 MB')
  assert.equal(formatUsage(1250000000, true), '1.25 GB')
  assert.equal(formatUsage(null), 'Unavailable')
  assert.equal(formatUsage(-1), 'Unavailable')
  assert.equal(formatUsageTime('2026-09-28T06:13:20Z'), '28-Sep-2026 11:43:20 AM')
  assert.equal(formatUsageTime('invalid'), 'Unavailable')
})
