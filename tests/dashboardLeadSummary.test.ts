import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDashboardLeads } from '../src/dashboard/utils/leadSummary.ts'

test('lead summary totals all leads and only counts actionable follow-ups for active leads', () => {
  assert.deepEqual(summarizeDashboardLeads([
    { status: 'New', count: 10, due: 2, overdue: 3 },
    { status: 'Quotation', count: 5, due: 1, overdue: 2 },
    { status: 'Converted', count: 4, due: 2, overdue: 4 },
    { status: 'Closed', count: 3, due: 1, overdue: 2 },
    { status: 'Not Qualified', count: 2, due: 0, overdue: 1 },
  ]), { total: 24, active: 15, dueToday: 3, overdue: 5 })
})

test('empty lead summaries show zero counts', () => {
  assert.deepEqual(summarizeDashboardLeads([]), { total: 0, active: 0, dueToday: 0, overdue: 0 })
})
