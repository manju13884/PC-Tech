import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  calculateCellSize,
  calculateCellCounts,
  calculateCellFit,
  conversionRateLabel,
  calculatePartitionGeometry,
  partitionDrawingLayout,
  dimensionBreakdown,
  calculateConversionCost,
  calculateLayerWeight,
  calculatePaperCost,
  calculatePartition,
  calculatePartitionGrid,
  calculateSlotWidth,
  calculateSlotConfiguration,
  calculatePartitionArea,
  calculatePartitionPieces,
  calculateSellingPrice,
  calculateSlotDepth,
  changeFlute,
  createPartitionState,
  FLUTE_RATIOS,
  layerLabel,
  PLY_LAYERS,
} from '../src/features/partition-calculator/partitionCalculatorEngine.ts'
import type { PartitionState } from '../src/features/partition-calculator/partitionCalculatorEngine.ts'
import { ADVANCED_PAPER_WEIGHT_CONSTANTS } from '../src/features/advanced-corrugated-box-calculator/constants/advancedPaperWeightConstants.ts'

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
const example = (): PartitionState => ({
  ...createPartitionState(),
  ply: 3,
  length: '400',
  width: '300',
  height: '150',
  cellLength: '197',
  cellWidth: '296',
  thickness: '2',
  lengthProjection: '0',
  widthProjection: '0',
})
const resultFor = (state = example()) => {
  const calculation = calculatePartition(state)
  assert.deepEqual(calculation.errors, {})
  assert.ok(calculation.result)
  return calculation.result
}

test('defaults reuse shared wastage and flute ratios, with 5 Ply and 500 sets', () => {
  const state = createPartitionState()
  assert.equal(state.ply, 5)
  assert.equal(state.quantity, '500')
  assert.equal(state.thickness, '')
  assert.equal(state.slotWidthOverride, null)
  close(
    Number(state.wastage),
    (ADVANCED_PAPER_WEIGHT_CONSTANTS.wastageFactor - 1) * 100,
  )
  assert.equal(FLUTE_RATIOS.B, 1.36)
  assert.equal(FLUTE_RATIOS.C, 1.43)
  assert.equal(FLUTE_RATIOS.E, undefined)
})

for (const [ply, ratios] of [
  [3, [1, 1.36, 1]],
  [5, [1, 1.36, 1, 1.43, 1]],
  [7, [1, 1.36, 1, 1.43, 1, 1.45, 1]],
] as const) {
  test(`${ply} Ply: every layer uses its own ratio and contributes weight and cost once`, () => {
    const result = resultFor({ ...example(), ply })
    assert.equal(result.layers.length, ply)
    result.layers.forEach((layer, index) => {
      close(layer.weightPerSet, ((0.255 * 1.05 * 120) / 1000) * ratios[index])
      close(layer.weight, layer.weightPerSet * 500)
      close(layer.costPerSet, layer.weightPerSet * 33)
      close(layer.cost, layer.costPerSet * 500)
    })
    close(
      result.weightPerSet,
      0.26775 * 0.12 * ratios.reduce((sum, value) => sum + value, 0),
    )
    close(result.material, result.weight * 33)
    close(result.cost, result.material)
  })
}

test('different GSM, paper rates, independent flutes, BF and shade', () => {
  const state = { ...example(), ply: 5 as const, wastage: '0', quantity: '10' }
  for (const [index, key] of PLY_LAYERS[5].entries()) {
    state.layers[key] = {
      ...state.layers[key],
      gsm: String(100 + 20 * index),
      rate: String(20 + index),
      bf: '24',
      shade: 'GYT',
    }
  }
  state.layers.flute1 = changeFlute(state.layers.flute1, 'C')
  state.layers.flute2 = {
    ...changeFlute(state.layers.flute2, 'E'),
    drawRatio: '1.2',
  }
  const result = resultFor(state)
  const expectedWeights = [
    0.0255,
    0.255 * 0.12 * 1.43,
    0.255 * 0.14,
    0.255 * 0.16 * 1.2,
    0.255 * 0.18,
  ]
  close(
    result.weight,
    expectedWeights.reduce((sum, weight) => sum + weight, 0) * 10,
  )
  close(
    result.material,
    expectedWeights.reduce(
      (sum, weight, index) => sum + weight * (20 + index),
      0,
    ) * 10,
  )
  assert.equal(result.layers[1].ratio, 1.43)
  assert.equal(result.layers[3].ratio, 1.2)
})

