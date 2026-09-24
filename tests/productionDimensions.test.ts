import assert from 'node:assert/strict'
import test from 'node:test'
import { BLANK_SIZE_ALLOWANCES_MM, calculateProductionDimensions } from '../src/features/calculators/blankSize.ts'
import { formatProductionDimension, initializeProductionMachine, updateProductionUps } from '../src/features/production-planning/productionMachineDimensions.ts'

const reference = { lengthMm: 355, breadthMm: 385, heightMm: 160, ply: 5, fluteRun: 'B', ups: 1 }
const line = { ...reference, productType: 'BOX', widthMm: reference.breadthMm, deckleSize: '56.50', cutLengthCm: 154.2, productionQuantity: 1000, twoPlyQuantity: 2000 }

test('approved 5-ply regression: 1-Up -> 2-Ups -> 1-Up, cut length stays 154.20', () => {
  assert.deepEqual(calculateProductionDimensions(reference), { deckleSizeCm: 56.5, cutLengthCm: 154.2 })
  assert.deepEqual(calculateProductionDimensions({ ...reference, ups: 2 }), { deckleSizeCm: 110, cutLengthCm: 154.2 })
  const two = updateProductionUps(line, 2)
  assert.equal(formatProductionDimension(Number(two.deckleSize)), '110.00')
  assert.equal(formatProductionDimension(two.cutLengthCm), '154.20')
  const one = updateProductionUps(two, 1)
  assert.equal(formatProductionDimension(Number(one.deckleSize)), '56.50')
  assert.equal(formatProductionDimension(one.cutLengthCm), '154.20')
  assert.equal(two.productionQuantity, 1000)
  assert.equal(two.twoPlyQuantity, 2000)
})

test('multi-up uses blank widths plus one configured overall allowance, not multiplied outer trim', () => {
  for (const ups of [2, 3, 4, 5]) {
    const result = calculateProductionDimensions({ ...reference, lengthMm: 300, breadthMm: 200, heightMm: 100, ups })!
    assert.equal(result.deckleSizeCm, (300 * ups + 10) / 10)
    assert.equal(result.cutLengthCm, 106.2)
  }
  const custom = calculateProductionDimensions({ ...reference, ups: 2 }, { ...BLANK_SIZE_ALLOWANCES_MM, multiUpDeckle: 16 })!
  assert.equal(custom.deckleSizeCm, 110.6)
  assert.equal(custom.cutLengthCm, 154.2)
})

test('initialization calculates new rows, preserves restored and unchanged rows, and reacts to source changes', () => {
  const newRow = initializeProductionMachine({ ...line, deckleSize: '999', cutLengthCm: 999 })
  assert.equal(newRow.deckleSize, '56.5')
  assert.equal(newRow.cutLengthCm, 154.2)
  const saved = { ...line, ups: 2, deckleSize: '112.35', cutLengthCm: 155.7, restoredMachineSettings: true }
  assert.deepEqual(initializeProductionMachine(saved), saved)
  assert.deepEqual(initializeProductionMachine({ ...saved, deckleSize: '999' }, saved), saved)
  const changedUps = updateProductionUps(saved, 3)
  assert.equal(changedUps.deckleSize, '164.5')
  assert.equal(changedUps.cutLengthCm, 154.2)
  const changedWidth = initializeProductionMachine({ ...line, widthMm: 400 }, line)
  assert.equal(changedWidth.deckleSize, '58')
  assert.equal(changedWidth.cutLengthCm, 157.2)
  assert.equal(initializeProductionMachine({ ...line, lengthMm: 400 }, line).cutLengthCm, 163.2)
  assert.equal(initializeProductionMachine({ ...line, heightMm: 200 }, line).deckleSize, '60.5')
  assert.equal(initializeProductionMachine({ ...line, ply: 3 }, line).cutLengthCm, 153)
  const changedFlute = initializeProductionMachine({ ...saved, fluteRun: 'C' }, saved)
  assert.equal(changedFlute.deckleSize, '110')
  assert.equal(changedFlute.cutLengthCm, 154.2)
})

test('invalid Ups and incomplete dimensions cannot produce a calculated configuration', () => {
  for (const ups of [null, 0, -1, 1.5, Infinity, NaN]) {
    assert.equal(calculateProductionDimensions({ ...reference, ups }), null)
    const updated = updateProductionUps(line, ups)
    assert.equal(updated.deckleSize, '')
    assert.equal(updated.cutLengthCm, null)
  }
  assert.equal(calculateProductionDimensions({ ...reference, lengthMm: null }), null)
  assert.equal(calculateProductionDimensions({ ...reference, breadthMm: 0 }), null)
  assert.equal(calculateProductionDimensions({ ...reference, ply: 2 }), null)
  const roll = { ...line, productType: 'PAPER / ROLL', ply: 2 }
  assert.deepEqual(updateProductionUps(roll, 2), { ...roll, ups: 2 })
})
