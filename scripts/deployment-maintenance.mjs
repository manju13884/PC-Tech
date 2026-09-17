import { createHash, randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { maintenanceHtml } from '../functions/lib/deploymentMaintenance.ts'

export const targets = Object.freeze({
  nonproduction: { project: 'pc-tech', branch: 'main', database: '0d749a66-9654-4767-b56a-afd4f8bcd9a1', origins: ['https://pc-tech.pages.dev'] },
  production: { project: 'pc-tech-production', branch: 'production', database: 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf', origins: ['https://pc-tech-production.pages.dev', 'https://polarcanvas.in', 'https://www.polarcanvas.in'] },
})
export function targetFor(name) {
  if (!Object.hasOwn(targets, name)) throw new Error('Explicit target must be nonproduction or production.')
  return targets[name]
}
const digest = value => createHash('sha256').update(value).digest('hex')
const required = name => { if (!process.env[name]) throw new Error(`Missing ${name}`); return process.env[name] }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function cloudflare(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${required('CLOUDFLARE_ACCOUNT_ID')}${path}`, {
    method, headers: { Authorization: `Bearer ${required('CLOUDFLARE_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  })
  const data = await response.json()
  if (!response.ok || !data.success) {
    const codes = (data.errors ?? []).map(error => `${error.code}: ${error.message}`).join('; ')
      .replaceAll(required('CLOUDFLARE_API_TOKEN'), '[redacted]').replaceAll(required('CLOUDFLARE_ACCOUNT_ID'), '[account]')
    throw new Error(`Cloudflare ${method} ${path} failed (${response.status}): ${codes}`)
  }
  return data.result
}
async function validateTarget(target) {
  const project = await cloudflare(`/pages/projects/${target.project}`)
  const db = project.deployment_configs?.production?.d1_databases?.DB
  if (project.production_branch !== target.branch || (db?.id ?? db?.database_id) !== target.database) {
    throw new Error('Pages branch/database binding does not match the explicit target. No state changed.')
  }
  return project
}
async function query(target, sql, params = []) {
  const result = await cloudflare(`/d1/database/${target.database}/query`, { sql, params })
  if (!result[0]?.success) throw new Error('Maintenance control query failed.')
  return result[0]
}
async function state(target) {
  return (await query(target, 'SELECT * FROM deployment_maintenance WHERE id=1')).results[0]
}
function owner() { return required('MAINTENANCE_OWNER') }
function revision() {
  const sha = required('DEPLOYMENT_SHA')
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('DEPLOYMENT_SHA must be a full Git commit SHA.')
  return sha
}
async function owned(target) {
  const row = await state(target)
  if (!row || row.active !== 1 || row.owner !== owner() || row.token_hash !== digest(required('MAINTENANCE_TOKEN')) || row.commit_sha !== revision()) {
    throw new Error('Maintenance lock/revision does not belong to this release. It remains enabled.')
  }
}

export async function requestTarget(target, origin, path, probe = false) {
  let url = new URL(path, origin)
  for (let redirects = 0; redirects < 4; redirects++) {
    if (!target.origins.includes(url.origin)) throw new Error('Health check redirect left the target environment.')
    const headers = probe ? { 'X-PC-Tech-Health-Token': required('MAINTENANCE_TOKEN') } : {}
    const response = await fetch(url, { headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) })
    if ([301,302,303,307,308].includes(response.status)) { url = new URL(response.headers.get('Location'), url); continue }
    return response
  }
  throw new Error('Too many health check redirects.')
}
async function confirmMaintenance(target) {
  for (const origin of target.origins) {
    for (const path of ['/', '/production-planning', '/inventory', '/api/auth/me']) {
      const response = await requestTarget(target, origin, path)
      if (response.status !== 503 || response.headers.get('X-PC-Tech-Maintenance') !== '1' || response.headers.has('Set-Cookie')) throw new Error('Maintenance is not consistently serving yet.')
      if (!path.startsWith('/api/') && !(await response.text()).includes('System Update in Progress')) throw new Error('Maintenance page is missing.')
    }
  }
}
export async function health(target) {
  for (const origin of target.origins) {
    const home = await requestTarget(target, origin, '/', true)
    const html = await home.text()
    if (!home.ok || !html.includes('id="root"') || home.headers.has('X-PC-Tech-Maintenance')) throw new Error('Application initialization HTML failed health check.')
    const manifestResponse = await requestTarget(target, origin, '/deployment.json', true)
    if (!manifestResponse.ok) throw new Error('Release manifest missing.')
    const manifest = await manifestResponse.json()
    if (manifest.commit !== revision() || !Object.keys(manifest.assets ?? {}).some(path => path.endsWith('.js')) || !Object.keys(manifest.assets).some(path => path.endsWith('.css'))) throw new Error('Wrong or incomplete release is serving.')
    const entryAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1])
    if (entryAssets.length < 2 || entryAssets.some(path => !manifest.assets[path])) throw new Error('HTML and release assets do not match.')
    for (const [path, hash] of Object.entries(manifest.assets)) {
      if (!/^\/assets\/[^/]+\.(js|css)$/.test(path)) throw new Error('Invalid release asset path.')
      const asset = await requestTarget(target, origin, path, true)
      if (!asset.ok || digest(Buffer.from(await asset.arrayBuffer())) !== hash) throw new Error(`Asset health check failed: ${path}`)
    }
    const auth = await requestTarget(target, origin, '/api/auth/me', true)
    const authBody = await auth.json()
    if (auth.status !== 401 || authBody.error !== 'Authentication required') throw new Error('Authentication initialization failed.')
    const db = await requestTarget(target, origin, '/api/deployment-health', true)
    const result = await db.json()
    if (!db.ok || !result.ok || !result.database || !result.authSchema) throw new Error('Database/auth schema health check failed.')
  }
}
async function retry(check) {
  let last
  for (let attempt = 0; attempt < 12; attempt++) {
    try { await check(); return } catch (error) { last = error; if (attempt < 11) await pause(5000) }
  }
  throw last
}
async function shell() {
  const directory = '.wrangler/maintenance-site'
  await mkdir(directory, { recursive: true })
  await writeFile(`${directory}/index.html`, maintenanceHtml)
  // This independent, dependency-free deployment also protects the first installation.
  await writeFile(`${directory}/_worker.js`, `const html=${JSON.stringify(maintenanceHtml)};
export default {fetch(request){const api=new URL(request.url).pathname.startsWith('/api/');return new Response(request.method==='HEAD'?null:api?JSON.stringify({maintenance:true,error:'System update in progress.'}):html,{status:503,headers:{'Content-Type':api?'application/json':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'60','X-PC-Tech-Maintenance':'1','X-Robots-Tag':'noindex'}})}};`)
  await writeFile(`${directory}/_routes.json`, JSON.stringify({ version: 1, include: ['/*'], exclude: [] }))
}
async function stamp() {
  const assets = {}
  for (const file of await readdir('dist/assets')) if (/\.(js|css)$/.test(file)) assets[`/assets/${file}`] = digest(await readFile(`dist/assets/${file}`))
  await writeFile('dist/deployment.json', JSON.stringify({ commit: revision(), assets }))
}

export async function main(command, environment) {
  const target = targetFor(environment)
  if (command === 'shell') return shell()
  if (command === 'stamp') return stamp()
  if (!['on','confirm','health','off','status','recover','emergency-off','normal'].includes(command)) throw new Error('Unknown maintenance command.')
  const project = await validateTarget(target)
  if (command === 'on') {
    const sha = revision()
    const run = process.env.MAINTENANCE_OWNER || `${required('GITHUB_RUN_ID')}-${required('GITHUB_RUN_ATTEMPT')}`
    if (!process.env.GITHUB_ENV && required('MAINTENANCE_TOKEN').length < 32) throw new Error('Use a random maintenance token of at least 32 characters.')
    if (project.deployment_configs.production.fail_open !== false) {
      // Pages requires equal runtime fail-open settings for both configs within a project.
      await cloudflare(`/pages/projects/${target.project}`, { deployment_configs: { production: { fail_open: false }, preview: { fail_open: false } } }, 'PATCH')
      if ((await validateTarget(target)).deployment_configs.production.fail_open !== false) throw new Error('Unable to enforce Pages fail-closed routing.')
    }
    const token = randomBytes(32).toString('hex')
    await query(target, `CREATE TABLE IF NOT EXISTS deployment_maintenance (
      id INTEGER PRIMARY KEY CHECK(id=1), active INTEGER NOT NULL CHECK(active IN(0,1)),
      owner TEXT NOT NULL, token_hash TEXT NOT NULL, commit_sha TEXT NOT NULL, updated_at TEXT NOT NULL)`)
    await query(target, `INSERT INTO deployment_maintenance VALUES (1,1,?,?,?,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET active=1, owner=excluded.owner, token_hash=excluded.token_hash,
      commit_sha=excluded.commit_sha, updated_at=excluded.updated_at WHERE deployment_maintenance.active=0`, [run, digest(token), sha])
    const row = await state(target)
    if (row.owner !== run || row.token_hash !== digest(token)) throw new Error('Another release owns maintenance. Use the documented recovery procedure.')
    if (process.env.GITHUB_ENV) {
      console.log(`::add-mask::${token}`)
      await appendFile(process.env.GITHUB_ENV, `MAINTENANCE_OWNER=${run}\nMAINTENANCE_TOKEN=${token}\n`)
    } else {
      // Manual on/recovery uses an explicit token provided through the environment.
      const supplied = required('MAINTENANCE_TOKEN')
      await query(target, 'UPDATE deployment_maintenance SET token_hash=? WHERE id=1 AND owner=?', [digest(supplied), run])
    }
    console.log(`${environment}: maintenance enabled.`)
  } else if (command === 'status') {
    const row = await state(target)
    console.log(JSON.stringify(row && { active: row.active, owner: row.owner, commit: row.commit_sha, updated: row.updated_at }))
  } else if (command === 'confirm') {
    await owned(target)
    await retry(() => confirmMaintenance(target))
    // Let requests already admitted by the previous version finish before migration.
    await pause(30000)
    console.log('Maintenance verified on every configured hostname.')
  } else if (command === 'recover') {
    const row = await state(target)
    if (!row?.active || row.owner !== required('MAINTENANCE_PREVIOUS_OWNER')) throw new Error('Recovery owner mismatch.')
    if (required('MAINTENANCE_TOKEN').length < 32) throw new Error('Use a new random recovery token of at least 32 characters.')
    await query(target, `UPDATE deployment_maintenance SET owner=?,token_hash=?,commit_sha=?,updated_at=datetime('now') WHERE id=1 AND owner=? AND active=1`, [owner(), digest(required('MAINTENANCE_TOKEN')), revision(), row.owner])
    await owned(target)
    console.log('Recovery lock acquired. Maintenance remains enabled; run off to validate and reopen.')
  } else if (command === 'health' || command === 'off') {
    await owned(target)
    await retry(() => health(target))
    if (command === 'off') {
      const result = await query(target, `UPDATE deployment_maintenance SET active=0,token_hash='',updated_at=datetime('now') WHERE id=1 AND active=1 AND owner=? AND token_hash=? AND commit_sha=?`, [owner(), digest(required('MAINTENANCE_TOKEN')), revision()])
      if (result.meta.changes !== 1) throw new Error('Release lock changed. Maintenance was not disabled.')
      console.log('Health checks passed. Maintenance disabled.')
    } else console.log('Release, assets, API, authentication and database checks passed.')
  } else if (command === 'normal') {
    try {
      for (const origin of target.origins) {
        const response = await requestTarget(target, origin, '/')
        if (!response.ok || response.headers.has('X-PC-Tech-Maintenance') || !(await response.text()).includes('id="root"')) throw new Error('Public application unavailable.')
      }
    } catch {
      // Re-close on HTTP and network failures, including a failed custom hostname.
      await query(target, 'UPDATE deployment_maintenance SET active=1,token_hash=? WHERE id=1 AND owner=?', [digest(required('MAINTENANCE_TOKEN')), owner()])
      throw new Error('Public verification failed. Maintenance re-enabled.')
    }
    console.log('Public application verified on every hostname.')
  } else if (command === 'emergency-off') {
    if (required('MAINTENANCE_CONFIRM') !== target.project) throw new Error('Explicit project confirmation is required.')
    const result = await query(target, `UPDATE deployment_maintenance SET active=0,token_hash='',updated_at=datetime('now') WHERE id=1 AND owner=?`, [owner()])
    if (result.meta.changes !== 1) throw new Error('Owner mismatch; no state changed.')
    console.log('Emergency override recorded. Verify the public application immediately.')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], process.argv[3]).catch(error => { console.error(error.message); console.error('Deployment failed. Maintenance mode remains enabled if it was activated.'); process.exitCode = 1 })
}