test('ply changes use only active layers and preserve configured values', () => {
  const state = example()
  state.layers.flute2.gsm = ''
  assert.ok(calculatePartition(state).result)
  assert.equal(calculatePartition({ ...state, ply: 5 }).result, null)
  state.layers.flute2.gsm = '180'
  assert.equal(resultFor({ ...state, ply: 7 }).layers.length, 7)
  assert.equal(resultFor({ ...state, ply: 3 }).layers.length, 3)
  assert.equal(layerLabel('liner1', 5), 'Middle Liner')
  assert.equal(layerLabel('flute1', 3), 'Flute')
  assert.equal(layerLabel('liner1', 7), 'Liner 1')
})

test('wastage and quantity scale paper requirements exactly once', () => {
  const baseline = resultFor({ ...example(), quantity: '1', wastage: '0' })
  const larger = resultFor({ ...example(), quantity: '200', wastage: '12.5' })
  close(larger.weightPerSet, baseline.weightPerSet * 1.125)
  close(larger.material, baseline.materialPerSet * 1.125 * 200)
  close(larger.area.finalOrder, 0.255 * 1.125 * 200)
})

test('conversion area uses gross board area, set conversion uses complete set quantity', () => {
  const area = resultFor({
    ...example(),
    conversionRate: '2',
    conversionBasis: 'area',
  })
  close(area.conversion, 267.75)
  close(area.conversionPerSet, 0.5355)
  close(area.costPerSet, 4.0980744)
  const sets = resultFor({
    ...example(),
    conversionRate: '2',
    conversionBasis: 'set',
  })
  close(sets.conversion, 1000)
  close(sets.costPerSet, sets.materialPerSet + 2)
  close(calculateConversionCost(133.875, 500, 0, 'area'), 0)
})

test('margin and markup are distinct; profits and selling totals use the correct formula', () => {
  close(calculateSellingPrice(100, 20, 'markup'), 120)
  close(calculateSellingPrice(100, 20, 'margin'), 125)
  for (const pricingMethod of ['margin', 'markup'] as const) {
    const result = resultFor({
      ...example(),
      pricingMethod,
      pricingPercent: '20',
    })
    close(
      result.sellingPerSet,
      pricingMethod === 'margin'
        ? result.costPerSet / 0.8
        : result.costPerSet * 1.2,
    )
    close(result.selling, result.sellingPerSet * 500)
    close(result.profit, result.selling - result.cost)
    close(result.profitPerSet, result.sellingPerSet - result.costPerSet)
  }
  assert.equal(
    calculatePartition({
      ...example(),
      pricingMethod: 'margin',
      pricingPercent: '100',
    }).result,
    null,
  )
  assert.equal(
    calculatePartition({
      ...example(),
      pricingMethod: 'margin',
      pricingPercent: '101',
    }).result,
    null,
  )
  assert.ok(
    calculatePartition({
      ...example(),
      pricingMethod: 'markup',
      pricingPercent: '150',
    }).result,
  )
})

test('slot auto tracks height, manual override survives height changes, reset restores auto', () => {
  assert.equal(calculateSlotDepth(150, null), 75)
  assert.equal(calculateSlotDepth(200, null), 100)
  assert.equal(resultFor({ ...example(), slotOverride: '60' }).slotDepth, 60)
  assert.equal(
    resultFor({ ...example(), height: '200', slotOverride: '60' }).slotDepth,
    60,
  )
  assert.equal(
    resultFor({ ...example(), height: '200', slotOverride: null }).slotDepth,
    100,
  )
  for (const override of ['', '0', '-5', '151', 'Infinity'])
    assert.equal(
      calculatePartition({ ...example(), slotOverride: override }).result,
      null,
    )
})

test('E flute requires configured ratio, and switching back uses shared defaults', () => {
  const state = example()
  state.layers.flute1 = changeFlute(state.layers.flute1, 'E')
  assert.equal(state.layers.flute1.drawRatio, '')
  assert.equal(calculatePartition(state).result, null)
  state.layers.flute1.drawRatio = '1.18'
  close(resultFor(state).layers[1].weightPerSet, 0.26775 * 0.12 * 1.18)
  assert.equal(changeFlute(state.layers.flute1, 'B').drawRatio, '1.36')
})

