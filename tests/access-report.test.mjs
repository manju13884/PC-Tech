import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function loadModule(path, replacements = {}) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to)
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
}
const sessionModule = loadModule('../functions/lib/session.ts')
const authModule = loadModule('../functions/lib/authenticatedUser.ts', { "'./session'": JSON.stringify(sessionModule) })
const { onRequest: report } = await import(loadModule('../functions/api/auth/access-report.ts', { "'../../lib/authenticatedUser'": JSON.stringify(authModule) }))
const { onRequest: logout } = await import(loadModule('../functions/api/auth/logout.ts', { "'../../lib/session'": JSON.stringify(sessionModule) }))
const { hashSessionToken } = await import(sessionModule)

async function setup() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_create_auth_tables.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../migrations/0070_add_session_logout_details.sql', import.meta.url), 'utf8'))
  sqlite.exec(`INSERT INTO users (id,email,full_name,password_hash,password_salt,role_id) VALUES (1,'admin@example.com','Admin','hash','salt',(SELECT id FROM roles WHERE name='SUPERADMIN'))`)
  const token = 'report-test-token'
  const hash = await hashSessionToken(token)
  sqlite.prepare(`INSERT INTO sessions (user_id,token_hash,session_version,expires_at) VALUES (1,?,1,datetime('now','+8 hours'))`).run(hash)
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql)
    const bound = (args = []) => ({
      bind: (...values) => bound(values),
      first: async () => statement.get(...args) || null,
      all: async () => ({ success: true, results: statement.all(...args) }),
      run: async () => ({ success: true, meta: statement.run(...args) }),
    })
    return bound()
  } }
  const context = (path = 'access-report', init = {}) => ({ env: { DB: db }, request: new Request(`http://localhost/api/auth/${path}`, { ...init, headers: { Cookie: `pc_tech_session=${token}`, ...init.headers } }) })
  return { sqlite, context }
}

test('report requires a valid SUPERADMIN session and does not expose session tokens', async () => {
  const { sqlite, context } = await setup()
  try {
    assert.equal((await report({ ...context(), request: new Request('http://localhost/api/auth/access-report') })).status, 401)
    const response = await report(context())
    const data = await response.json()
    assert.equal(data.records[0].logoutType, 'Active')
    assert.equal(data.records[0].logoutAt, null)
    assert.equal('token_hash' in data.records[0], false)
    sqlite.exec(`UPDATE users SET role_id=(SELECT id FROM roles WHERE name='ADMIN') WHERE id=1`)
    assert.equal((await report(context())).status, 403)
  } finally { sqlite.close() }
})

for (const [reason, expected] of [[undefined, 'USER'], ['idle', 'SYSTEM']]) {
  test(`logout records ${expected} and repeated logout preserves the original reason`, async () => {
    const { sqlite, context } = await setup()
    try {
      assert.equal((await logout(context('logout', { method: 'POST', body: reason ? JSON.stringify({ reason }) : undefined }))).status, 200)
      await logout(context('logout', { method: 'POST' }))
      const row = sqlite.prepare('SELECT * FROM sessions').get()
      assert.equal(row.logout_type, expected)
      assert.ok(row.revoked_at)
    } finally { sqlite.close() }
  })
}

test('report distinguishes expired and historical sessions and paginates', async () => {
  const { sqlite, context } = await setup()
  try {
    sqlite.exec(`INSERT INTO sessions (user_id,token_hash,session_version,expires_at) VALUES (1,'expired',1,datetime('now','-1 hour'));
      INSERT INTO sessions (user_id,token_hash,session_version,expires_at,revoked_at) VALUES (1,'legacy',1,datetime('now','+1 hour'),CURRENT_TIMESTAMP)`)
    let data = await (await report(context())).json()
    assert.equal(data.records.find(row => row.id === 2).logoutType, 'System logout')
    assert.equal(data.records.find(row => row.id === 3).logoutType, 'Unknown')
    for (let i = 0; i < 51; i++) sqlite.prepare(`INSERT INTO sessions (user_id,token_hash,session_version,expires_at) VALUES (1,?,1,datetime('now','+1 hour'))`).run(`extra-${i}`)
    data = await (await report(context())).json()
    assert.equal(data.records.length, 50)
    assert.equal(data.hasMore, true)
    assert.equal((await (await report(context('access-report?page=2'))).json()).records.length, 4)
  } finally { sqlite.close() }
})

test('invalidations record system logout while a password change can preserve its current session', async () => {
  const { sqlite } = await setup()
  try {
    sqlite.exec('UPDATE users SET session_version=2 WHERE id=1')
    assert.equal(sqlite.prepare('SELECT logout_type FROM sessions').get().logout_type, 'SYSTEM')
    sqlite.exec('UPDATE sessions SET session_version=2 WHERE id=1')
    assert.equal(sqlite.prepare('SELECT system_ended_at FROM sessions').get().system_ended_at, null)
    sqlite.exec(`UPDATE roles SET is_active=0 WHERE name='SUPERADMIN'`)
    assert.equal(sqlite.prepare('SELECT logout_type FROM sessions').get().logout_type, 'SYSTEM')
  } finally { sqlite.close() }
})
