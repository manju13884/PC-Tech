import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { deriveOverallProductionStatus, type ProductionActivityStatus } from '../src/features/so-production-status/soProductionStatusService.ts'

const activity = (jobStatus?: string, statuses: Array<'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'> = []): ProductionActivityStatus => ({
  id: 1,
  soLineItemId: 'line-1',
  quantity: 500,
  jobs: jobStatus ? [{ id: 1, jobNumber: 'JC-000001', status: jobStatus, processes: statuses.map((status, index) => ({ name: `Stage ${index + 1}`, status })) }] : [],
})

test('derives each production workflow state without storing a duplicate status', () => {
  assert.equal(deriveOverallProductionStatus([]), 'Not Planned')
  assert.equal(deriveOverallProductionStatus([activity()]), 'Planned')
  assert.equal(deriveOverallProductionStatus([activity('CREATED', ['NOT_STARTED', 'NOT_STARTED'])]), 'Not Started')
  assert.equal(deriveOverallProductionStatus([activity('IN_PROGRESS', ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED'])]), 'In Progress')
  assert.equal(deriveOverallProductionStatus([activity('COMPLETED', ['COMPLETED', 'COMPLETED'])]), 'Completed')
})

test('split SO-line activities are not complete while any planned activity lacks a Job Card', () => {
  assert.equal(deriveOverallProductionStatus([activity('COMPLETED', ['COMPLETED']), { ...activity(), id: 2 }]), 'In Progress')
})

test('SO Production Status is read-only, permission controlled and preserves configured process order', async () => {
  const [api, page, migration] = await Promise.all([
    readFile('functions/api/so-production-status.ts', 'utf8'),
    readFile('src/features/so-production-status/SoProductionStatus.tsx', 'utf8'),
    readFile('migrations/0051_add_so_production_status_permission.sql', 'utf8'),
  ])
  assert.match(api, /onRequestGet/)
  assert.doesNotMatch(api, /onRequest(?:Post|Put|Patch|Delete)/)
  assert.match(api, /getMenuPermission\(db, user\.roleId, 'so-production-status'\)/)
  assert.match(api, /orderedNames = \[\.\.\.configured,/)
  assert.match(page, /Production not yet planned\./)
  assert.match(page, /Job Card not yet created\./)
  assert.match(page, /No production process information available\./)
  assert.doesNotMatch(page, /<input|<textarea/)
  assert.match(migration, /CASE WHEN name = 'SUPERADMIN' THEN 1 ELSE 0 END/)
  assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
})