test('reject invalid, zero, fractional counts, negative costs and nonfinite inputs without NaN results', () => {
  for (const key of [
    'length',
    'width',
    'height',
    'quantity',
    'cellLength',
    'cellWidth',
    'thickness',
  ] as const) {
    for (const value of ['', ' ', '0', '-1', 'NaN', 'Infinity']) {
      const calculation = calculatePartition({ ...example(), [key]: value })
      assert.equal(calculation.result, null, `${key}: ${value}`)
      assert.ok(calculation.errors[key])
    }
  }
  for (const key of ['quantity'] as const)
    assert.equal(
      calculatePartition({ ...example(), [key]: '1.5' }).result,
      null,
    )
  for (const key of ['wastage', 'conversionRate', 'pricingPercent'] as const)
    assert.equal(calculatePartition({ ...example(), [key]: '-1' }).result, null)
  for (const [key, value] of [
    ['gsm', '0'],
    ['rate', '-1'],
    ['drawRatio', '0'],
    ['drawRatio', '.9'],
  ] as const) {
    const state = example()
    state.layers.flute1[key] = value
    assert.equal(calculatePartition(state).result, null)
  }
  const free = example()
  for (const layer of Object.values(free.layers)) layer.rate = '0'
  close(resultFor(free).cost, 0)
  const huge = calculatePartition({
    ...example(),
    length: '1e308',
    cellLength: '1e308',
    height: '1e308',
  })
  assert.equal(huge.result, null)
  assert.ok(Object.keys(huge.errors).length)
})

test('pure helpers preserve fractional precision and guard invalid arguments', () => {
  close(calculateLayerWeight(0.255, 120, 1.36), 0.041616)
  close(calculatePaperCost(0.041616, 31.5), 1.310904)
  close(calculatePartitionArea(400, 300, 150, 2, 1, 1, 0).perSet, 0.255)
  assert.throws(() => calculateCellSize(0, 300, 4, 3, 2, 0, 0), RangeError)
  assert.throws(() => calculatePartitionPieces(0, 3), RangeError)
  assert.throws(() => calculateLayerWeight(1, 0), RangeError)
  assert.throws(() => calculatePaperCost(1, -1), RangeError)
  assert.throws(() => calculateSellingPrice(1, 100, 'margin'), RangeError)
})

test('calculator is routed through existing menu and SUPERADMIN access conventions', () => {
  const dashboard = readFileSync(
    new URL('../src/Dashboard.tsx', import.meta.url),
    'utf8',
  )
  assert.match(dashboard, /key: 'partition-calculator'/)
  assert.match(dashboard, /selectedItem.key === 'partition-calculator'/)
  assert.match(dashboard, /<PartitionCalculator generatedBy=\{username\} \/>/)
  assert.match(dashboard, /userRole === 'SUPERADMIN' \? menuItems.map/)
  for (const file of ['me', 'login']) {
    const source = readFileSync(
      new URL(`../functions/api/auth/${file}.ts`, import.meta.url),
      'utf8',
    )
    assert.match(source, /'partition-calculator'/)
    assert.match(source, /roleName === 'SUPERADMIN'/)
  }
})

test('slot width follows thickness until overridden and resets independently of depth', () => {
  assert.equal(calculateSlotWidth(2, null), 2)
  assert.equal(calculateSlotWidth(3.5, null), 3.5)
  assert.equal(calculateSlotWidth(3.5, '4'), 4)
  const manual = resultFor({
    ...example(),
    slotWidthOverride: '3.2',
    slotOverride: '60',
  })
  assert.equal(manual.slotWidth, 3.2)
  assert.equal(manual.slotDepth, 60)
  const resized = resultFor({
    ...example(),
    thickness: '3',
    cellLength: '195.5',
    cellWidth: '294',
    height: '200',
    slotWidthOverride: '3.2',
    slotOverride: '60',
  })
  assert.equal(resized.slotWidth, 3.2)
  assert.equal(resized.slotDepth, 60)
  const resetWidth = resultFor({
    ...example(),
    thickness: '3',
    cellLength: '195.5',
    cellWidth: '294',
    slotWidthOverride: null,
    slotOverride: '60',
  })
  assert.equal(resetWidth.slotWidth, 3)
  assert.equal(resetWidth.slotDepth, 60)
  const resetDepth = resultFor({
    ...example(),
    height: '200',
    slotWidthOverride: '3.2',
    slotOverride: null,
  })
  assert.equal(resetDepth.slotWidth, 3.2)
  assert.equal(resetDepth.slotDepth, 100)
  // Slot cut-outs are not subtracted from purchased board/paper requirements.
  close(manual.material, resultFor().material)
  for (const value of ['', ' ', '0', '-1', 'NaN', 'Infinity']) {
    const calculation = calculatePartition({
      ...example(),
      slotWidthOverride: value,
    })
    assert.equal(calculation.result, null)
    assert.ok(calculation.errors.slotWidthOverride)
  }
})

