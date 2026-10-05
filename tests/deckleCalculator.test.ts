import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateDeckleOptions, calculateDeckleForUps, APPROVED_DECKLE_ORIENTATION } from '../src/features/deckle-calculator/deckleCalculatorEngine.ts'
import { dimensionsForProductionLine } from '../src/features/production-planning/productionMachineDimensions.ts'
import { resolveMasterData, validMasterDataValue } from '../src/features/master-data/masterDataFields.ts'

const box = { lengthMm: 600, widthMm: 400, heightMm: 400, ply: 3 as const, fluteRun: 'B' }
test('600 × 400 × 400 uses existing 20mm trim and 205cm cut length', () => {
  const result = evaluateDeckleOptions(box, 120)
  assert.equal(result.recommended?.ups, 1)
  assert.equal(result.recommended.deckleCm, 82)
  assert.equal(result.recommended.cutLengthCm, 205)
  assert.equal(result.recommended.unusedCm, 38)
  assert.ok(Math.abs(result.recommended.utilization! - 68.3333333333) < 1e-8)
  assert.equal(result.options[1].deckleCm, 161)
  assert.equal(result.options[1].status, 'EXCEEDS')
  assert.equal(result.explanation.singleTrimMm, 20)
  assert.equal(result.explanation.multiTrimMm, 10)
})
test('dynamic 1, 2, 3-Up evaluation includes first exceeding 4-Up', () => {
  const result = evaluateDeckleOptions({ ...box, widthMm: 200, heightMm: 180 }, 120)
  assert.deepEqual(result.options.map(o => o.deckleCm), [40, 77, 115, 153])
  assert.deepEqual(result.options.map(o => o.status), ['FITS', 'FITS', 'FITS', 'EXCEEDS'])
  assert.equal(result.recommended?.ups, 3)
  assert.equal(result.recommended.unusedCm, 5)
})
test('2-Up selection follows shared trim instead of multiplying single-Up allowance', () => {
  const result = evaluateDeckleOptions({ ...box, widthMm: 300, heightMm: 230 }, 120)
  assert.equal(result.single.deckleSizeCm, 55)
  assert.equal(result.recommended?.ups, 2)
  assert.equal(result.recommended.deckleCm, 107)
})
test('exact 120cm fit with decimal dimensions is valid', () => {
  const result = evaluateDeckleOptions({ ...box, widthMm: 200, heightMm: 196.66666666666666 }, 120)
  assert.equal(result.recommended?.ups, 3)
  assert.ok(Math.abs(result.recommended.deckleCm - 120) < 1e-9)
  assert.equal(result.recommended.utilization, 100)
})
test('decimal deckle and 132cm configuration are not rounded before selection', () => {
  const input = { ...box, widthMm: 330, heightMm: 325 }
  assert.equal(evaluateDeckleOptions(input, 120).recommended?.ups, 1)
  assert.equal(evaluateDeckleOptions(input, 132).recommended?.ups, 2)
  assert.equal(evaluateDeckleOptions(input, 132).recommended?.deckleCm, 132)
  assert.equal(evaluateDeckleOptions({ ...box, heightMm: 401.25 }, 120).single.deckleSizeCm, 82.125)
})
test('no approved orientation fits: report actual minimum and preserve exceeding rows', () => {
  const result = evaluateDeckleOptions({ ...box, widthMm: 700, heightMm: 630 }, 120)
  assert.equal(result.recommended, null)
  assert.equal(result.minimum.deckleCm, 135)
  assert.ok(result.options.every(o => o.status === 'EXCEEDS' && o.utilization === null && o.unusedCm === null))
})
test('unapproved alternative rotation is never used to manufacture a fit', () => {
  assert.equal(calculateDeckleForUps({ ...box, orientation: 'rotated' }, 1), null)
  assert.throws(() => evaluateDeckleOptions({ ...box, orientation: 'rotated' }, 120), /INVALID ORIENTATION/)
  const result = evaluateDeckleOptions({ ...box, lengthMm: 10, widthMm: 1000, heightMm: 500 }, 120)
  assert.equal(result.recommended, null)
  assert.ok(result.options.every(o => o.orientation === APPROVED_DECKLE_ORIENTATION))
})
test('all current flute runs retain approved production orientation', () => {
  for (const fluteRun of ['', 'A', 'B', 'C', 'E', 'B + C']) {
    assert.equal(evaluateDeckleOptions({ ...box, fluteRun }, 120).recommended?.deckleCm, 82)
  }
})
test('reject invalid, zero, negative and nonfinite box dimensions', () => {
  for (const key of ['lengthMm', 'widthMm', 'heightMm']) for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => evaluateDeckleOptions({ ...box, [key]: value }, 120), /greater than zero/)
  }
})
test('missing or invalid maximum never supplies a hidden default', () => {
  assert.equal(resolveMasterData({}).maximumMachineDeckle, '')
  for (const maximum of [null, 0, -1, NaN, Infinity]) assert.throws(() => evaluateDeckleOptions(box, maximum), /not configured/)
  for (const value of ['', '0', '-1', 'Infinity', 'abc']) assert.equal(validMasterDataValue(value, 'maximumMachineDeckle'), false)
  assert.equal(validMasterDataValue('132.25', 'maximumMachineDeckle'), true)
  assert.equal(validMasterDataValue('0', 'wastage'), true)
})
test('calculator and production planning use identical deckle and cut length for every ply and Ups', () => {
  for (const ply of [3, 5, 7] as const) for (const ups of [1, 2, 3, 4, 10]) {
    const input = { ...box, ply }
    const planning = dimensionsForProductionLine({ ...input, productType: 'BOX', ups, deckleSize: '', cutLengthCm: null })
    assert.deepEqual(calculateDeckleForUps(input, ups), planning)
  }
})
test('positive integral Ups are required; fractional or zero Ups cannot be recommended', () => {
  for (const ups of [0, -1, 1.5, Infinity, NaN]) assert.equal(calculateDeckleForUps(box, ups), null)
})
test('1-Up failure cannot stop multi-up evaluation when shared trim permits a fit', () => {
  const result = evaluateDeckleOptions({ ...box, widthMm: 2, heightMm: 2 }, 2)
  assert.equal(result.options[0].status, 'EXCEEDS')
  assert.equal(result.recommended?.ups, 2)
  assert.equal(result.recommended.deckleCm, 1.8)
})
