import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { mapCoaRecord, parseCoaPayload } from '../functions/lib/coaRecords.ts'

const payload = {
  invoiceDate: '2026-08-11',
  customer: 'Customer A',
  poNumber: 'PO-1',
  invoiceNumber: 'INV-001',
  refNumber: 'SO-1',
  items: [{
    name: 'Box',
    description: 'Product',
    boardGsm: '1120',
    gsm: '200/24',
    burstingStrength: '17.4',
    moisture: '8.3',
    ply: '5',
  }],
}

test('accepts and preserves the complete existing COA generator payload', () => {
  assert.deepEqual(parseCoaPayload(payload), payload)
  assert.equal(parseCoaPayload({ ...payload, items: [] }), null)
  assert.equal(parseCoaPayload({ ...payload, items: [{ name: 'incomplete' }] }), null)
})

test('maps original and regeneration audit fields independently', () => {
  const record = mapCoaRecord({
    id: 7,
    customer_id: 'customer-1',
    customer_name: 'Customer A',
    invoice_id: 'invoice-1',
    invoice_number: 'INV-001',
    coa_data_json: JSON.stringify(payload),
    generated_by_user_id: 2,
    generated_by_user_name: 'Original User',
    generated_by_user_email: 'original@example.com',
    generated_at: '2026-08-10 10:30:00',
    updated_by_user_id: 1,
    updated_by_user_name: 'Super Admin',
    updated_by_user_email: 'superadmin@example.com',
    updated_at: '2026-08-11 12:30:00',
  })

  assert.equal(record.generatedBy.name, 'Original User')
  assert.equal(record.generatedBy.email, 'original@example.com')
  assert.equal(record.updatedBy?.name, 'Super Admin')
  assert.equal(record.updatedBy?.email, 'superadmin@example.com')
  assert.deepEqual(record.data, payload)
})

test('migration is additive and enforces one COA per customer and invoice', () => {
  const migration = readFileSync('migrations/0011_create_coa_records.sql', 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS coa_records/i)
  assert.match(migration, /UNIQUE\s*\(customer_id,\s*invoice_id\)/i)
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i)
})

test('regeneration route authorizes SUPERADMIN and updates without delete-insert', () => {
  const route = readFileSync('functions/api/coa/[id].ts', 'utf8')
  assert.match(route, /user\.roleName !== 'SUPERADMIN'/)
  assert.match(route, /UPDATE coa_records SET/)
  assert.doesNotMatch(route, /DELETE\s+FROM\s+coa_records/i)
  assert.doesNotMatch(route, /INSERT\s+INTO\s+coa_records/i)
  assert.doesNotMatch(route, /generated_by_user_id\s*=/i)
})