const drawing = (): PartitionState => ({
  ...example(),
  length: '370',
  width: '340',
  cellLength: '72',
  cellWidth: '92',
  thickness: '8',
  lengthProjection: '21',
  widthProjection: '16',
})
for (const ply of [3, 5, 7] as const) {
  test(`mandatory drawing regression, ${ply} Ply: exact cells, perimeter strips and full projected area`, () => {
    const r = resultFor({ ...drawing(), ply })
    assert.deepEqual(r.cellCounts, { length: 4, width: 3 })
    assert.deepEqual(r.cells, { length: 72, width: 92 })
    assert.equal(r.totalCells, 12)
    assert.deepEqual(r.pieces, { length: 4, width: 5, total: 9 })
    assert.deepEqual(r.slots, {
      lengthSlotsPerPiece: 5,
      widthSlotsPerPiece: 4,
      width: 8,
      depth: 75,
    })
    assert.equal(4 * 72 + 5 * 8 + 2 * 21, 370)
    assert.equal(3 * 92 + 4 * 8 + 2 * 16, 340)
    assert.equal(
      dimensionBreakdown(4, 72, 8, 21),
      '21 + 8 + 72 + 8 + 72 + 8 + 72 + 8 + 72 + 8 + 21 = 370 mm',
    )
    assert.equal(
      dimensionBreakdown(3, 92, 8, 16),
      '16 + 8 + 92 + 8 + 92 + 8 + 92 + 8 + 16 = 340 mm',
    )
    close(r.area.perSet, 0.477)
    close(r.area.finalPerSet, 0.50085)
    close(
      r.weightPerSet,
      0.50085 * 0.12 * r.layers.reduce((sum, layer) => sum + layer.ratio, 0),
    )
    close(r.materialPerSet, r.weightPerSet * 33)
    close(r.selling, r.materialPerSet * 500)
  })
}
test('different projections, zero projection and different thickness preserve exact geometry', () => {
  for (const [t, pl, pw] of [
    [2, 0, 0],
    [3.5, 12.5, 7],
    [8, 21, 16],
  ]) {
    const r = resultFor({
      ...drawing(),
      thickness: String(t),
      lengthProjection: String(pl),
      widthProjection: String(pw),
      length: String(4 * 72 + 5 * t + 2 * pl),
      width: String(3 * 92 + 4 * t + 2 * pw),
    })
    assert.deepEqual(r.cellCounts, { length: 4, width: 3 })
    assert.deepEqual(r.cells, { length: 72, width: 92 })
  }
})
test('non-exact counts are diagnostic only, with nearest cells and dimensional difference', () => {
  const state = { ...drawing(), length: '384.4' }
  const r = calculatePartition(state)
  assert.equal(r.result, null)
  assert.equal(
    r.errors.cellLength,
    'Entered dimensions do not produce an exact partition configuration.',
  )
  const fit = calculateCellFit(384.4, 72, 8, 21)
  assert.equal(fit.count, null)
  close(fit.calculatedCount, 4.18)
  assert.equal(fit.nearestCount, 4)
  close(fit.actualCell!, 75.6)
  close(fit.difference!, -14.4)
  assert.equal(state.cellLength, '72')
  assert.throws(
    () => calculateCellCounts(384.4, 340, 72, 92, 8, 21, 16),
    RangeError,
  )
  assert.equal(calculateCellFit(410, 72, 8, 21).nearestCount, 5)
})
test('1 by N, N by 1 and 1 by 1 all include perimeter strips and crossing slots', () => {
  for (const [l, w] of [
    [1, 4],
    [4, 1],
    [1, 1],
  ]) {
    const r = resultFor({
      ...drawing(),
      length: String(l * 72 + (l + 1) * 8 + 42),
      width: String(w * 92 + (w + 1) * 8 + 32),
    })
    assert.deepEqual(r.pieces, {
      length: w + 1,
      width: l + 1,
      total: l + w + 2,
    })
    assert.equal(r.slots.lengthSlotsPerPiece, l + 1)
    assert.equal(r.slots.widthSlotsPerPiece, w + 1)
    assert.ok(r.area.perSet > 0 && r.materialPerSet > 0)
  }
})
test('decimal arithmetic distinguishes exact fits from arbitrarily close fractional counts', () => {
  assert.deepEqual(calculateCellCounts(0.34, 0.64, 0.1, 0.2, 0.01, 0, 0), {
    length: 3,
    width: 3,
  })
  assert.equal(calculateCellFit(0.33999999999999997, 0.1, 0.01, 0).count, null)
  assert.equal(calculateCellFit(0.3400000000000001, 0.1, 0.01, 0).count, null)
})
test('invalid projections, impossible fits and unsafe totals never produce manufacturing results', () => {
  for (const key of ['lengthProjection', 'widthProjection'] as const)
    for (const value of ['', ' ', '-1', 'NaN', 'Infinity', '1000'])
      assert.equal(
        calculatePartition({ ...drawing(), [key]: value }).result,
        null,
      )
  assert.equal(calculatePartition({ ...drawing(), length: '1' }).result, null)
  assert.equal(calculateCellFit(20, 72, 8, 0).actualCell, undefined)
  assert.throws(
    () => calculatePartitionGrid(300000001, 300000001, 1, 1, 1, 0, 0),
    RangeError,
  )
  assert.ok(dimensionBreakdown(1000000, 1, 1, 0).length < 100)
})

