import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getLatestCustomerRefreshBoundary,
  isCurrentDailyCustomerCache,
} from '../lib/customerCacheSchedule.ts'

test('customer cache rolls over at exactly 7:00 AM IST', () => {
  const beforeBoundary = new Date('2026-08-31T01:29:59.000Z')
  const atBoundary = new Date('2026-08-31T01:30:00.000Z')

  assert.equal(
    new Date(getLatestCustomerRefreshBoundary(beforeBoundary)).toISOString(),
    '2026-08-30T01:30:00.000Z',
  )
  assert.equal(
    new Date(getLatestCustomerRefreshBoundary(atBoundary)).toISOString(),
    '2026-08-31T01:30:00.000Z',
  )
})

test('customer cache is reused only within the current daily window', () => {
  const now = new Date('2026-08-31T03:00:00.000Z')

  assert.equal(isCurrentDailyCustomerCache('2026-08-31T01:30:00.000Z', now), true)
  assert.equal(isCurrentDailyCustomerCache('2026-08-31T01:29:59.999Z', now), false)
  assert.equal(isCurrentDailyCustomerCache('invalid', now), false)
})
