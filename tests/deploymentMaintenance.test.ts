import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { onRequest } from '../functions/_middleware.ts'
import { tokenHash, maintenanceHtml } from '../functions/lib/deploymentMaintenance.ts'
import { health, main, targetFor, requestTarget } from '../scripts/deployment-maintenance.mjs'
import { createHash } from 'node:crypto'

const token = 'a'.repeat(64)
async function context(path = '/', active = 1, options: { method?: string; token?: string; cookie?: string; broken?: boolean; missing?: boolean } = {}) {
  let calls = 0
  let databaseChecks = 0
  const gate = { active, token_hash: await tokenHash(token) }
  const ctx = {
    request: new Request(`https://pc-tech.pages.dev${path}`, { method: options.method || 'GET', headers: {
      ...(options.token ? { 'X-PC-Tech-Health-Token': options.token } : {}), ...(options.cookie ? { Cookie: options.cookie } : {}),
    } }),
    env: { DB: { withSession(mode: string) {
      assert.equal(mode, 'first-primary')
      return { prepare() { return {
        async first() { if (options.broken) throw new Error('private failure'); return options.missing ? null : gate },
        async all() { databaseChecks++; return { success: true, results: [] } },
      } } }
    } } },
    async next() { calls++; return new Response('application', { headers: { 'Set-Cookie': 'existing=preserved', 'Cache-Control': 'public' } }) },
  }
  const response = await onRequest(ctx as never)
  return { response, calls, databaseChecks }
}

test('all routes and existing sessions receive independent standalone maintenance without cookie changes', async () => {
  for (const path of ['/', '/inventory', '/production', '/production-planning', '/assets/index.js']) {
    const { response, calls } = await context(path, 1, { cookie: 'pc_tech_session=existing' })
    assert.equal(response.status, 503)
    assert.equal(calls, 0)
    assert.equal(response.headers.get('Retry-After'), '60')
    assert.equal(response.headers.get('Set-Cookie'), null)
    assert.match(response.headers.get('Cache-Control')!, /no-store/)
    assert.match(await response.text(), /System Update in Progress/)
  }
  assert.doesNotMatch(maintenanceHtml, /<script[^>]+src|<link|Cloudflare|branch|stack/i)
  assert.match(maintenanceHtml, /location.reload/)
})
test('API reads and writes are blocked, even with a health token on a write', async () => {
  for (const method of ['GET','POST','PATCH','DELETE']) {
    const { response, calls } = await context('/api/job-tracking', 1, { method, token })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).maintenance, true)
    assert.equal(calls, 0)
  }
  assert.equal((await context('/api/auth/me', 1, { method: 'POST', token })).response.status, 503)
})
test('off passes original session headers through and unknown control state fails closed', async () => {
  const { response, calls } = await context('/', 0)
  assert.equal(calls, 1)
  assert.equal(response.headers.get('Set-Cookie'), 'existing=preserved')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  for (const options of [{ broken: true }, { missing: true }]) {
    const result = await context('/', 0, options)
    assert.equal(result.response.status, 503)
    assert.equal(result.calls, 0)
  }
})
test('only the correct deployment token permits narrow GET health probes', async () => {
  for (const path of ['/', '/deployment.json', '/assets/index.js', '/api/auth/me']) {
    assert.equal((await context(path, 1, { token })).calls, 1)
    assert.equal((await context(path, 1, { token: 'wrong' })).response.status, 503)
  }
  const result = await context('/api/deployment-health', 1, { token })
  assert.equal(result.databaseChecks, 1)
  assert.deepEqual(await result.response.json(), { ok: true, database: true, authSchema: true })
  assert.equal((await context('/api/deployment-health', 0)).response.status, 404)
})
test('idle-tab endpoint is quiet when off and signals maintenance when on', async () => {
  assert.equal((await context('/api/deployment-status', 0)).response.status, 204)
  assert.equal((await context('/api/deployment-status', 1)).response.status, 503)
})
test('Dev and production use distinct explicit database/project/hostname allowlists', () => {
  assert.throws(() => targetFor('prod'))
  assert.throws(() => targetFor('__proto__'))
  const dev = targetFor('nonproduction'), prod = targetFor('production')
  assert.notEqual(dev.database, prod.database)
  assert.notEqual(dev.project, prod.project)
  assert.deepEqual(prod.origins, ['https://pc-tech-production.pages.dev', 'https://polarcanvas.in', 'https://www.polarcanvas.in'])
})
test('health checks detect wrong releases, broken assets, auth errors and database failures', async () => {
  const original = globalThis.fetch
  process.env.MAINTENANCE_TOKEN = token
  process.env.DEPLOYMENT_SHA = 'b'.repeat(40)
  const hash = createHash('sha256').update('asset').digest('hex')
  let defect = ''
  globalThis.fetch = async (input, init) => {
    assert.equal((init!.headers as Record<string,string>)['X-PC-Tech-Health-Token'], token)
    const path = new URL(String(input)).pathname
    if (path === '/') return new Response('<div id="root"></div><script src="/assets/a.js"></script><link href="/assets/a.css">')
    if (path === '/deployment.json') return Response.json({ commit: defect === 'release' ? 'wrong' : process.env.DEPLOYMENT_SHA, assets: { '/assets/a.js': hash, '/assets/a.css': hash } })
    if (path.startsWith('/assets/')) return new Response(defect === 'asset' ? 'bad' : 'asset')
    if (path === '/api/auth/me') return Response.json({ error: 'Authentication required' }, { status: defect === 'auth' ? 500 : 401 })
    return Response.json({ ok: defect !== 'database', database: true, authSchema: true })
  }
  try {
    await health(targetFor('nonproduction'))
    for (defect of ['release','asset','auth','database']) await assert.rejects(health(targetFor('nonproduction')))
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://pc-tech-production.pages.dev' } })
    await assert.rejects(requestTarget(targetFor('nonproduction'), 'https://pc-tech.pages.dev', '/', true), /left the target/)
  } finally { globalThis.fetch = original; delete process.env.MAINTENANCE_TOKEN; delete process.env.DEPLOYMENT_SHA }
})
test('both workflows enable before builds, confirm before migrations and reopen only after health', async () => {
  for (const target of ['nonproduction', 'production']) {
    const workflow = await readFile(`.github/workflows/deploy-${target}.yml`, 'utf8')
    assert.match(workflow, /cancel-in-progress: false/)
    assert.ok(workflow.indexOf(`on ${target}`) < workflow.indexOf('run: npm run build'))
    assert.ok(workflow.indexOf(`confirm ${target}`) < workflow.indexOf('command: d1 migrations apply'))
    assert.ok(workflow.indexOf('command: pages deploy dist') < workflow.indexOf(`off ${target}`))
    assert.doesNotMatch(workflow, /if:.*always\(\)/)
    assert.match(workflow, /Deployment failed\. Maintenance mode remains enabled/)
  }
  assert.deepEqual(JSON.parse(await readFile('public/_routes.json','utf8')), { version: 1, include: ['/*'], exclude: [] })
})