test('drawing shares exact reference geometry with UI results and costing', () => {
  const calculation = calculatePartition({ ...drawing(), height: '77' })
  const g = calculation.geometry!
  assert.ok(g.isExactFit)
  assert.deepEqual(g.counts, calculation.result!.cellCounts)
  assert.deepEqual(g.pieces, calculation.result!.pieces)
  assert.deepEqual(g.slots, calculation.result!.slots)
  assert.deepEqual(g.reconstructed, { length: 370, width: 340 })
  assert.deepEqual(g.cells, { length: 72, width: 92 })
  const d = partitionDrawingLayout(g)
  const scale = 500 / 370
  close(d.px, 21 * scale)
  close(d.py, 16 * scale)
  close(d.t, 8 * scale)
  close(d.cellWidth, 72 * scale)
  close(d.cellHeight, 92 * scale)
  close(d.px + (g.pieces.width - 1) * d.pitchX + d.t, d.width - d.px)
  close(d.py + (g.pieces.length - 1) * d.pitchY + d.t, d.height - d.py)
  assert.equal(d.numbers.length, 12)
  assert.deepEqual(
    d.numbers.map((cell) => cell.number),
    Array.from({ length: 12 }, (_, i) => i + 1),
  )
  close(d.numbers[0].x, (21 + 8 + 36) * scale)
  close(d.numbers[4].y, (16 + 8 + 92 + 8 + 46) * scale)
  assert.equal(g.slots.depth, 38.5)
  assert.equal(d.sideA.count, 5)
  assert.equal(d.sideB.count, 4)
})

test('drawing updates slot overrides and does not depend on paper or costing validity', () => {
  const state = {
    ...drawing(),
    height: '77',
    slotOverride: '30',
    slotWidthOverride: '9',
  }
  state.layers.top.gsm = ''
  const { geometry, result } = calculatePartition(state)
  assert.equal(result, null)
  assert.ok(geometry)
  assert.equal(geometry.slots.depth, 30)
  assert.equal(geometry.slots.width, 9)
  const d = partitionDrawingLayout(geometry)
  close(d.sideA.depth / d.sideA.height, 30 / 77)
  close(d.sideA.slotWidth / d.sideA.thickness, 9 / 8)
  assert.equal(
    calculatePartition({ ...drawing(), length: '384.4' }).geometry,
    null,
  )
  assert.equal(
    calculatePartition({ ...drawing(), slotOverride: '200' }).geometry,
    null,
  )
})

