import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { calculateAdvancedFinalPrice } from '../src/features/advanced-corrugated-box-calculator/calculations/advancedBoxCalculatorEngine'
import { calculateAdvancedPaperWeight } from '../src/features/advanced-corrugated-box-calculator/calculations/advancedPaperWeightCalculator'
import { ADVANCED_PAPER_WEIGHT_CONSTANTS } from '../src/features/advanced-corrugated-box-calculator/constants/advancedPaperWeightConstants'
import {
  validateAdvancedPaperWeightInput,
  validateAdvancedQuantity,
} from '../src/features/advanced-corrugated-box-calculator/validation/advancedPaperWeightValidation'

const closeTo = (actual: number, expected: number, tolerance = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

const threePlyInput = {
  ply: 3 as const,
  lengthMm: 400,
  breadthMm: 300,
  heightMm: 250,
  quantity: 100,
  topGsm: 120,
  fluteGsm: 120,
  linerGsm: 120,
  topRatePerKg: 30,
  fluteRatePerKg: 31,
  linerRatePerKg: 32,
}

const fivePlyInput = {
  ...threePlyInput,
  ply: 5 as const,
  flute1Gsm: 140,
  liner1Gsm: 150,
  flute1RatePerKg: 33,
  liner1RatePerKg: 34,
}

test('calculates a valid 3-ply requirement with full internal precision', () => {
  const result = calculateAdvancedPaperWeight(threePlyInput)
  closeTo(result.sheetWidthCm, 145)
  closeTo(result.sheetLengthCm, 57)
  closeTo(result.sheetAreaSqM, 0.8265)
  assert.equal(result.layerResults.length, 3)
  closeTo(result.grandTotalWeightKg, result.totalBoxWeightKg * 100)
})

test('calculates a valid 5-ply requirement and grouped physical layers', () => {
  const result = calculateAdvancedPaperWeight(fivePlyInput)
  assert.equal(result.layerResults.length, 5)
  const fluteTotal = result.layerResults
    .filter((layer) => layer.key === 'flute' || layer.key === 'flute1')
    .reduce((total, layer) => total + layer.totalQuantityWeightKg, 0)
  const linerTotal = result.layerResults
    .filter((layer) => layer.key === 'liner' || layer.key === 'liner1')
    .reduce((total, layer) => total + layer.totalQuantityWeightKg, 0)
  closeTo(result.groupedFluteWeightKg, fluteTotal)
  closeTo(result.groupedLinerWeightKg, linerTotal)
})

test('quantity 1 keeps each layer total equal to its per-box weight', () => {
  const result = calculateAdvancedPaperWeight({ ...threePlyInput, quantity: 1 })
  result.layerResults.forEach((layer) => closeTo(layer.totalQuantityWeightKg, layer.weightPerBoxKg))
  closeTo(result.grandTotalWeightKg, result.totalBoxWeightKg)
})

test('calculates 3-ply paper cost with the mapped physical-layer rates', () => {
  const result = calculateAdvancedPaperWeight(threePlyInput)
  const expectedRates = { top: 30, flute: 31, liner: 32 }
  result.layerResults.forEach((layer) => {
    assert.equal(layer.ratePerKg, expectedRates[layer.key as keyof typeof expectedRates])
    closeTo(layer.totalPaperPrice as number, layer.totalQuantityWeightKg * (layer.ratePerKg as number))
  })
})

test('calculates 5-ply paper cost with BF, BL, CF and CL rate mapping', () => {
  const result = calculateAdvancedPaperWeight(fivePlyInput)
  const expectedRates = { top: 30, flute: 31, liner: 32, flute1: 33, liner1: 34 }
  result.layerResults.forEach((layer) => {
    assert.equal(layer.ratePerKg, expectedRates[layer.key])
  })
})

test('total paper cost equals the sum of all active layer prices', () => {
  const result = calculateAdvancedPaperWeight(fivePlyInput)
  const layerTotal = result.layerResults.reduce((total, layer) => total + (layer.totalPaperPrice as number), 0)
  closeTo(result.totalPaperCost as number, layerTotal)
})

test('missing, zero and negative rates leave weight available but cost unavailable', () => {
  for (const topRatePerKg of [undefined, 0, -1]) {
    const result = calculateAdvancedPaperWeight({ ...threePlyInput, topRatePerKg })
    assert.ok(result.totalBoxWeightKg > 0)
    assert.equal(result.layerResults[0].totalPaperPrice, null)
    assert.equal(result.totalPaperCost, null)
  }
})

test('changing a paper rate changes cost without changing paper weight', () => {
  const before = calculateAdvancedPaperWeight(threePlyInput)
  const after = calculateAdvancedPaperWeight({ ...threePlyInput, topRatePerKg: 45 })
  closeTo(after.totalBoxWeightKg, before.totalBoxWeightKg)
  closeTo(after.grandTotalWeightKg, before.grandTotalWeightKg)
  assert.notEqual(after.totalPaperCost, before.totalPaperCost)
})

test('quantity scales total paper weight and paper cost', () => {
  const one = calculateAdvancedPaperWeight({ ...threePlyInput, quantity: 1 })
  const ten = calculateAdvancedPaperWeight({ ...threePlyInput, quantity: 10 })
  closeTo(ten.grandTotalWeightKg, one.grandTotalWeightKg * 10)
  closeTo(ten.totalPaperCost as number, (one.totalPaperCost as number) * 10)
})

test('rejects zero, negative, decimal, NaN and infinite quantities', () => {
  assert.ok(validateAdvancedQuantity(''))
  assert.ok(validateAdvancedQuantity('0'))
  assert.ok(validateAdvancedQuantity('-1'))
  assert.ok(validateAdvancedQuantity('1.5'))
  assert.ok(validateAdvancedQuantity('NaN'))
  assert.ok(validateAdvancedQuantity('Infinity'))
})

test('rejects missing dimensions and GSM values', () => {
  assert.equal(validateAdvancedPaperWeightInput({ ...threePlyInput, lengthMm: 0 }), null)
  assert.equal(validateAdvancedPaperWeightInput({ ...threePlyInput, topGsm: 0 }), null)
})

test('accepts 3-ply without second flute and liner layers', () => {
  assert.ok(validateAdvancedPaperWeightInput(threePlyInput))
})

test('rejects 5-ply when Flute 1 or Liner 1 GSM is missing', () => {
  assert.equal(validateAdvancedPaperWeightInput({ ...fivePlyInput, flute1Gsm: 0 }), null)
  assert.equal(validateAdvancedPaperWeightInput({ ...fivePlyInput, liner1Gsm: 0 }), null)
})

test('uses the exact workbook constants', () => {
  assert.equal(ADVANCED_PAPER_WEIGHT_CONSTANTS.drawRatioB, 1.36)
  assert.equal(ADVANCED_PAPER_WEIGHT_CONSTANTS.drawRatioC, 1.43)
  assert.equal(ADVANCED_PAPER_WEIGHT_CONSTANTS.wastageFactor, 1.05)

  const result = calculateAdvancedPaperWeight(fivePlyInput)
  assert.equal(result.layerResults.find((layer) => layer.key === 'flute')?.drawRatio, 1.36)
  assert.equal(result.layerResults.find((layer) => layer.key === 'flute1')?.drawRatio, 1.43)
})

test('paper quantity does not alter existing Advanced pricing results', () => {
  const pricingBefore = calculateAdvancedFinalPrice(10, 2, 1, 1, 5)
  calculateAdvancedPaperWeight({ ...fivePlyInput, quantity: 2500 })
  const pricingAfter = calculateAdvancedFinalPrice(10, 2, 1, 1, 5)
  assert.deepEqual(pricingAfter, pricingBefore)
})

test('Advanced paper-weight implementation does not import the regular calculator', () => {
  const source = readFileSync(
    resolve('src/features/advanced-corrugated-box-calculator/calculations/advancedPaperWeightCalculator.ts'),
    'utf8',
  )
  assert.doesNotMatch(source, /corrugated-box-price-calculator\//)
})
