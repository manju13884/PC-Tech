import assert from 'node:assert/strict'
import test from 'node:test'
import { formatIstDate, formatIstDateTime, formatIstTime, IST_TIME_ZONE } from '../src/utils/dateTimeFormatting.ts'

test('formats all timestamps explicitly in IST', () => {
  assert.equal(IST_TIME_ZONE, 'Asia/Kolkata')
  assert.equal(formatIstDateTime('2026-09-05T00:30:00Z'), '05-Sep-2026, 06:00 am')
  assert.equal(formatIstDate('2026-09-04T20:00:00Z'), '05-Sep-2026')
  assert.equal(formatIstTime('2026-09-05T12:30:00Z'), '06:00 pm')
})

test('treats timezone-less D1 timestamps as UTC before converting to IST', () => {
  assert.equal(formatIstDateTime('2026-09-05 01:21:00'), '05-Sep-2026, 06:51 am')
  assert.equal(formatIstDateTime(null), '—')
  assert.equal(formatIstDateTime('invalid'), '—')
})
