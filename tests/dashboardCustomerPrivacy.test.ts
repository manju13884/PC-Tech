import assert from 'node:assert/strict'
import test from 'node:test'
import { maskDashboardCustomerName } from '../lib/dashboardCustomerPrivacy.ts'

test('dashboard masks the first two words, or first two letters of a single word', () => {
  assert.equal(maskDashboardCustomerName('Acme Packaging Limited'), 'AP.....')
  assert.equal(maskDashboardCustomerName('Acme'), 'Ac.....')
  assert.equal(maskDashboardCustomerName('  Acme   Packaging  '), 'AP.....')
  assert.equal(maskDashboardCustomerName('A'), 'A.....')
  assert.equal(maskDashboardCustomerName(''), '.....')
})
