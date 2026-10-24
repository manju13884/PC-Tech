import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { productionSummaryDate, productionSummarySql } from '../lib/dashboardProduction.ts'

test('production summary counts unfinished items and delivery deadlines, excluding inactive work', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE production_plans (id INTEGER PRIMARY KEY, status TEXT, closure_status TEXT, deleted_at TEXT);
      CREATE TABLE production_plan_lines (id INTEGER PRIMARY KEY, production_plan_id INTEGER, delivery_date TEXT);
      CREATE TABLE job_cards (id INTEGER PRIMARY KEY, production_plan_line_id INTEGER, status TEXT);
      INSERT INTO production_plans VALUES
        (1, 'PLANNED', 'OPEN', NULL), (2, 'PARTIALLY_COMPLETED', 'OPEN', NULL),
        (3, 'DRAFT', 'OPEN', NULL), (4, 'CANCELLED', 'OPEN', NULL),
        (5, 'COMPLETED', 'OPEN', NULL), (6, 'PLANNED', 'CLOSED', NULL),
        (7, 'PLANNED', 'OPEN', '2026-10-20'), (8, 'ON_HOLD', 'OPEN', NULL);
      INSERT INTO production_plan_lines VALUES
        (1, 1, '2026-10-24'), (2, 1, '2026-10-23'), (3, 1, '2026-10-25'),
        (4, 2, '2026-10-23'), (5, 2, '2026-10-24'), (6, 2, '2026-10-23'),
        (7, 3, '2026-10-23'), (8, 4, '2026-10-23'), (9, 5, '2026-10-23'),
        (10, 6, '2026-10-23'), (11, 7, '2026-10-23'), (12, 8, NULL),
        (13, 8, ''), (14, 8, 'invalid');
      INSERT INTO job_cards VALUES (1, 2, 'CREATED'), (2, 4, 'IN_PROGRESS'),
        (3, 5, 'COMPLETED'), (4, 6, 'CANCELLED');
    `)
    const result = db.prepare(productionSummarySql).get('2026-10-24', '2026-10-24')
    assert.deepEqual({ ...result }, { pendingProduction: 7, dueToday: 1, overdue: 2 })
    db.exec('DELETE FROM production_plan_lines')
    assert.deepEqual({ ...db.prepare(productionSummarySql).get('2026-10-24', '2026-10-24') }, {
      pendingProduction: 0, dueToday: 0, overdue: 0,
    })
  } finally { db.close() }
})

test('production deadlines use the IST date at midnight boundaries', () => {
  assert.equal(productionSummaryDate(new Date('2026-10-23T18:29:59Z')), '2026-10-23')
  assert.equal(productionSummaryDate(new Date('2026-10-23T18:30:00Z')), '2026-10-24')
})
