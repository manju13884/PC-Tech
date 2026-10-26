import PizZip from 'pizzip'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return next(candidate.href, context)
    }
    return next(specifier, context)
  },
})
const { onRequest } = await import('../functions/api/leads.ts')
const { onRequestDelete: onStockDelete } = await import('../functions/api/stock-report.ts')
const { onRequest: onSpecialPermissions } = await import('../functions/api/auth/special-permissions.ts')
const { hashSessionToken } = await import('../functions/lib/session.ts')

async function fixture(grant = true) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync('migrations/0001_create_auth_tables.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0002_create_role_menu_permissions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0062_create_lead_management.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0063_update_lead_contact_and_assignment.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0064_create_user_special_permissions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0065_user_material_stock_delete_permissions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0066_add_lead_hold_and_not_qualified.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0067_add_lead_history_change_details.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0069_add_lead_onboarded_status.sql', 'utf8'))
  const ids = {},
    tokens = {}
  for (const [name, role] of [
    ['root', 'SUPERADMIN'],
    ['admin', 'ADMIN'],
    ['a', 'SALES'],
    ['b', 'SALES'],
    ['inactive', 'SALES'],
    ['accounts', 'ACCOUNTS'],
    ['production', 'PRODUCTION'],
  ]) {
    const rid = sqlite.prepare('SELECT id FROM roles WHERE name=?').get(role).id
    ids[name] = Number(
      sqlite
        .prepare(
          "INSERT INTO users(email,full_name,password_hash,password_salt,role_id,status) VALUES(?,?, 'x','x',?,?)",
        )
        .run(`${name}@example.test`, name, rid, name === 'inactive' ? 'INACTIVE' : 'ACTIVE')
        .lastInsertRowid,
    )
    tokens[name] = name + '-session'
    sqlite
      .prepare(
        'INSERT INTO sessions(user_id,token_hash,session_version,expires_at) VALUES(?,?,1,?)',
      )
      .run(
        ids[name],
        await hashSessionToken(tokens[name]),
        new Date(Date.now() + 3600000).toISOString(),
      )
  }
  if (grant)
    sqlite.exec(
      "UPDATE role_menu_permissions SET can_view=1,can_create=1,can_edit=1 WHERE menu_key='lead-management'",
    )
  const metrics = { readBatches: 0, queries: [] }
  let beforeBatch = null
  const db = {
    withSession() {
      return this
    },
    prepare(sql) {
      metrics.queries.push(sql)
      let values = []
      return {
        readOnly: /^\s*SELECT/i.test(sql),
        bind(...args) {
          values = args
          return this
        },
        async first() {
          return sqlite.prepare(sql).get(...values) || null
        },
        async all() {
          return { success: true, results: sqlite.prepare(sql).all(...values) }
        },
        async run() {
          const r = sqlite.prepare(sql).run(...values)
          return { success: true, meta: { changes: Number(r.changes) } }
        },
      }
    },
    async batch(statements) {
      if (statements.every((statement) => statement.readOnly)) metrics.readBatches++
      if (beforeBatch) {
        beforeBatch()
        beforeBatch = null
      }
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const s of statements) result.push(await (s.readOnly ? s.all() : s.run()))
        sqlite.exec('COMMIT')
        return result
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  }
  async function request(name, query = '', body, extraEnv = {}, handler = onRequest, method = body ? 'POST' : 'GET') {
    const result = await handler({
      request: new Request(`http://localhost/api/leads${query}`, {
        method,
        headers: {
          Cookie: `pc_tech_session=${tokens[name] || ''}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env: { DB: db, ...extraEnv },
    })
    if (result.headers.get('Content-Type')?.includes('spreadsheetml')) {
      assert.match(result.headers.get('Content-Disposition'), /sales-leads\.xlsx/)
      const zip = new PizZip(await result.arrayBuffer())
      return { status: result.status, excel: zip.file('xl/worksheets/sheet1.xml').asText() }
    }
    return { status: result.status, ...(await result.json()) }
  }
  const create = (company, coordinator = ids.a, extra = {}) => ({
    action: 'create',
    company,
    contact: 'Contact',
    mobile: '9876543210',
    email: '',
    city: 'Mumbai',
    address: '123 Main Road',
    source: 'Website',
    coordinator_id: coordinator,
    ...extra,
  })
  const lead = (company) => sqlite.prepare('SELECT * FROM sales_leads WHERE company=?').get(company)
  return {
    sqlite,
    metrics,
    ids,
    request,
    special: (name, body) => request(name, '', body, {}, onSpecialPermissions),
    stockDelete: (name, body) => request(name, '', body, {}, onStockDelete, 'DELETE'),
    create,
    lead,
    race(fn) {
      beforeBatch = fn
    },
  }
}

test('dashboard summary respects authentication, permissions and assigned lead scope without returning lead records', async () => {
  const f = await fixture()
  await f.request('root', '', f.create('Lead A', f.ids.a))
  await f.request('root', '', f.create('Lead B', f.ids.b, { mobile: '9876543211' }))
  const own = await f.request('a', '?summary=1')
  assert.equal(own.status, 200)
  assert.equal(own.summary.reduce((total, row) => total + row.count, 0), 1)
  assert.equal('leads' in own, false)
  const all = await f.request('root', '?summary=1')
  assert.equal(all.summary.reduce((total, row) => total + row.count, 0), 2)
  assert.equal((await f.request('missing', '?summary=1')).status, 401)
  assert.equal((await f.request('accounts', '?summary=1')).status, 403)
  const denied = await fixture(false)
  assert.equal((await denied.request('a', '?summary=1')).status, 403)
})

test('default permissions grant only SUPERADMIN; view access does not grant writes', async () => {
  const f = await fixture(false)
  assert.equal((await f.request('root')).status, 200)
  for (const name of ['admin', 'a', 'accounts', 'production'])
    assert.equal((await f.request(name)).status, 403)
  f.sqlite.exec(
    "UPDATE role_menu_permissions SET can_view=1 WHERE menu_key='lead-management' AND role_id=(SELECT id FROM roles WHERE name='ADMIN')",
  )
  assert.equal((await f.request('admin')).status, 200)
  assert.equal((await f.request('admin', '', f.create('Denied'))).status, 403)
  await f.request('root', '', f.create('A'))
  const a = f.lead('A')
  assert.equal(
    (
      await f.request('admin', '', {
        action: 'status',
        id: a.id,
        version: a.version,
        status: 'Contacted',
      })
    ).status,
    403,
  )
})

test('duplicate checks cover formatted mobiles, email and simultaneous unconfirmed creates', async () => {
  const f = await fixture()
  await f.request(
    'a',
    '',
    f.create('Original', f.ids.a, { mobile: '+91 (987) 654-3210', email: 'person@example.test' }),
  )
  for (const fields of [
    { company: ' original ', mobile: 'different' },
    { company: 'Other', mobile: '919876543210' },
    { company: 'Other', mobile: 'different', email: 'PERSON@example.test' },
  ]) {
    const response = await f.request('a', '', f.create('Other', f.ids.a, fields))
    assert.equal(response.status, 409)
    assert.equal(response.duplicate, true)
    assert.equal(response.leads, undefined)
  }
  const results = await Promise.all([
    f.request('a', '', f.create('Race', f.ids.a, { mobile: 'race' })),
    f.request('a', '', f.create('Race', f.ids.a, { mobile: 'race' })),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS n FROM sales_leads WHERE company='Race'").get().n,
    1,
  )
})

test('session and role access; only active SALES coordinators; SALES assignment is forced', async () => {
  const f = await fixture()
  for (const name of ['accounts', 'production']) assert.equal((await f.request(name)).status, 403)
  assert.equal((await f.request('unknown')).status, 401)
  const all = await f.request('admin')
  assert.deepEqual(
    all.coordinators.map((c) => c.full_name),
    ['a', 'b'],
  )
  assert.deepEqual(
    (await f.request('a')).coordinators.map((c) => c.id),
    [f.ids.a],
  )
  assert.equal((await f.request('a', '', f.create('Denied', f.ids.b))).status, 403)
  assert.equal((await f.request('admin', '', f.create('Inactive', f.ids.inactive))).status, 400)
  assert.equal((await f.request('a', '', f.create('Own'))).status, 200)
  assert.equal(f.lead('Own').coordinator_id, f.ids.a)
  f.sqlite.exec(
    "UPDATE role_menu_permissions SET can_view=0,can_full=0 WHERE role_id=(SELECT id FROM roles WHERE name='ADMIN')",
  )
  assert.equal((await f.request('admin')).status, 403)
  assert.equal((await f.request('root')).status, 200)
})

test('visibility applies to listing, summary, search, forged filters, details and every write action', async () => {
  const f = await fixture()
  await f.request('admin', '', f.create('A', f.ids.a))
  await f.request('admin', '', f.create('B', f.ids.b, { mobile: '12345' }))
  const a = f.lead('A'),
    b = f.lead('B')
  assert.equal((await f.request('root')).total, 2)
  assert.equal((await f.request('admin')).total, 2)
  assert.equal((await f.request('a')).total, 1)
  assert.equal((await f.request('a')).summary[0].count, 1)
  assert.equal((await f.request('b', '?search=LD-000001')).total, 0)
  const exported = await f.request('b', '?export=excel')
  assert.ok(exported.excel.includes(b.lead_number))
  assert.ok(!exported.excel.includes(a.lead_number))
  assert.equal((await f.request('b', `?coordinator=${f.ids.a}`)).leads[0].id, b.id)
  assert.equal((await f.request('b', `?id=${a.id}`)).status, 404)
  for (const action of ['edit', 'status', 'followup', 'convert'])
    assert.equal((await f.request('b', '', { action, id: a.id, version: a.version })).status, 404)
  assert.equal(
    (
      await f.request('a', '', {
        action: 'reassign',
        id: a.id,
        version: a.version,
        coordinator_id: f.ids.b,
      })
    ).status,
    403,
  )
})

test('reassignment revokes prior access, preserves activities, and rejects stale/in-flight writes', async () => {
  const f = await fixture()
  await f.request('a', '', f.create('A'))
  let a = f.lead('A')
  assert.equal(
    (
      await f.request('a', '', {
        action: 'followup',
        id: a.id,
        version: a.version,
        contact_date: '2026-10-19',
        mode: 'Call',
        discussion: 'Interested',
        next_follow_up_date: '2026-10-21',
        next_action: 'Send details',
      })
    ).status,
    200,
  )
  a = f.lead('A')
  assert.equal(
    (
      await f.request('admin', '', {
        action: 'reassign',
        id: a.id,
        version: a.version,
        coordinator_id: f.ids.b,
      })
    ).status,
    200,
  )
  assert.equal((await f.request('a', `?id=${a.id}`)).status, 404)
  const detail = await f.request('b', `?id=${a.id}`)
  assert.equal(detail.activities.length, 1)
  assert.ok(
    detail.history.some(
      (h) =>
        h.event === 'Assignment' &&
        h.previous_value === String(f.ids.a) &&
        h.new_value === String(f.ids.b),
    ),
  )
  assert.equal(
    (
      await f.request('b', '', {
        action: 'status',
        id: a.id,
        version: a.version,
        status: 'Qualified',
      })
    ).status,
    409,
  )
  a = f.lead('A')
  f.race(() =>
    f.sqlite
      .prepare('UPDATE sales_leads SET coordinator_id=?,version=version+1 WHERE id=?')
      .run(f.ids.a, a.id),
  )
  assert.equal(
    (
      await f.request('b', '', {
        action: 'followup',
        id: a.id,
        version: a.version,
        contact_date: '2026-10-20',
        mode: 'Email',
        discussion: 'Must not persist',
        next_follow_up_date: '2026-10-22',
      })
    ).status,
    409,
  )
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sales_lead_activities').get().n, 1)
})

test('validation, duplicate warning/confirmation, status history and terminal follow-up counts', async () => {
  const f = await fixture()
  for (const extra of [
    { company: ' ' },
    { city: '' },
    { mobile: '', email: '' },
    { email: 'bad' },
    { source: 'invalid' },
  ])
    assert.equal((await f.request('a', '', f.create('A', f.ids.a, extra))).status, 400)
  await f.request('a', '', f.create('A'))
  const dup = await f.request('a', '', f.create('A'))
  assert.equal(dup.status, 409)
  assert.equal(dup.duplicate, true)
  assert.equal(
    (await f.request('a', '', f.create('A', f.ids.a, { confirm_duplicate: true }))).status,
    200,
  )
  let a = f.lead('A')
  assert.equal(
    (await f.request('a', '', { action: 'status', id: a.id, version: a.version, status: 'Closed' }))
      .status,
    400,
  )
  assert.equal(
    (
      await f.request('a', '', {
        action: 'status',
        id: a.id,
        version: a.version,
        status: 'Converted',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request('a', '', {
        action: 'status',
        id: a.id,
        version: a.version,
        status: 'Closed',
        closure_reason: 'Duplicate',
      })
    ).status,
    200,
  )
  a = f.lead('A')
  assert.equal(a.next_follow_up_date, null)
  const detail = await f.request('a', `?id=${a.id}`)
  assert.ok(detail.history.some((h) => h.event === 'Status' && h.new_value === 'Closed: Duplicate'))
  const today = (await f.request('a')).today
  assert.equal(
    (
      await f.request('a', '', {
        action: 'followup',
        id: a.id,
        version: a.version,
        contact_date: today,
        mode: 'Call',
        discussion: 'Explicitly scheduled',
        next_follow_up_date: today,
      })
    ).status,
    200,
  )
  assert.equal((await f.request('a')).summary.find((s) => s.status === 'Closed').due, 1)
})

test('pagination, due dates and status tabs remain scoped', async () => {
  const f = await fixture()
  for (let i = 0; i < 28; i++)
    await f.request('admin', '', f.create(`A-${i}`, f.ids.a, { mobile: String(i) }))
  await f.request('admin', '', f.create('B', f.ids.b, { mobile: 'other' }))
  assert.equal((await f.request('a')).leads.length, 25)
  assert.equal((await f.request('a', '?page=2')).leads.length, 3)
  assert.equal((await f.request('a', '?status=New')).total, 28)
  assert.equal((await f.request('a', '?status=Converted')).total, 0)
  let a = f.lead('A-0')
  await f.request('a', '', {
    action: 'followup',
    id: a.id,
    version: a.version,
    contact_date: '2020-01-01',
    mode: 'Call',
    discussion: 'Old',
    next_follow_up_date: '2020-01-02',
  })
  assert.equal((await f.request('a')).summary[0].overdue, 1)
  assert.equal((await f.request('b', '?follow_up=2020-01-02')).total, 0)
  assert.equal((await f.request('a', '?follow_up=2020-01-02')).total, 1)
})

test('conversion links a verified Zoho customer once; failed verification leaves lead unchanged', async () => {
  const f = await fixture()
  await f.request('b', '', f.create('A', f.ids.b))
  await f.special('root', {userId:f.ids.a,permissionKey:'lead-management:view-all',granted:true})
  let a = f.lead('A')
  await f.request('a', '', { action: 'status', id: a.id, version: a.version, status: 'Qualified' })
  a = f.lead('A')
  const originalFetch = globalThis.fetch,
    methods = []
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/oauth/'))
      return Response.json({ access_token: 'mock', expires_in: 3600 })
    methods.push(init.method || 'GET')
    return Response.json({
      contacts: [
        { contact_id: 'zoho-1', contact_name: 'A', contact_type: 'customer', status: 'active' },
      ],
      page_context: { has_more_page: false },
    })
  }
  try {
    const env = {
      ZOHO_CLIENT_ID: 'mock',
      ZOHO_CLIENT_SECRET: 'mock',
      ZOHO_REFRESH_TOKEN: 'mock',
      ZOHO_ORG_ID: '123',
      ZOHO_REGION: 'in',
    }
    const body = {
      action: 'convert',
      id: a.id,
      version: a.version,
      confirm: true,
      customer_id: 'missing',
    }
    assert.equal((await f.request('a', '', body, env)).status, 400)
    assert.equal(f.lead('A').status, 'Qualified')
    assert.equal((await f.request('a', '', { ...body, customer_id: 'zoho-1' }, env)).status, 200)
    a = f.lead('A')
    assert.equal(a.status, 'Converted')
    assert.equal(a.customer_id, 'zoho-1')
    assert.equal(
      (await f.request('a', '', { ...body, version: a.version, customer_id: 'zoho-1' }, env))
        .status,
      409,
    )
    assert.ok(methods.every((m) => m === 'GET'))
    assert.equal(
      (await f.request('a', `?id=${a.id}`)).history.filter((h) => h.event === 'Conversion').length,
      1,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

 test('contact, address and coordinator are optional; comma-separated mobiles persist', async () => {
  const f = await fixture()
  const result = await f.request('admin', '', f.create('Unassigned', '', {contact: '', address: '', mobile: '9876543210, 9123456780'}))
  assert.equal(result.status, 200)
  const lead = f.lead('Unassigned')
  assert.equal(lead.coordinator_id, null)
  assert.equal(lead.contact, '')
  assert.equal(lead.address, '')
  assert.equal((await f.request('admin')).leads.length, 1)
  assert.equal((await f.request('admin', '', {action: 'reassign', id: lead.id, version: lead.version, coordinator_id: f.ids.a, confirm: true})).status, 200)
  assert.equal((await f.request('a')).leads.length, 1)
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sales_lead_history WHERE event='Assignment' AND previous_value IS NULL AND new_value=?").get(String(f.ids.a)).n, 1)
 })

test('duplicate mobile warning matches individual numbers in comma-separated lists', async () => {
  const f = await fixture()
  assert.equal((await f.request('admin', '', f.create('Multiple', f.ids.a, {mobile: '1234567890, +91 (987) 654-3210'}))).status, 200)
  assert.equal((await f.request('admin', '', f.create('Single', f.ids.a, {mobile: '919876543210'}))).status, 409)
  assert.equal((await f.request('admin', '', f.create('Overlap', f.ids.a, {mobile: '5555555555, 1234567890'}))).status, 409)
})

test('lead date formatting uses spaces and preserves IST timestamp conversion', async () => {
  const { formatLeadDate, formatLeadDateTime } = await import('../src/features/lead-management/leadDateFormatting.ts')
  assert.equal(formatLeadDate('2026-10-21'), '21 Oct 2026')
  assert.equal(formatLeadDateTime('2026-10-20 20:00:00'), '21 Oct 2026, 01:30 am')
  assert.equal(formatLeadDate(null, 'None'), 'None')
})

test('lightweight form reads return the latest lead without history and still enforce ownership', async () => {
  const f = await fixture()
  await f.request('a', '', f.create('Quick edit'))
  const lead = f.lead('Quick edit')
  const result = await f.request('a', `?id=${lead.id}&section=form`)
  assert.equal(result.status, 200)
  assert.equal(result.lead.version, lead.version)
  assert.deepEqual(result.activities, [])
  assert.deepEqual(result.history, [])
  assert.equal((await f.request('b', `?id=${lead.id}&section=form`)).status, 404)
  assert.ok((await f.request('a', `?id=${lead.id}`)).history.length > 0)
})

test('list reads use one database batch and form reads skip coordinator and history queries', async () => {
  const f = await fixture()
  await f.request('a', '', f.create('Fast forms'))
  const lead = f.lead('Fast forms')
  assert.equal((await f.request('a')).status, 200)
  assert.equal(f.metrics.readBatches, 1)
  f.metrics.queries.length = 0
  assert.equal((await f.request('a', `?id=${lead.id}&section=form`)).status, 200)
  assert.equal(f.metrics.readBatches, 1)
  assert.equal(f.metrics.queries.some(sql => /sales_lead_(activities|history)|ORDER BY u.full_name/.test(sql)), false)
})

test('only SUPERADMIN can grant or revoke per-user reassignment permission', async () => {
  const f = await fixture()
  assert.equal((await f.special('unknown')).status, 401)
  for (const name of ['a', 'admin', 'accounts']) {
    assert.equal((await f.special(name)).status, 403)
    assert.equal((await f.special(name, { userId: f.ids.a, granted: true })).status, 403)
  }
  assert.equal((await f.special('root')).status, 200)
  for (const body of [{userId:f.ids.inactive,granted:true},{userId:f.ids.accounts,granted:true},{userId:f.ids.root,granted:false},{userId:f.ids.a,granted:'true'},{userId:-1,granted:true}])
    assert.equal((await f.special('root',body)).status,400)
  assert.equal((await f.special('root', {userId:f.ids.a,granted:true})).status,200)
  assert.equal(f.sqlite.prepare('SELECT updated_by FROM user_special_permissions WHERE user_id=?').get(f.ids.a).updated_by, f.ids.root)
  assert.equal((await f.request('a')).permissions.reassign,true)
  assert.equal((await f.request('b')).permissions.reassign,false)
  assert.equal((await f.special('root', {userId:f.ids.a,granted:false})).status,200)
  assert.equal((await f.request('a')).permissions.reassign,false)
})

test('granted SALES user can reassign accessible leads without gaining access to other leads', async () => {
  const f = await fixture()
  await f.request('a','',f.create('A'))
  await f.request('b','',f.create('B',f.ids.b,{mobile:'12345'}))
  const a = f.lead('A'), b = f.lead('B')
  const reassign = {action:'reassign',id:a.id,version:a.version,coordinator_id:f.ids.b,confirm:true}
  assert.equal((await f.request('a','',reassign)).status,403)
  await f.special('root',{userId:f.ids.a,granted:true})
  assert.deepEqual((await f.request('a')).coordinators.map(c=>c.id),[f.ids.a,f.ids.b])
  assert.equal((await f.request('a',`?id=${b.id}`)).status,404)
  assert.equal((await f.request('a','',{...reassign,id:b.id,version:b.version})).status,404)
  assert.equal((await f.request('a','',f.create('Forged',f.ids.b))).status,403)
  assert.equal((await f.request('a','',reassign)).status,200)
  assert.equal((await f.request('a',`?id=${a.id}`)).status,404)
  assert.equal(f.lead('A').coordinator_id,f.ids.b)
  assert.ok(f.sqlite.prepare("SELECT id FROM sales_lead_history WHERE lead_id=? AND event='Assignment' AND changed_by=?").get(a.id,f.ids.a))
  await f.request('a','',f.create('After grant',f.ids.a,{mobile:'55555'}))
  const next=f.lead('After grant')
  await f.special('root',{userId:f.ids.a,granted:false})
  assert.equal((await f.request('a','',{...reassign,id:next.id,version:next.version})).status,403)
})

test('special reassignment grant requires normal Lead Management view and edit access', async () => {
  const f = await fixture()
  await f.request('a','',f.create('A'))
  const lead=f.lead('A')
  await f.special('root',{userId:f.ids.a,granted:true})
  f.sqlite.exec("UPDATE role_menu_permissions SET can_edit=0,can_full=0 WHERE role_id=(SELECT id FROM roles WHERE name='SALES') AND menu_key='lead-management'")
  assert.equal((await f.request('a')).permissions.reassign,false)
  assert.equal((await f.request('a','',{action:'reassign',id:lead.id,version:lead.version,coordinator_id:f.ids.b})).status,403)
})

test('Material Stock deletion uses explicit user grants and ignores role delete access', async () => {
  const f = await fixture()
  f.sqlite.exec("INSERT INTO role_menu_permissions(role_id,menu_key,can_view,can_full,can_delete) SELECT id,'material-stock',1,1,1 FROM roles WHERE name IN ('ADMIN','SALES') ON CONFLICT(role_id,menu_key) DO UPDATE SET can_view=1,can_full=1,can_delete=1")
  assert.equal((await f.stockDelete('a',{inventory_stock_id:123,reason:'Test'})).status,403)
  assert.equal((await f.stockDelete('admin',{inventory_stock_id:123,reason:'Test'})).status,403)
  assert.equal((await f.special('root',{userId:f.ids.a,permissionKey:'material-stock:delete',granted:true})).status,200)
  assert.equal((await f.stockDelete('a',{})).status,400)
  assert.equal((await f.stockDelete('b',{inventory_stock_id:123,reason:'Test'})).status,403)
  assert.equal((await f.request('a')).permissions.reassign,false)
  assert.equal((await f.special('root')).users.find(u=>u.id===f.ids.a).deleteStock,1)
  assert.equal((await f.special('root',{userId:f.ids.a,permissionKey:'material-stock:delete',granted:false})).status,200)
  assert.equal((await f.stockDelete('a',{inventory_stock_id:123,reason:'Test'})).status,403)
  assert.equal((await f.stockDelete('root',{})).status,400)
  assert.equal((await f.special('a',{userId:f.ids.a,permissionKey:'material-stock:delete',granted:true})).status,403)
  assert.equal((await f.special('root',{userId:f.ids.a,permissionKey:'invalid',granted:true})).status,400)
})

test('Material Stock user grants require view access and support non-sales users', async () => {
  const f = await fixture()
  assert.equal((await f.special('root',{userId:f.ids.accounts,permissionKey:'material-stock:delete',granted:true})).status,200)
  assert.equal((await f.stockDelete('accounts',{})).status,403)
  f.sqlite.exec("INSERT INTO role_menu_permissions(role_id,menu_key,can_view) SELECT id,'stock-report',1 FROM roles WHERE name='ACCOUNTS'")
  assert.equal((await f.stockDelete('accounts',{})).status,400)
  assert.equal((await f.special('root')).users.some(u=>u.id===f.ids.accounts),true)
})

test('user permission migration preserves grants and converts existing role stock deletion access', () => {
  const sqlite=new DatabaseSync(':memory:')
  sqlite.exec(readFileSync('migrations/0001_create_auth_tables.sql','utf8'))
  sqlite.exec(readFileSync('migrations/0002_create_role_menu_permissions.sql','utf8'))
  sqlite.exec(readFileSync('migrations/0064_create_user_special_permissions.sql','utf8'))
  sqlite.exec("INSERT INTO users(id,email,full_name,password_hash,password_salt,role_id) SELECT 1,'admin@test','Admin','x','x',id FROM roles WHERE name='ADMIN'")
  sqlite.exec("INSERT INTO role_menu_permissions(role_id,menu_key,can_delete) SELECT id,'material-stock',1 FROM roles WHERE name='ADMIN' ON CONFLICT(role_id,menu_key) DO UPDATE SET can_delete=1")
  sqlite.exec("INSERT INTO user_special_permissions(user_id,permission_key,granted,updated_by) VALUES(1,'lead-management:reassign',1,1)")
  sqlite.exec(readFileSync('migrations/0065_user_material_stock_delete_permissions.sql','utf8'))
  assert.equal(sqlite.prepare("SELECT granted FROM user_special_permissions WHERE user_id=1 AND permission_key='lead-management:reassign'").get().granted,1)
  assert.equal(sqlite.prepare("SELECT granted FROM user_special_permissions WHERE user_id=1 AND permission_key='material-stock:delete'").get().granted,1)
  sqlite.exec("INSERT INTO users(id,email,full_name,password_hash,password_salt,role_id) SELECT 2,'new@test','New admin','x','x',id FROM roles WHERE name='ADMIN'")
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM user_special_permissions WHERE user_id=2').get().n,0)
  sqlite.close()
})

test('all-leads grant expands listing, summary, filters, details, export and actions', async () => {
  const f=await fixture()
  await f.request('a','',f.create('Own'))
  await f.request('b','',f.create('Other',f.ids.b,{mobile:'12345'}))
  await f.request('admin','',f.create('Unassigned','',{mobile:'54321'}))
  const other=f.lead('Other')
  assert.equal((await f.request('a')).total,1)
  assert.equal((await f.special('a',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:true})).status,403)
  assert.equal((await f.special('root',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:true})).status,200)
  const all=await f.request('a')
  assert.equal(all.admin,false)
  assert.equal(all.permissions.viewAll,true)
  assert.equal(all.permissions.reassign,true)
  assert.equal(all.total,3)
  assert.equal(all.summary.reduce((n,s)=>n+s.count,0),3)
  assert.deepEqual(all.coordinators.map(c=>c.id),[f.ids.a,f.ids.b])
  assert.equal((await f.request('a',`?coordinator=${f.ids.b}`)).leads[0].id,other.id)
  assert.equal((await f.request('a','?search=Other')).total,1)
  assert.equal((await f.request('a',`?id=${other.id}`)).lead.company,'Other')
  assert.ok((await f.request('a',`?id=${other.id}`)).history.length>0)
  assert.ok((await f.request('a','?export=excel')).excel.includes('Other'))
  assert.ok((await f.request('a','?export=excel')).excel.includes('Unassigned'))
  assert.equal((await f.request('a','',{action:'status',id:other.id,version:other.version,status:'Qualified'})).status,200)
  assert.equal((await f.request('b')).total,1)
  await f.special('root',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:false})
  assert.equal((await f.request('a')).total,1)
  assert.equal((await f.request('a',`?id=${other.id}`)).status,404)
  assert.ok(!(await f.request('a','?export=excel')).excel.includes('Other'))
})

test('all-leads grant includes reassignment across coordinators', async () => {
  const f=await fixture()
  await f.request('b','',f.create('Other',f.ids.b))
  const other=f.lead('Other')
  await f.special('root',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:true})
  assert.equal((await f.request('a','',{action:'reassign',id:other.id,version:other.version,coordinator_id:f.ids.a,confirm:true})).status,200)
  assert.equal(f.lead('Other').coordinator_id,f.ids.a)
})

test('non-sales all-leads users require menu access and receive lead actions', async () => {
  const f=await fixture()
  await f.request('a','',f.create('Visible'))
  await f.special('root',{userId:f.ids.accounts,permissionKey:'lead-management:view-all',granted:true})
  f.sqlite.exec("UPDATE role_menu_permissions SET can_view=0,can_full=0 WHERE role_id=(SELECT id FROM roles WHERE name='ACCOUNTS') AND menu_key='lead-management'")
  assert.equal((await f.request('accounts')).status,403)
  f.sqlite.exec("UPDATE role_menu_permissions SET can_view=1,can_full=1 WHERE role_id=(SELECT id FROM roles WHERE name='ACCOUNTS') AND menu_key='lead-management'")
  const all=await f.request('accounts')
  assert.equal(all.status,200)
  assert.equal(all.total,1)
  assert.equal(all.permissions.create,false)
  assert.equal(all.permissions.edit,true)
  assert.equal(all.permissions.reassign,true)
  assert.equal((await f.request('accounts','',f.create('Denied'))).status,403)
})

test('all-leads grant permits editing, follow-up and status actions on other coordinators leads and revocation removes them', async () => {
  const f=await fixture()
  await f.request('b','',f.create('Other',f.ids.b))
  f.sqlite.exec("UPDATE role_menu_permissions SET can_edit=0,can_full=0 WHERE role_id=(SELECT id FROM roles WHERE name='SALES') AND menu_key='lead-management'")
  await f.special('root',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:true})
  assert.equal((await f.request('a')).permissions.edit,true)
  assert.equal((await f.request('a')).permissions.reassign,true)
  let lead=f.lead('Other')
  assert.equal((await f.request('a','',{...f.create('Other',f.ids.b),action:'edit',id:lead.id,version:lead.version,remarks:'Edited by all-leads user'})).status,200)
  lead=f.lead('Other')
  assert.equal(lead.coordinator_id,f.ids.b)
  assert.equal(lead.remarks,'Edited by all-leads user')
  assert.equal((await f.request('a','',{action:'followup',id:lead.id,version:lead.version,contact_date:'2026-10-21',mode:'Call',discussion:'Discussed delivery',next_follow_up_date:'2026-10-22',next_action:'Send quote'})).status,200)
  lead=f.lead('Other')
  assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status:'Qualified'})).status,200)
  lead=f.lead('Other')
  assert.equal(f.sqlite.prepare('SELECT created_by FROM sales_lead_activities WHERE lead_id=?').get(lead.id).created_by,f.ids.a)
  await f.special('root',{userId:f.ids.a,permissionKey:'lead-management:view-all',granted:false})
  assert.equal((await f.request('a')).permissions.edit,false)
  assert.equal((await f.request('a')).permissions.reassign,false)
  for(const action of ['edit','followup','status','convert','reassign'])
    assert.equal((await f.request('a','',{action,id:lead.id,version:lead.version})).status,403)
})

test('On Hold and Not Qualified require reasons, appear in filters/export and retain audit history', async () => {
  const f=await fixture()
  await f.request('a','',f.create('Status reasons'))
  for(const status of ['On Hold','Not Qualified']) {
    let lead=f.lead('Status reasons')
    for(const status_reason of ['', '   ', 'x'.repeat(2001)])
      assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status,status_reason})).status,400)
    const status_reason=`Reason for ${status}`
    assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status,status_reason})).status,200)
    lead=f.lead('Status reasons')
    assert.equal(lead.status,status)
    assert.equal(lead.status_reason,status_reason)
    assert.equal(lead.closure_reason,'')
    const listing=await f.request('a',`?status=${encodeURIComponent(status)}`)
    assert.equal(listing.total,1)
    assert.equal(listing.summary.find(s=>s.status===status).count,1)
    const detail=await f.request('a',`?id=${lead.id}`)
    assert.ok(detail.history.some(h=>h.event==='Status'&&h.new_value===`${status}: ${status_reason}`))
    assert.ok((await f.request('a','?export=excel')).excel.includes(status_reason))
    assert.throws(()=>f.sqlite.prepare("UPDATE sales_leads SET status_reason='' WHERE id=?").run(lead.id))
    assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status,status_reason:'Updated reason'})).status,200)
    assert.ok((await f.request('a',`?id=${lead.id}`)).history.some(h=>h.new_value===`${status}: Updated reason`))
  }
  let lead=f.lead('Status reasons')
  assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status:'Contacted'})).status,200)
  assert.equal(f.lead('Status reasons').status_reason,'')
  assert.ok((await f.request('a',`?id=${lead.id}`)).history.some(h=>h.new_value==='On Hold: Reason for On Hold'))
})

test('status migration preserves lead addresses, existing closure reasons, follow-ups and history', () => {
  const sqlite=new DatabaseSync(':memory:')
  for(const file of ['0001_create_auth_tables.sql','0002_create_role_menu_permissions.sql','0062_create_lead_management.sql','0063_update_lead_contact_and_assignment.sql'])
    sqlite.exec(readFileSync(`migrations/${file}`,'utf8'))
  sqlite.exec("INSERT INTO users(id,email,full_name,password_hash,password_salt,role_id) SELECT 1,'root@test','Root','x','x',id FROM roles WHERE name='SUPERADMIN'")
  sqlite.exec("INSERT INTO sales_leads(id,company,contact,mobile,city,address,source,status,closure_reason,created_by,updated_by,mutation_token) VALUES(1,'Existing','','123','City','Preserved address','Website','Closed','Existing reason',1,1,'migration-test')")
  sqlite.exec("INSERT INTO sales_lead_activities(lead_id,contact_date,mode,discussion,created_by) VALUES(1,'2026-10-21','Call','Existing followup',1)")
  const historyCount=sqlite.prepare('SELECT COUNT(*) AS n FROM sales_lead_history').get().n
  sqlite.exec(readFileSync('migrations/0066_add_lead_hold_and_not_qualified.sql','utf8'))
  const lead=sqlite.prepare('SELECT * FROM sales_leads WHERE id=1').get()
  assert.equal(lead.address,'Preserved address')
  assert.equal(lead.status_reason,'Existing reason')
  assert.equal(sqlite.prepare('SELECT discussion FROM sales_lead_activities WHERE lead_id=1').get().discussion,'Existing followup')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales_lead_history').get().n,historyCount)
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[])
  sqlite.close()
})

test('activity history records actual changed fields and excludes unchanged values and internal bookkeeping', async () => {
  const f=await fixture()
  await f.request('a','',f.create('Detailed history'))
  let lead=f.lead('Detailed history')
  const edit={...f.create('Detailed history'),action:'edit',id:lead.id,version:lead.version,mobile:'1111111111, 2222222222',remarks:'Requested a quote'}
  assert.equal((await f.request('a','',edit)).status,200)
  const readDetails=async()=>JSON.parse((await f.request('a',`?id=${lead.id}`)).history.find(h=>h.event==='Updated').changes_json)
  const details=await readDetails()
  assert.equal(details.action,'edit')
  assert.deepEqual(details.changes.map(c=>c.field).sort(),['mobile','remarks'])
  assert.deepEqual(details.changes.find(c=>c.field==='mobile'),{field:'mobile',previous:'9876543210',current:'1111111111, 2222222222'})
  const before=f.sqlite.prepare('SELECT changes_json FROM sales_lead_history WHERE lead_id=? AND changes_json IS NOT NULL').get(lead.id).changes_json
  assert.equal((await f.request('a','',edit)).status,409)
  assert.equal(f.sqlite.prepare('SELECT changes_json FROM sales_lead_history WHERE lead_id=? AND changes_json IS NOT NULL').get(lead.id).changes_json,before)
  lead=f.lead('Detailed history')
  assert.equal((await f.request('admin','',{action:'reassign',id:lead.id,version:lead.version,coordinator_id:f.ids.b,confirm:true})).status,200)
  const history=await f.request('admin',`?id=${lead.id}`)
  assert.deepEqual(JSON.parse(history.history.find(h=>h.event==='Updated').changes_json).changes,[{field:'coordinator_id',previous:'a',current:'b'}])
})

test('activity history includes follow-up notes and status reason changes', async () => {
  const f=await fixture()
  await f.request('a','',f.create('Notes'))
  let lead=f.lead('Notes')
  assert.equal((await f.request('a','',{action:'followup',id:lead.id,version:lead.version,contact_date:'2026-10-21',mode:'Call',discussion:'Spoke to purchasing',next_follow_up_date:'2026-10-23',next_action:'Send revised quote'})).status,200)
  let details=JSON.parse((await f.request('a',`?id=${lead.id}`)).history.find(h=>h.event==='Updated').changes_json)
  assert.equal(details.action,'followup')
  assert.equal(details.changes.find(c=>c.field==='discussion').current,'Spoke to purchasing')
  assert.equal(details.changes.find(c=>c.field==='contact_date').current,'2026-10-21')
  assert.equal(details.changes.find(c=>c.field==='next_action').current,'Send revised quote')
  lead=f.lead('Notes')
  assert.equal((await f.request('a','',{action:'status',id:lead.id,version:lead.version,status:'On Hold',status_reason:'Awaiting approval'})).status,200)
  details=JSON.parse((await f.request('a',`?id=${lead.id}`)).history.find(h=>h.event==='Updated').changes_json)
  assert.deepEqual(details.changes.find(c=>c.field==='status'),{field:'status',previous:'New',current:'On Hold'})
  assert.equal(details.changes.find(c=>c.field==='status_reason').current,'Awaiting approval')
  const {parseLeadChangeDetails}=await import('../src/features/lead-management/leadHistoryFormatting.ts')
  assert.equal(parseLeadChangeDetails(null),null)
  assert.equal(parseLeadChangeDetails('{bad'),null)
  assert.equal(parseLeadChangeDetails('{"action":"edit","changes":[null]}'),null)
  assert.deepEqual(parseLeadChangeDetails(JSON.stringify(details)),details)
})

test('Onboarded status can be saved, filtered, exported and audited', async () => {
  const f = await fixture()
  await f.request('a', '', f.create('Onboarded company'))
  const lead = f.lead('Onboarded company')
  assert.equal((await f.request('a', '', { action: 'status', id: lead.id, version: lead.version, status: 'Onboarded' })).status, 200)
  assert.equal(f.lead('Onboarded company').status, 'Onboarded')
  assert.equal((await f.request('a', '?status=Onboarded')).total, 1)
  assert.ok((await f.request('a', '?export=excel')).excel.includes('Onboarded'))
  assert.ok((await f.request('a', `?id=${lead.id}`)).history.some(h => h.event === 'Status' && h.new_value === 'Onboarded'))
})


test('Excel export includes lead remarks and follow-up discussion as safe text', async () => {
  const f = await fixture()
  await f.request('a', '', f.create('Export company', f.ids.a, { remarks: 'Initial & <remarks>' }))
  const lead = f.lead('Export company')
  const result = await f.request('a', '', { action: 'followup', id: lead.id, version: lead.version, contact_date: '2026-10-26', mode: 'Call', discussion: '=SUM(1,2) & <discussion>', next_follow_up_date: '2026-10-27', next_action: '' })
  assert.equal(result.status, 200)
  const exported = await f.request('a', '?export=excel')
  assert.equal(exported.status, 200)
  assert.ok(exported.excel.includes('Discussion / Remarks'))
  assert.ok(exported.excel.includes('Initial &amp; &lt;remarks&gt;'))
  assert.ok(exported.excel.includes('=SUM(1,2) &amp; &lt;discussion&gt;'))
  assert.ok(!exported.excel.includes('<f>'))
})
