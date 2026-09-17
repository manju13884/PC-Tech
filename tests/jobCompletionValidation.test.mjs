import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadModule(path, imports = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Response, console, require(name) {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return exports;
}
const validation = loadModule('src/utils/jobCompletionValidation.ts');
const { onRequestPatch } = loadModule('functions/api/job-tracking.ts', {
  '../../src/utils/jobCompletionValidation': validation,
  '../lib/authenticatedUser': { getAuthenticatedUser: async () => ({ id: 1, roleName: 'SUPERADMIN', fullName: 'Tester', email: 'test@example.com' }) },
});
const stages = ['Paper Cutting', 'Corrugation', 'Pasting', 'Creasing', 'Slotting', 'RS4'];
function job(assigned, statuses) {
  return {
    job_number: 'JC-000010',
    attributes_json: JSON.stringify({ production_stages: assigned }),
    process_entries_json: JSON.stringify(statuses.map((status, index) => ({ process_entry_id: index + 1, process_name: assigned[index], process_status: status }))),
  };
}
async function complete(record) {
  const batches = [];
  const reads = [];
  const db = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          reads.push(statement);
          if (sql === 'SELECT status FROM job_cards WHERE id = ?') return { status: 'IN_PROGRESS' };
          if (sql.includes('SELECT card.job_number, spec.attributes_json')) return record;
          if (sql.includes('inventory_reel_reservations') || sql.includes('inventory_stock_id IS NOT NULL')) return null;
          assert.fail(`Unexpected read: ${sql}`);
        },
        async all() { return { results: [] }; },
      };
      return statement;
    },
    async batch(statements) { batches.push(statements); return statements.map(() => ({ meta: { changes: 1 } })); },
  };
  const response = await onRequestPatch({ env: { DB: db }, request: new Request('https://example.com/api/job-tracking', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobCardId: 10, status: 'COMPLETED' }),
  }) });
  return { response, body: await response.json(), batches, reads };
}

for (const incomplete of ['IN_PROGRESS', 'NOT_STARTED', 'CANCELLED', null, 'SKIPPED']) {
  test(`UI validation and direct API completion reject ${incomplete} without writes`, async () => {
    const record = job(stages, [...Array(5).fill('COMPLETED'), incomplete]);
    assert.match(validation.jobCompletionError(record), /JC-000010 cannot be completed.*RS4/);
    const { response, body, batches, reads } = await complete(record);
    assert.equal(response.status, 409);
    assert.match(body.error, /Complete all Job Process Steps/);
    assert.equal(batches.length, 0);
    const query = reads.find(({ sql }) => sql.includes('SELECT card.job_number'));
    assert.deepEqual(query.values, [10]);
    assert.match(query.sql, /entry.job_card_id=card.id/);
    assert.match(query.sql, /spec.id=line.approved_specification_revision_id/);
  });
}
for (const count of [3, 6]) {
  test(`${count} assigned and completed steps permit the existing completion and plan closure batch`, async () => {
    const record = job(stages.slice(0, count), Array(count).fill('COMPLETED'));
    assert.equal(validation.jobCompletionError(record), null);
    const { response, batches } = await complete(record);
    assert.equal(response.status, 200);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 3);
    assert.match(batches[0][0].sql, /UPDATE job_cards SET status='COMPLETED'/);
    assert.match(batches[0][1].sql, /INSERT INTO production_plan_status_history/);
    assert.match(batches[0][2].sql, /closure_status = 'CLOSED'/);
  });
}
test('no configured processes blocks completion even when orphan entries are completed', async () => {
  const record = job([], []);
  record.process_entries_json = job(stages, Array(6).fill('COMPLETED')).process_entries_json;
  const { response, body, batches } = await complete(record);
  assert.equal(response.status, 409);
  assert.match(body.error, /no Job Process Steps are configured/);
  assert.equal(batches.length, 0);
});
test('assigned step with no persisted entry is Not Started; unassigned steps do not block', async () => {
  const record = job(stages, Array(5).fill('COMPLETED'));
  assert.match(validation.jobCompletionError(record), /RS4 – Not Started/);
  assert.equal((await complete(record)).response.status, 409);
  const configured = job(stages.slice(0, 3), Array(3).fill('COMPLETED'));
  configured.process_entries_json = JSON.stringify([...JSON.parse(configured.process_entries_json), { process_name: 'RS4', process_status: 'NOT_STARTED' }]);
  assert.equal((await complete(configured)).response.status, 200);
});
test('fresh backend statuses reject completion despite a previously eligible UI snapshot', async () => {
  assert.equal(validation.jobCompletionError(job(stages, Array(6).fill('COMPLETED'))), null);
  const result = await complete(job(stages, [...Array(5).fill('COMPLETED'), 'IN_PROGRESS']));
  assert.equal(result.response.status, 409);
  assert.equal(result.batches.length, 0);
});
test('missing or malformed configuration and statuses fail closed', () => {
  for (const attributes_json of [null, '{}', 'null', '{broken']) {
    assert.match(validation.jobCompletionError({ job_number: 'JC-000010', attributes_json }), /no Job Process Steps/);
  }
  const record = job(stages, []);
  record.process_entries_json = '{broken';
  assert.match(validation.jobCompletionError(record), /RS4 – Not Started/);
});
