import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const [box, advanced, board, partition, paper] = await Promise.all([
  load('src/features/corrugated-box-price-calculator/utils.ts'),
  load('src/features/advanced-corrugated-box-calculator/calculations/advancedBoxCalculatorEngine.ts'),
  load('src/features/corrugated-board-price-calculator/boardCalculatorLogic.ts'),
  load('src/features/partition-calculator/partitionCalculatorEngine.ts'),
  load('src/features/advanced-corrugated-box-calculator/calculations/advancedPaperWeightCalculator.ts'),
])
const defaults = { paperPrice: '49', wastage: '8', margin: '14', markup: '16', transport: '3', ratePerKg: '18', printing: '4' }

test('board and partition initialize all paper layers and their applicable rates from Master Data', () => {
  const b = board.createInitialBoardCalculatorState(defaults)
  const p = partition.createPartitionState(defaults)
  assert.ok(Object.values(b.layers).every(layer => layer.paperRatePerKg === '49'))
  assert.ok(Object.values(p.layers).every(layer => layer.rate === '49'))
  assert.equal(b.marginPercent, '16')
  assert.equal(b.transportCostPerBoard, '3')
  assert.equal(b.conversionRatePerKg, '18')
  assert.equal(b.printingCostPerBoard, '4')
  assert.equal(p.conversionRate, '18')
  assert.equal(p.wastage, '8')
  assert.equal(p.pricingPercent, '14')
})

test('box and advanced weight calculations use the supplied wastage exactly once', () => {
  assert.equal(box.calculateWeightPerReem(100, 100, 1000, 1, 1.08), 1.08)
  assert.equal(advanced.calculateAdvancedWeightPerReem(100, 100, 1000, 1, 1.08), 1.08)
  const input = {ply:3,lengthMm:400,breadthMm:300,heightMm:250,quantity:100,topGsm:120,fluteGsm:120,linerGsm:120}
  const base = paper.calculateAdvancedPaperWeight(input, 1)
  const withWaste = paper.calculateAdvancedPaperWeight(input, 1.08)
  assert.ok(Math.abs(withWaste.grandTotalWeightKg - base.grandTotalWeightKg * 1.08) < 1e-9)
})

test('board calculations use configured wastage, transport and markup', () => {
  const state = {...board.createInitialBoardCalculatorState(defaults),lengthMm:'1000',widthMm:'1000',quantity:'1'}
  const result = board.calculateCorrugatedBoardPrice(state, 1.08)
  assert.ok(result)
  for (const layer of result.layers) assert.equal(layer.weightWithWastageKg, Math.ceil(layer.rawWeightKg * 1.08 * 1000) / 1000)
  assert.equal(result.otherCosts, 7)
  assert.equal(result.markupAmount, Math.ceil(result.totalCost * 0.16 * 1000) / 1000)
})
