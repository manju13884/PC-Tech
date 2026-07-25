import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  PAPER_COST_ELIGIBLE_ITEMS,
  PAPER_COST_EXCLUDED_ITEM_IDS,
  getPaperItemEligibility,
} from '../src/features/paper-purchase-request/config/eligiblePaperItems.ts'
import {
  calculatePaperCost,
  createInitialPaperCostInputs,
  createPaperLayers,
} from '../src/features/paper-purchase-request/utils/paperCostCalculations.ts'
import {
  consolidateApprovedPaperRows,
  type PaperPoSourceRow,
} from '../functions/lib/paperPoConsolidation.ts'

test('configures all approved item IDs and omits explicit exclusions', () => {
  assert.equal(Object.keys(PAPER_COST_ELIGIBLE_ITEMS).length, 13)
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS['898884000000029106'].productType, 'BOX')
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS['898884000000030043'].defaultPly, 5)
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS['898884000003946017'].productType, 'SHEET')
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS['898884000004987235'].defaultPly, 2)
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS['898884000005603280'].defaultPly, 9)
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS[PAPER_COST_EXCLUDED_ITEM_IDS.TEN_PLY_BOX], undefined)
  assert.equal(PAPER_COST_ELIGIBLE_ITEMS[PAPER_COST_EXCLUDED_ITEM_IDS.TWO_PLY_ROLL], undefined)
})

test('eligibility uses exact Item ID and never qualifies an unknown name', () => {
  assert.equal(getPaperItemEligibility('898884000000029106').eligible, true)
  assert.equal(getPaperItemEligibility('unknown', '3 ply Carton Box').eligible, false)
  assert.equal(getPaperItemEligibility('unknown', 'Corrugated Board').eligible, false)
})

test('returns specific exclusions for configured 10-ply and roll Item IDs', () => {
  assert.equal(getPaperItemEligibility(PAPER_COST_EXCLUDED_ITEM_IDS.TEN_PLY_BOX).reason, 'ten-ply')
  assert.equal(getPaperItemEligibility(PAPER_COST_EXCLUDED_ITEM_IDS.TWO_PLY_ROLL).reason, 'roll')
  assert.equal(getPaperItemEligibility('unknown').reason, 'not-approved')
})

test('creates the correct number of layers for every approved ply', () => {
  for (const ply of [2, 3, 5, 7, 9]) {
    assert.equal(createPaperLayers(ply).length, ply)
  }
  assert.deepEqual(
    createPaperLayers(5).map((layer) => layer.label),
    ['Top Liner', 'Flute', 'Inner Liner', 'Flute 1', 'Liner 1'],
  )
})

test('calculates Box paper requirement using developed-sheet geometry', () => {
  const inputs = createInitialPaperCostInputs(3, 100)
  inputs.lengthMm = '400'
  inputs.breadthMm = '300'
  inputs.heightMm = '250'
  const result = calculatePaperCost('BOX', inputs)
  assert.ok(result)
  assert.equal(result.sizeCm, 145)
  assert.equal(result.deckleCm, 57)
  assert.equal(result.layers.length, 3)
  assert.equal(result.productType, 'BOX')
  assert.equal(result.lengthMm, 400)
  assert.equal(result.breadthMm, 300)
  assert.equal(result.heightMm, 250)
  assert.equal(result.boxPly, 3)
  assert.equal(result.layers[0].paperType, 'Natural')
  assert.equal(result.layers[0].bf, 16)
  assert.equal(result.layers[0].drawRatio, 1)
  assert.ok(result.totalPaperRequirementKg > result.totalBaseWeightKg)
  assert.equal(result.paperCostPerUnit, result.totalPaperCost / 100)
})

test('calculates Board/Sheet from flat area without Box height or development', () => {
  const inputs = createInitialPaperCostInputs(5, 10)
  inputs.lengthMm = '1000'
  inputs.breadthMm = '500'
  const result = calculatePaperCost('BOARD', inputs)
  assert.ok(result)
  assert.equal(result.areaSqM, 0.5)
  assert.equal(result.sizeCm, undefined)
  assert.equal(result.deckleCm, undefined)
})

