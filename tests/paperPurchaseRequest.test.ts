import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  PAPER_COST_ELIGIBLE_ITEMS,
  PAPER_COST_EXCLUDED_ITEM_IDS,
  getPaperItemEligibility,
} from '../src/features/paper-purchase-request/config/eligiblePaperItems'
import {
  calculatePaperCost,
  createInitialPaperCostInputs,
  createPaperLayers,
} from '../src/features/paper-purchase-request/utils/paperCostCalculations'

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
  assert.match(source, /Show Calculator/)
  assert.match(source, /Hide Calculator/)
})

test('eligibility implementation contains no Item Name matching', () => {
  const source = readFileSync(
    resolve('src/features/paper-purchase-request/config/eligiblePaperItems.ts'),
    'utf8',
  )
  assert.doesNotMatch(source, /itemName|includes\(|RegExp|\.test\(/)
})
