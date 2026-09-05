import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboard = readFileSync('src/dashboard/DashboardPage.tsx', 'utf8')

test('dashboard As of label uses the cached refresh date and time', () => {
  assert.match(dashboard, /formatIstDateTime\(refreshedAt\)/)
  assert.doesNotMatch(dashboard, /format\(new Date\(\)\)/)
})
