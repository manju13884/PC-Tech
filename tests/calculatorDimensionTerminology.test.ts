import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateDeckle, PLY_LAYER_CONFIG } from '../src/features/corrugated-box-price-calculator/utils.ts'
import { calculateAdvancedDeckle } from '../src/features/advanced-corrugated-box-calculator/calculations/advancedBoxCalculatorEngine.ts'
import { PRODUCTION_PLY_LAYER_CONFIG } from '../src/features/advanced-corrugated-box-calculator/types/advancedBoxCalculatorTypes.ts'

// Existing dimension outputs captured before changing display labels.
const examples = [
  { ply: 3, dimensions: [300, 200, 100], deckleSize: '32.00', cutLength: '105.00' },
  { ply: 5, dimensions: [355, 385, 160], deckleSize: '56.50', cutLength: '153.00' },
  { ply: 7, dimensions: [600, 400, 300], deckleSize: '72.00', cutLength: '205.00' },
] as const

for (const example of examples) {
  for (const [name, calculate] of [['Box Price', calculateDeckle], ['Production', calculateAdvancedDeckle]] as const) {
    test(`${name}: ${example.ply}-ply dimension outputs retain their values and orientation`, () => {
      const [length, breadth, height] = example.dimensions
      const result = calculate(length, breadth, height)
      assert.equal(result.deckleSize.toFixed(2), example.deckleSize)
      assert.equal(result.deckleLength.toFixed(2), example.cutLength)
      assert.equal(PLY_LAYER_CONFIG[example.ply].length, example.ply)
      assert.equal(PRODUCTION_PLY_LAYER_CONFIG[example.ply].length, example.ply)
    })
  }
}