test('drawing coordinates are bounded for decimal, tiny, large and high-count layouts', () => {
  for (const factor of [1e-9, 1, 1e100]) {
    const state = {
      ...drawing(),
      length: String(370 * factor),
      width: String(340 * factor),
      height: String(77 * factor),
      cellLength: String(72 * factor),
      cellWidth: String(92 * factor),
      thickness: String(8 * factor),
      lengthProjection: String(21 * factor),
      widthProjection: String(16 * factor),
    }
    // Construct exact decimal scientific inputs without multiplication artifacts.
    const exponent = factor === 1e-9 ? -9 : factor === 1 ? 0 : 100
    for (const [key, value] of Object.entries({
      length: 370,
      width: 340,
      height: 77,
      cellLength: 72,
      cellWidth: 92,
      thickness: 8,
      lengthProjection: 21,
      widthProjection: 16,
    }))
      state[key as keyof typeof state] = `${value}e${exponent}` as never
    const d = partitionDrawingLayout(calculatePartitionGeometry(state))
    close(d.width, 500)
    assert.ok(!JSON.stringify(d).includes('null'))
    assert.ok(d.t > 0 && d.cellWidth > d.t)
  }
  const g = calculatePartitionGeometry({
    ...drawing(),
    length: '2000001',
    width: '3',
    height: '2',
    cellLength: '1',
    cellWidth: '1',
    thickness: '1',
    lengthProjection: '0',
    widthProjection: '0',
  })
  const d = partitionDrawingLayout(g)
  assert.equal(g.totalCells, 1000000)
  assert.equal(d.numbers.length, 0)
  assert.ok(JSON.stringify(d).length < 2000)
  for (const [l, w] of [
    [1, 4],
    [4, 1],
    [1, 1],
  ]) {
    const g = calculatePartitionGeometry({
      ...drawing(),
      length: String(l * 72 + (l + 1) * 8 + 42),
      width: String(w * 92 + (w + 1) * 8 + 32),
    })
    assert.equal(partitionDrawingLayout(g).numbers.length, l * w)
  }
})

test('costing defaults to per KG and margin, with matching conversion units', () => {
  const state = createPartitionState()
  assert.equal(state.conversionBasis, 'kg')
  assert.equal(state.pricingMethod, 'margin')
  assert.equal(conversionRateLabel('kg'), 'Conversion Rate (\u20b9/KG)')
  assert.equal(conversionRateLabel('area'), 'Conversion Rate (\u20b9/m\u00b2)')
  assert.equal(conversionRateLabel('set'), 'Conversion Rate (\u20b9/Set)')
})
test('per KG uses paper weight exactly once, preserving full precision', () => {
  close(calculateConversionCost(1, 500, 12, 'kg', 425), 5100)
  close(calculateConversionCost(1, 1, 12, 'kg', 0.85), 10.2)
  const r = resultFor({ ...drawing(), conversionRate: '12' })
  close(r.conversionPerSet, r.weightPerSet * 12)
  close(r.conversion, r.weight * 12)
  close(r.costPerSet, r.materialPerSet + r.weightPerSet * 12)
  const doubled = resultFor({
    ...drawing(),
    conversionRate: '12',
    quantity: '1000',
  })
  close(doubled.conversion, r.conversion * 2)
  close(doubled.conversionPerSet, r.conversionPerSet)
  assert.throws(() => calculateConversionCost(1, 1, 12, 'kg'), RangeError)
  assert.throws(() => calculateConversionCost(1, 1, 12, 'kg', -1), RangeError)
})
test('switching all conversion bases and pricing methods immediately refreshes totals', () => {
  const state = { ...drawing(), conversionRate: '12', pricingPercent: '20' }
  const original = resultFor(state)
  for (const basis of ['kg', 'area', 'set', 'kg'] as const) {
    state.conversionBasis = basis
    for (const method of ['margin', 'markup', 'margin'] as const) {
      state.pricingMethod = method
      const r = resultFor(state)
      const conversion =
        (basis === 'kg'
          ? r.weightPerSet
          : basis === 'area'
            ? r.area.finalPerSet
            : 1) * 12
      close(r.conversionPerSet, conversion)
      close(r.conversion, conversion * 500)
      close(
        r.sellingPerSet,
        method === 'margin' ? r.costPerSet / 0.8 : r.costPerSet * 1.2,
      )
      close(r.profit, r.selling - r.cost)
      close(r.weightPerSet, original.weightPerSet)
      assert.deepEqual(r.cells, original.cells)
    }
  }
  close(calculateSellingPrice(80, 20, 'margin'), 100)
  close(calculateSellingPrice(80, 20, 'markup'), 96)
})