test('invalid inputs suppress calculated results', () => {
  const inputs = createInitialPaperCostInputs(3, 10)
  assert.equal(calculatePaperCost('BOX', inputs), null)
  inputs.lengthMm = '400'
  inputs.breadthMm = '300'
  assert.equal(calculatePaperCost('BOX', inputs), null)
})

test('renders calculators inline without an Eligibility column', () => {
  const source = readFileSync(
    resolve('src/features/paper-purchase-request/PaperPurchaseRequest.tsx'),
    'utf8',
  )
  assert.doesNotMatch(source, /<th[^>]*>Eligibility<\/th>/)
  assert.match(source, /className="paper-calculator-row"/)
  assert.match(source, /<td colSpan=\{7\}>/)
  assert.match(source, /expandedLineItems\[item\.line_item_id\]/)
  assert.match(source, /Paper Requirement Calculator/)
  assert.match(source, /isExpanded \? 'Hide' : 'Show'/)
})

test('eligibility implementation contains no Item Name matching', () => {
  const source = readFileSync(
    resolve('src/features/paper-purchase-request/config/eligiblePaperItems.ts'),
    'utf8',
  )
  assert.doesNotMatch(source, /itemName|includes\(|RegExp|\.test\(/)
})

test('paper request migration is additive and enforces Sales Order uniqueness', () => {
  const migration = readFileSync(resolve('migrations/0007_create_paper_purchase_requests.sql'), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paper_purchase_requests/)
  assert.match(migration, /sales_order_id TEXT NOT NULL UNIQUE/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paper_purchase_request_items/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paper_purchase_request_layers/)
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE|ALTER)\b/i)
})

test('submission API authenticates, validates, batches, and handles duplicates', () => {
  const source = readFileSync(resolve('functions/api/paper-purchase-requests.ts'), 'utf8')
  assert.match(source, /getAuthenticatedUser/)
  assert.match(source, /calculatePaperCost/)
  assert.match(source, /db\.batch\(statements\)/)
  assert.match(source, /status: 409/)
  assert.match(source, /PENDING_APPROVAL/)
})

test('approval workflow migration is additive and preserves existing records', () => {
  const migration = readFileSync(resolve('migrations/0008_add_paper_request_approval_workflow.sql'), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS paper_purchase_request_history/)
  assert.match(migration, /ALTER TABLE paper_purchase_requests ADD COLUMN rejected_by_user_id/)
  assert.match(migration, /paper-purchase-request-approvals/)
  assert.match(migration, /WHERE NOT EXISTS/)
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i)
  assert.doesNotMatch(migration, /ALTER\s+TABLE[\s\S]*DROP\s+COLUMN/i)
})

test('approval APIs enforce permission and conditional status transitions', () => {
  const approve = readFileSync(
    resolve('functions/api/paper-purchase-requests/[requestId]/approve.ts'),
    'utf8',
  )
  const reject = readFileSync(
    resolve('functions/api/paper-purchase-requests/[requestId]/reject.ts'),
    'utf8',
  )
  const resubmit = readFileSync(
    resolve('functions/api/paper-purchase-requests/[requestId]/resubmit.ts'),
    'utf8',
  )
  for (const source of [approve, reject]) {
    assert.match(source, /PAPER_REQUEST_APPROVALS_MENU_KEY/)
    assert.match(source, /request_status = 'PENDING_APPROVAL'/)
    assert.match(source, /409/)
    assert.match(source, /paper_purchase_request_history/)
  }
  assert.match(resubmit, /request_status = 'REJECTED'/)
  assert.match(resubmit, /resubmission_count = resubmission_count \+ 1/)
  assert.match(resubmit, /'RESUBMITTED'/)
  assert.doesNotMatch(resubmit, /\bDELETE\b/i)
})

