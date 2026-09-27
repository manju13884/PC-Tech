import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['functions/api/master-data.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

const calculatorBundle = await build({ entryPoints: ['functions/api/calculator-defaults.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const calculatorApi = await import(`data:text/javascript;base64,${Buffer.from(calculatorBundle.outputFiles[0].text).toString('base64')}`)

function fixture() {
  const stored = new Map()
  let role = 'SUPERADMIN'
  let calculatorAccess = false
  const DB = { async batch(statements) { return Promise.all(statements.map(statement => statement.run())) }, prepare(sql) {
    let values
    return {
      bind(...args) { values = args; return this },
      async first() {
        if (sql.includes('FROM sessions')) return {
          user_id: 1, role_id: 1, role_name: role, user_status: 'ACTIVE', role_is_active: 1,
          session_revoked_at: null, session_version: 1, user_session_version: 1,
          session_expires_at: new Date(Date.now() + 60000).toISOString(),
        }
        if (sql.includes('SELECT 1 AS allowed')) return calculatorAccess ? {allowed:1} : null
        if (sql.includes('role_menu_permissions')) return { can_full: 0, can_view: 1, can_edit: 0 }
        return stored.has(values[0]) ? { value: stored.get(values[0]) } : null
      },
      async run() { stored.set(values[0], values[1]); return { success: true } },
    }
  } }
  return {
    setRole(value) { role = value },
    setCalculatorAccess(value) { calculatorAccess = value },
    calculatorCall(authenticated = true) {
      return calculatorApi.onRequestGet({env:{DB},request:new Request('http://localhost/api/calculator-defaults', {headers:authenticated ? {Cookie:'pc_tech_session=test'} : {}})})
    },
    call(method = 'GET', paperPrice, authenticated = true) {
      return api[method === 'GET' ? 'onRequestGet' : 'onRequestPut']({
        env: { DB },
        request: new Request('http://localhost/api/master-data', {
          method, headers: authenticated ? { Cookie: 'pc_tech_session=test' } : {},
          ...(method === 'PUT' ? { body: JSON.stringify(paperPrice && typeof paperPrice === 'object' ? paperPrice : { paperPrice }) } : {}),
        }),
      })
    },
  }
}

test('Paper Price defaults to 37, persists saved values, and resets blank values', async () => {
  const f = fixture()
  assert.equal((await (await f.call()).json()).paperPrice, '37')
  assert.equal((await f.call('PUT', '42.50')).status, 200)
  assert.equal((await (await f.call()).json()).paperPrice, '42.50')
  await f.call('PUT', '0')
  assert.equal((await (await f.call()).json()).paperPrice, '0')
  await f.call('PUT', ' ')
  assert.equal((await (await f.call()).json()).paperPrice, '37')
})

test('invalid prices cannot overwrite the saved value', async () => {
  const f = fixture()
  await f.call('PUT', '40')
  for (const value of ['-1', 'abc', 'Infinity', '1e999', null]) {
    assert.equal((await f.call('PUT', value)).status, 400)
  }
  assert.equal((await (await f.call()).json()).paperPrice, '40')
})

test('Master Data requires authentication and edit permission to save', async () => {
  const f = fixture()
  assert.equal((await f.call('GET', undefined, false)).status, 401)
  f.setRole('ACCOUNTS')
  assert.equal((await (await f.call()).json()).canEdit, false)
  assert.equal((await f.call('PUT', '44')).status, 403)
  assert.equal((await (await f.call()).json()).paperPrice, '37')
})


test('Wastage, Margin, Markup and Transport use defaults, persist, and validate before saving', async () => {
  const f = fixture()
  assert.deepEqual(await (await f.call()).json(), {paperPrice:'37', wastage:'6', margin:'12', markup:'12', transport:'1', ratePerKg:'12', printing:'2', canEdit:true})
  const values = {paperPrice:'40', wastage:'7.5', margin:'15', markup:'20', transport:'2.5', ratePerKg:'18', printing:'4'}
  assert.equal((await f.call('PUT', values)).status, 200)
  assert.deepEqual(await (await f.call()).json(), {...values, canEdit:true})
  assert.equal((await f.call('PUT', {...values, paperPrice:'99', markup:'bad'})).status, 400)
  assert.deepEqual(await (await f.call()).json(), {...values, canEdit:true})
  await f.call('PUT', {paperPrice:'40', wastage:'', margin:' ', markup:'', transport:'', ratePerKg:'', printing:''})
  assert.deepEqual(await (await f.call()).json(), {paperPrice:'40', wastage:'6', margin:'12', markup:'12', transport:'1', ratePerKg:'12', printing:'2', canEdit:true})
  assert.equal((await f.call('PUT', {...values, transport:'-1'})).status, 400)
  await f.call('PUT', '45')
  assert.equal((await (await f.call()).json()).transport, '1')
  assert.equal((await (await f.call()).json()).wastage, '6')
})


test('calculator users can read shared defaults without permission to edit Master Data', async () => {
  const f = fixture()
  await f.call('PUT', {paperPrice:'49', wastage:'8', margin:'14', markup:'16', transport:'3', ratePerKg:'18', printing:'4'})
  f.setRole('SALES')
  assert.equal((await f.calculatorCall()).status, 403)
  f.setCalculatorAccess(true)
  assert.deepEqual(await (await f.calculatorCall()).json(), {paperPrice:'49', wastage:'8', margin:'14', markup:'16', transport:'3', ratePerKg:'18', printing:'4'})
  assert.equal((await f.call('PUT', '99')).status, 403)
  assert.equal((await f.calculatorCall(false)).status, 401)
})
