import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(path, imports) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, Response, Request, URL, console, require: name => { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
function fixture(beforeMigration = () => {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE job_cards(id INTEGER PRIMARY KEY,production_plan_line_id,job_number,status,manufactured_quantity,updated_at,created_at);
    CREATE TABLE production_plan_lines(id INTEGER PRIMARY KEY,production_plan_id,zoho_customer_id,customer_name,zoho_sales_order_id,sales_order_number,zoho_item_id,item_name,item_description,approved_specification_revision_id,uom);
    CREATE TABLE production_plans(id INTEGER PRIMARY KEY,deleted_at,plan_date);
    CREATE TABLE product_specification_records(id,polar_canvas_item_code);
    CREATE TABLE job_card_process_entries(job_card_id,process_status,completed_at);
    CREATE TABLE role_menu_permissions(role_id,menu_key,can_full,can_view,can_create,can_edit);
    INSERT INTO production_plans VALUES(1,NULL,'2026-09-23');
    INSERT INTO production_plan_lines VALUES(1,1,'C1','Customer','SO1','SO-00125','I1','Box','5 Ply Box',1,'Nos');
    INSERT INTO job_cards VALUES(1,1,'JC-000123','COMPLETED',1000,'2026-09-23','2026-09-23');
  `);
  sqlite.exec(readFileSync('migrations/0053_create_finished_goods_dispatches.sql', 'utf8'));
  beforeMigration(sqlite);
  sqlite.exec(readFileSync('migrations/0054_create_finished_goods_adjustments.sql', 'utf8'));
  let beforeWrite = async () => {};
  const db = { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { await beforeWrite(sql); return sqlite.prepare(sql).run(...args); },
    };
  } };
  let user = { id: 1, roleId: 1, roleName: 'SUPERADMIN', fullName: 'Operator' };
  let beforeInvoice = async () => {};
  const invoiceCalls = [];
  const invoices = [
    { invoice_id: '101', invoice_number: 'INV-101', customer_id: 'C1', status: 'sent' },
    { invoice_id: '102', invoice_number: 'INV-102', customer_id: 'C1', status: 'sent', sales_order_numbers: ['SO-00125'] },
    { invoice_id: '103', invoice_number: 'INV-103', customer_id: 'OTHER', status: 'sent' },
    { invoice_id: '104', invoice_number: 'INV-104', customer_id: 'C1', status: 'void' },
  ];
  const imports = {
    '../lib/authenticatedUser': { getAuthenticatedUser: async () => user },
    '../../lib/invoices': {
      getZohoInvoicesByCustomer: async id => { invoiceCalls.push(id); return invoices; },
      getZohoInvoiceById: async id => { await beforeInvoice(); return invoices.find(invoice => invoice.invoice_id === id); },
    },
  };
  imports['../lib/finishedGoodsStock'] = load('functions/lib/finishedGoodsStock.ts', {});
  imports['../../src/features/inventory/fgAdjustmentReasons'] = load('src/features/inventory/fgAdjustmentReasons.ts', {});
  const adjustmentApi = load('functions/api/finished-goods-adjustments.ts', imports);
  const api = load('functions/api/finished-goods-dispatches.ts', imports);
  const reportApi = load('functions/api/finished-goods-stock.ts', imports);
  const context = (url, init) => ({ env: { DB: db }, request: new Request(`https://example.com${url}`, init) });
  let sequence = 0;
  const payload = (values = {}) => ({ request_id: `dispatch-request-${++sequence}`, job_card_id: 1, zoho_invoice_id: '101', dispatch_quantity: 600, previous_dispatched_quantity: 0, dispatch_date: '2026-09-23', previous_closing_stock: 1000 - (values.previous_dispatched_quantity ?? 0), ...values });
  const adjustment = (values = {}) => ({ request_id: `adjustment-request-${++sequence}`, job_card_id: 1, adjustment_type: 'INCREASE', adjustment_quantity: 50, reason: 'Physical Stock Correction', remarks: '', previous_closing_stock: 1000, ...values });
  return { sqlite, invoiceCalls, payload, adjustment,
    setBeforeWrite: fn => { beforeWrite = fn; },
    async adjust(body) { const response = await adjustmentApi.onRequestPost(context('/api/finished-goods-adjustments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; },
    async adjustSnapshot() { const response = await adjustmentApi.onRequestGet(context('/api/finished-goods-adjustments?job_card_id=1')); return { status: response.status, body: await response.json() }; },
    setUser: value => { user = value; }, setBeforeInvoice: fn => { beforeInvoice = fn; },
    async post(body) { const response = await api.onRequestPost(context('/api/finished-goods-dispatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; },
    async get(action = 'history') { const response = await api.onRequestGet(context(`/api/finished-goods-dispatches?job_card_id=1&action=${action}`)); return { status: response.status, body: await response.json() }; },
    async report() { const response = await reportApi.onRequestGet(context('/api/finished-goods-stock')); assert.equal(response.status, 200); return response.json(); },
  };
}
test('completed FG reflects manufacture, multiple invoices, partial dispatch, zero balance and history without changing production', async () => {
  const f = fixture();
  const before = f.sqlite.prepare('SELECT * FROM job_cards').get();
  let row = (await f.report()).rows[0];
  assert.deepEqual([row.manufactured_quantity,row.dispatched_quantity,row.closing_stock], [1000,0,1000]);
  assert.equal((await f.post(f.payload())).status, 200);
  row = (await f.report()).rows[0];
  assert.deepEqual([row.manufactured_quantity,row.dispatched_quantity,row.closing_stock], [1000,600,400]);
  assert.equal((await f.post(f.payload({ zoho_invoice_id: '102', dispatch_quantity: 400, previous_dispatched_quantity: 600 }))).status, 200);
  const report = await f.report();
  assert.equal(report.rows.length, 1);
  assert.deepEqual([report.rows[0].dispatched_quantity,report.rows[0].closing_stock], [1000,0]);
  const history = (await f.get()).body.history;
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(row => row.invoice_number), ['INV-102','INV-101']);
  assert.equal(history[0].created_by_name, 'Operator');
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM job_cards').get(), before);
  assert.equal((await f.post(f.payload({ dispatch_quantity: 1, previous_dispatched_quantity: 1000 }))).status, 409);
});
for (const amount of [0, -1, 1001]) test(`dispatch quantity ${amount} is rejected without history writes`, async () => {
  const f = fixture();
  assert.equal((await f.post(f.payload({ dispatch_quantity: amount }))).status, amount > 1000 ? 409 : 400);
  assert.equal((await f.get()).body.history.length, 0);
});
test('customer invoice isolation, exact SO preference, and backend ownership checks', async () => {
  const f = fixture();
  const result = await f.get('invoices');
  assert.equal(result.status, 200);
  assert.deepEqual(f.invoiceCalls, ['C1']);
  assert.deepEqual(result.body.invoices.map(row => row.invoice_id), ['102','101']);
  for (const id of ['103','104','unknown']) assert.equal((await f.post(f.payload({ zoho_invoice_id: id }))).status, 400);
  assert.equal((await f.get()).body.history.length, 0);
});
test('two in-flight saves using the same stock snapshot cannot over-dispatch', async () => {
  const f = fixture();
  let arrived = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  f.setBeforeInvoice(async () => { if (++arrived === 2) release(); await gate; });
  const results = await Promise.all([f.post(f.payload()), f.post(f.payload({ zoho_invoice_id: '102' }))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200,409]);
  const rejected = results.find(result => result.status === 409);
  assert.equal(rejected.body.closing_stock, 400);
  assert.equal((await f.get()).body.history.length, 1);
  assert.equal((await f.report()).rows[0].closing_stock, 400);
});
test('stale snapshot is rejected even if the requested amount still fits', async () => {
  const f = fixture(); await f.post(f.payload({ dispatch_quantity: 100 }));
  const result = await f.post(f.payload({ dispatch_quantity: 100 }));
  assert.equal(result.status, 409); assert.equal(result.body.closing_stock, 900);
});
test('retry with the same request id does not create duplicate stock movement', async () => {
  const f = fixture(), payload = f.payload();
  assert.equal((await f.post(payload)).status, 200);
  assert.equal((await f.post(payload)).status, 200);
  assert.equal((await f.get()).body.history.length, 1);
  assert.equal((await f.post({ ...payload, dispatch_quantity: 1 })).status, 409);
});
test('permissions protect dispatch while allowing read-only history', async () => {
  const f = fixture();
  f.setUser({ id: 2, roleId: 2, roleName: 'VIEWER', fullName: 'Viewer' });
  f.sqlite.exec("INSERT INTO role_menu_permissions VALUES(2,'finished-goods-stock',0,1,0,0)");
  assert.equal((await f.get()).status, 200);
  assert.equal((await f.report()).canDispatch, false);
  assert.equal((await f.get('invoices')).status, 403);
  assert.equal((await f.post(f.payload())).status, 403);
  f.setUser(null);
  assert.equal((await f.get()).status, 401);
  assert.equal((await f.post(f.payload())).status, 401);
});
test('incomplete production never becomes dispatchable FG and invalid dates are rejected', async () => {
  const f = fixture();
  assert.equal((await f.post(f.payload({ dispatch_date: '2026-02-30' }))).status, 400);
  f.sqlite.exec("UPDATE job_cards SET status='IN_PROGRESS'");
  assert.equal((await f.report()).rows.length, 0);
  assert.equal((await f.post(f.payload())).status, 409);
});


test('increase and decrease retain manufactured/dispatched values and record all movement history', async () => {
  const f = fixture(), productionBefore = f.sqlite.prepare('SELECT * FROM job_cards').get();
  await f.post(f.payload());
  assert.equal((await f.adjust(f.adjustment({ previous_closing_stock: 400 }))).status, 200);
  assert.equal((await f.report()).rows[0].closing_stock, 450);
  assert.equal((await f.adjust(f.adjustment({ adjustment_type: 'DECREASE', adjustment_quantity: 20, reason: 'Damage / Rejection', remarks: 'Damaged during handling', previous_closing_stock: 450 }))).status, 200);
  const row = (await f.report()).rows[0];
  assert.deepEqual([row.manufactured_quantity,row.dispatched_quantity,row.stock_adjustment,row.closing_stock], [1000,600,30,430]);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM job_cards').get(), productionBefore);
  assert.equal(f.sqlite.prepare('SELECT SUM(dispatch_quantity) AS total FROM finished_goods_dispatches').get().total, 600);
  const transaction = f.sqlite.prepare("SELECT * FROM finished_goods_adjustments WHERE adjustment_type='DECREASE'").get();
  assert.equal(transaction.created_by_user_id, 1); assert.equal(transaction.created_by_name, 'Operator');
  assert.ok(transaction.created_at); assert.equal(transaction.customer_id, 'C1'); assert.equal(transaction.job_number, 'JC-000123');
  const history = (await f.get()).body.transactions;
  assert.deepEqual(history.map(value => value.type).sort(), ['ADJUSTMENT_DECREASE','ADJUSTMENT_INCREASE','DISPATCH','PRODUCTION']);
  assert.equal(history.reduce((sum,value) => sum+value.quantity,0),430);
  assert.ok(history.some(value => value.reason==='Damage / Rejection' && value.remarks==='Damaged during handling'));
});
for (const quantity of [0,-1,'',null]) test(`adjustment quantity ${JSON.stringify(quantity)} is rejected`, async () => {
  const f = fixture();
  assert.equal((await f.adjust(f.adjustment({ adjustment_quantity:quantity }))).status,400);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM finished_goods_adjustments').get().count,0);
});
test('decrease cannot exceed current balance or create negative stock', async () => {
  const f = fixture(); await f.post(f.payload());
  const result = await f.adjust(f.adjustment({ adjustment_type:'DECREASE',adjustment_quantity:401,previous_closing_stock:400 }));
  assert.equal(result.status,409); assert.match(result.body.error,/cannot exceed available FG stock of 400 Nos/);
  assert.equal((await f.report()).rows[0].closing_stock,400);
});
test('Reason is required and Other requires Remarks', async () => {
  const f = fixture();
  for (const reason of ['', 'Unapproved reason', 'Other']) assert.equal((await f.adjust(f.adjustment({ reason }))).status,400);
  assert.equal((await f.adjust(f.adjustment({ reason:'Other',remarks:'Count correction after physical verification' }))).status,200);
});
test('dispatch can use increased stock beyond original manufactured balance', async () => {
  const f = fixture(); await f.post(f.payload());
  await f.adjust(f.adjustment({previous_closing_stock:400}));
  const result = await f.post(f.payload({dispatch_quantity:450,previous_dispatched_quantity:600,previous_closing_stock:450}));
  assert.equal(result.status,200);
  const row = (await f.report()).rows[0];
  assert.deepEqual([row.manufactured_quantity,row.dispatched_quantity,row.stock_adjustment,row.closing_stock],[1000,1050,50,0]);
});
test('dispatch is limited by decrease adjustments', async () => {
  const f = fixture(); await f.post(f.payload());
  await f.adjust(f.adjustment({adjustment_type:'DECREASE',previous_closing_stock:400}));
  assert.equal((await f.post(f.payload({dispatch_quantity:400,previous_dispatched_quantity:600,previous_closing_stock:350}))).status,409);
  assert.equal((await f.post(f.payload({dispatch_quantity:350,previous_dispatched_quantity:600,previous_closing_stock:350}))).status,200);
  assert.equal((await f.report()).rows[0].closing_stock,0);
});
test('adjustment requires edit/full permission, never implicitly granted to dispatch roles', async () => {
  const f = fixture();
  f.setUser({id:2,roleId:2,roleName:'DISPATCH',fullName:'Dispatch operator'});
  f.sqlite.exec("INSERT INTO role_menu_permissions VALUES(2,'finished-goods-stock',0,1,1,0)");
  assert.equal((await f.report()).canAdjust,false);
  assert.equal((await f.adjustSnapshot()).status,403);
  assert.equal((await f.adjust(f.adjustment())).status,403);
  f.sqlite.exec('UPDATE role_menu_permissions SET can_edit=1');
  assert.equal((await f.report()).canAdjust,true);
  assert.equal((await f.adjust(f.adjustment())).status,200);
  f.setUser(null); assert.equal((await f.adjust(f.adjustment())).status,401);
});
test('adjustment retry creates exactly one immutable transaction', async () => {
  const f = fixture(), request=f.adjustment();
  assert.equal((await f.adjust(request)).status,200); assert.equal((await f.adjust(request)).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM finished_goods_adjustments').get().count,1);
  assert.equal((await f.adjust({...request,adjustment_quantity:80})).status,409);
});
test('competing dispatch and decrease are guarded atomically against the same stock snapshot', async () => {
  const f = fixture(); let arrived=0,release;
  const gate=new Promise(resolve=>{release=resolve});
  f.setBeforeWrite(async sql=>{if(sql.includes('INSERT INTO finished_goods_')){if(++arrived===2)release();await gate;}});
  const results=await Promise.all([f.post(f.payload({dispatch_quantity:800})),f.adjust(f.adjustment({adjustment_type:'DECREASE',adjustment_quantity:500}))]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  const row=(await f.report()).rows[0];
  assert.ok(row.closing_stock===200||row.closing_stock===500);
  assert.equal(f.sqlite.prepare('SELECT (SELECT COUNT(*) FROM finished_goods_dispatches)+(SELECT COUNT(*) FROM finished_goods_adjustments) AS count').get().count,1);
});
test('two simultaneous decreases cannot over-issue and a stale increase is also rejected', async () => {
  const f=fixture();let arrived=0,release;const gate=new Promise(resolve=>{release=resolve});
  f.setBeforeWrite(async()=>{if(++arrived===2)release();await gate;});
  const results=await Promise.all([f.adjust(f.adjustment({adjustment_type:'DECREASE',adjustment_quantity:600})),f.adjust(f.adjustment({adjustment_type:'DECREASE',adjustment_quantity:600}))]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal((await f.adjust(f.adjustment())).status,409);
  assert.equal((await f.report()).rows[0].closing_stock,400);
});
test('an increase can restore zero stock and retains all previous audit records', async()=>{
  const f=fixture();await f.post(f.payload({dispatch_quantity:1000}));
  assert.equal((await f.adjust(f.adjustment({previous_closing_stock:0}))).status,200);
  const row=(await f.report()).rows[0];assert.equal(row.closing_stock,50);assert.equal(row.dispatched_quantity,1000);
  assert.equal((await f.get()).body.transactions.length,3);
});

test('adjustment migration preserves historical dispatches without rewriting their quantities', async () => {
  const f=fixture(sqlite=>sqlite.exec(`INSERT INTO finished_goods_dispatches
    (request_id,job_card_id,production_plan_line_id,customer_id,customer_name,sales_order_id,sales_order_number,item_id,job_number,zoho_invoice_id,invoice_number,dispatch_quantity,previous_dispatched_quantity,uom,dispatch_date,created_by_user_id,created_by_name)
    VALUES('legacy-request-0001',1,1,'C1','Customer','SO1','SO-00125','I1','JC-000123','101','INV-101',200,0,'Nos','2026-09-23',1,'Operator')`));
  const legacy=f.sqlite.prepare('SELECT * FROM finished_goods_dispatches').get();
  assert.equal(legacy.dispatch_quantity,200);assert.equal(legacy.previous_closing_stock,null);
  const row=(await f.report()).rows[0];assert.equal(row.dispatched_quantity,200);assert.equal(row.closing_stock,800);
  assert.equal((await f.adjust(f.adjustment({previous_closing_stock:800}))).status,200);
  assert.equal((await f.report()).rows[0].closing_stock,850);
});
