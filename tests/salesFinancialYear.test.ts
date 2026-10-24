import assert from 'node:assert/strict'
import test from 'node:test'
import { getFinancialYear, getFinancialYearSalesTrend, getFinancialYearSalesToDate } from '../lib/salesFinancialYear.ts'

test('financial year rolls over at midnight on April 1 in India', () => {
  assert.deepEqual(getFinancialYear(new Date('2026-03-31T18:29:59Z')), { startYear: 2025, endYear: 2026 })
  assert.deepEqual(getFinancialYear(new Date('2026-03-31T18:30:00Z')), { startYear: 2026, endYear: 2027 })
  assert.deepEqual(getFinancialYear(new Date('2027-01-10T00:00:00Z')), { startYear: 2026, endYear: 2027 })
})

test('sales totals cover April through March, exclude other years and unposted invoices, and fill empty months', () => {
  const trend = getFinancialYearSalesTrend([
    { date: '2026-03-31', total: 999 },
    { date: '2026-04-01', status: 'paid', total: 100 },
    { date: '2026-04-30', status: 'sent', total: '250' },
    { date: '2026-05-01', status: ' Draft ', total: 999 },
    { date: '2026-06-01', status: 'VOID', total: 999 },
    { date: '2026-10-24', status: 'overdue', total: 500 },
    { date: '2027-03-31', total: 700 },
    { date: '2027-04-01', total: 999 },
    { date: 'invalid', total: 999 },
    { date: '2026-07-01', total: 'invalid' },
  ], new Date('2026-10-24T00:00:00Z'))
  assert.deepEqual(trend.map((point) => point.month), ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'])
  assert.deepEqual(trend.map((point) => point.amount), [350, 0, 0, 0, 0, 0, 500, 0, 0, 0, 0, 700])
})

test('January uses the preceding April and empty financial years still contain twelve months', () => {
  const trend = getFinancialYearSalesTrend([{ date: '2026-04-01', total: 100 }], new Date('2027-01-15T00:00:00Z'))
  assert.equal(trend[0].amount, 100)
  const empty = getFinancialYearSalesTrend([], new Date('2026-10-24T00:00:00Z'))
  assert.equal(empty.length, 12)
  assert.ok(empty.every((point) => point.amount === 0))
})

test('sales to date includes today in India and excludes future dates, prior years, drafts and voids', () => {
  const invoices = [
    { date: '2026-03-31', total: 999 },
    { date: '2026-04-01', total: 100 },
    { date: '2026-10-24', status: 'paid', total: '250' },
    { date: '2026-10-25', total: 999 },
    { date: '2026-10-24', status: 'draft', total: 999 },
    { date: '2026-10-24', status: 'void', total: 999 },
  ]
  assert.equal(getFinancialYearSalesToDate(invoices, new Date('2026-10-23T18:30:00Z')), 350)
  assert.equal(getFinancialYearSalesToDate(invoices, new Date('2026-10-23T18:29:59Z')), 100)
  assert.equal(getFinancialYearSalesToDate([], new Date('2026-10-24T00:00:00Z')), 0)
})