test('Approvals is a permission-controlled Purchases submenu', () => {
  const dashboard = readFileSync(resolve('src/Dashboard.tsx'), 'utf8')
  const login = readFileSync(resolve('functions/api/auth/login.ts'), 'utf8')
  const currentUser = readFileSync(resolve('functions/api/auth/me.ts'), 'utf8')
  assert.match(dashboard, /key: 'paper-purchase-request-approvals'/)
  assert.match(dashboard, /menuTitle: 'Approvals'/)
  assert.match(login, /'paper-purchase-request-approvals'/)
  assert.match(currentUser, /'paper-purchase-request-approvals'/)
})

const paperPoRow = (overrides: Partial<PaperPoSourceRow> = {}): PaperPoSourceRow => ({
  paperRequestId: 1,
  requestNumber: 'PPR-1',
  customerName: 'Customer A',
  salesOrderId: 'SO-ID-1',
  salesOrderNumber: 'SO-1',
  paperRequestItemId: 1,
  itemName: 'Box',
  itemType: 'BOX',
  lengthMm: 400,
  breadthMm: 300,
  layerKey: 'layer-1',
  layerName: 'Top Liner',
  paperType: 'Natural',
  gsm: 120,
  bf: 16,
  deckleCm: 57,
  cutLengthCm: 145,
  quantity: 10.25,
  ...overrides,
})

test('Paper PO consolidation combines only procurement-compatible stored layers', () => {
  const result = consolidateApprovedPaperRows([
    paperPoRow(),
    paperPoRow({
      paperRequestId: 2,
      requestNumber: 'PPR-2',
      salesOrderId: 'SO-ID-2',
      salesOrderNumber: 'SO-2',
      layerKey: 'layer-3',
      layerName: 'Inner Liner',
      quantity: 5.5,
    }),
    paperPoRow({ paperRequestId: 3, requestNumber: 'PPR-3', bf: 18, quantity: 2 }),
    paperPoRow({ paperRequestId: 4, requestNumber: 'PPR-4', deckleCm: 60, quantity: 3 }),
  ])
  assert.equal(result.consolidatedRows.length, 3)
  assert.equal(result.consolidatedRows[0].consolidatedQuantity, 15.75)
  assert.equal(result.consolidatedRows[0].sourceRequestCount, 2)
  assert.deepEqual(result.consolidatedRows[0].sourceLayers, ['Top Liner', 'Inner Liner'])
})

test('Paper PO consolidation separates incomplete specifications for review', () => {
  const result = consolidateApprovedPaperRows([
    paperPoRow({ bf: null }),
    paperPoRow({ paperRequestId: 2, requestNumber: 'PPR-2', deckleCm: null }),
  ])
  assert.equal(result.consolidatedRows.length, 0)
  assert.equal(result.incompleteSpecificationRows.length, 2)
  assert.deepEqual(result.incompleteSpecificationRows[0].missingSpecifications, ['BF'])
  assert.deepEqual(result.incompleteSpecificationRows[1].missingSpecifications, ['Deckle'])
})

test('Paper PO feature is permission-controlled, read-only, and creates no calculation tables', () => {
  const migration = readFileSync(resolve('migrations/0009_add_paper_po_calculation_permission.sql'), 'utf8')
  const dashboard = readFileSync(resolve('src/Dashboard.tsx'), 'utf8')
  const consolidateApi = readFileSync(resolve('functions/api/paper-po-calculation/consolidate.ts'), 'utf8')
  assert.match(migration, /paper-po-calculation/)
  assert.doesNotMatch(migration, /\b(?:CREATE TABLE|ALTER TABLE|DROP|DELETE|TRUNCATE)\b/i)
  assert.match(dashboard, /key: 'paper-po-calculation'/)
  assert.match(consolidateApi, /request_status = 'APPROVED'/)
  assert.match(consolidateApi, /total_paper_weight_kg AS quantity/)
  assert.doesNotMatch(consolidateApi, /\b(?:INSERT|UPDATE|DELETE)\b/)
})