test('release control refuses stale owners and re-closes on public network failure', async () => {
  const original = globalThis.fetch
  const values = { CLOUDFLARE_ACCOUNT_ID: 'test', CLOUDFLARE_API_TOKEN: 'test', MAINTENANCE_TOKEN: token, MAINTENANCE_OWNER: 'current-run', DEPLOYMENT_SHA: 'b'.repeat(40) }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  Object.assign(process.env, values)
  let active = 1
  let controlOwner = 'other-run'
  const mutations: string[] = []
  const hash = createHash('sha256').update('asset').digest('hex')
  let publicFailure = false
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === 'api.cloudflare.com') {
      if (url.pathname.includes('/pages/')) return Response.json({ success: true, result: { production_branch: 'main', deployment_configs: { production: { fail_open: false, d1_databases: { DB: { id: targetFor('nonproduction').database } } } } } })
      const body = JSON.parse(init!.body as string)
      if (body.sql.startsWith('SELECT')) return Response.json({ success: true, result: [{ success: true, results: [{ active, owner: controlOwner, token_hash: await tokenHash(token), commit_sha: process.env.DEPLOYMENT_SHA }] }] })
      mutations.push(body.sql)
      if (body.sql.includes('SET active=0')) active = 0
      if (body.sql.includes('SET active=1')) active = 1
      return Response.json({ success: true, result: [{ success: true, meta: { changes: 1 } }] })
    }
    if (publicFailure) throw new Error('Network disconnected')
    if (url.pathname === '/') return new Response('<div id="root"></div><script src="/assets/a.js"></script><link href="/assets/a.css">')
    if (url.pathname === '/deployment.json') return Response.json({ commit: process.env.DEPLOYMENT_SHA, assets: { '/assets/a.js': hash, '/assets/a.css': hash } })
    if (url.pathname.startsWith('/assets/')) return new Response('asset')
    if (url.pathname === '/api/auth/me') return Response.json({ error: 'Authentication required' }, { status: 401 })
    return Response.json({ ok: true, database: true, authSchema: true })
  }
  try {
    await assert.rejects(main('off', 'nonproduction'), /does not belong/)
    assert.equal(active, 1)
    assert.equal(mutations.length, 0)
    controlOwner = 'current-run'
    await main('off', 'nonproduction')
    assert.equal(active, 0)
    assert.match(mutations[0], /owner=\? AND token_hash=\? AND commit_sha=\?/)
    publicFailure = true
    await assert.rejects(main('normal', 'nonproduction'), /Maintenance re-enabled/)
    assert.equal(active, 1)
  } finally {
    globalThis.fetch = original
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
