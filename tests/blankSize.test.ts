import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBlankSize } from '../src/features/calculators/blankSize.ts'

const examples = [
  { ply: 3, length: 355, breadth: 385, height: 160, deckleMm: 565, cutMm: 1530 },
  { ply: 5, length: 355, breadth: 385, height: 160, deckleMm: 565, cutMm: 1542 },
  { ply: 7, length: 355, breadth: 385, height: 160, deckleMm: 565, cutMm: 1530 },
  { ply: 3, length: 300, breadth: 200, height: 100, deckleMm: 320, cutMm: 1050 },
  { ply: 5, length: 300, breadth: 200, height: 100, deckleMm: 320, cutMm: 1062 },
  { ply: 7, length: 600, breadth: 400, height: 300, deckleMm: 720, cutMm: 2050 },
  { ply: 3, length: 355.125, breadth: 385.25, height: 160.375, deckleMm: 565.625, cutMm: 1530.75 },
  { ply: 5, length: 355.125, breadth: 385.25, height: 160.375, deckleMm: 565.625, cutMm: 1542.75 },
  { ply: 7, length: 355.125, breadth: 385.25, height: 160.375, deckleMm: 565.625, cutMm: 1530.75 },
] as const

for (const example of examples) {
  test(`${example.ply} ply: ${example.length} × ${example.breadth} × ${example.height} mm`, () => {
    assert.deepEqual(calculateBlankSize(example), {
      deckleSizeMm: example.deckleMm,
      cutLengthMm: example.cutMm,
      deckleSizeCm: example.deckleMm / 10,
      cutLengthCm: example.cutMm / 10,
    })
  })
}

test('quantity does not affect blank dimensions for any supported ply', () => {
  for (const ply of [3, 5, 7] as const) {
    const input = { ply, length: 355, breadth: 385, height: 160, quantity: 1 }
    const expected = calculateBlankSize(input)
    for (const quantity of [10, 500, 10000]) {
      const changedQuantity = { ...input, quantity }
      assert.deepEqual(calculateBlankSize(changedQuantity), expected)
    }
  }
})

test('reference outputs format to two decimals without intermediate rounding', () => {
  const input = { length: 355, breadth: 385, height: 160 }
  assert.equal(calculateBlankSize({ ...input, ply: 3 }).cutLengthCm.toFixed(2), '153.00')
  const fivePly = calculateBlankSize({ ...input, ply: 5 })
  assert.equal(fivePly.deckleSizeCm.toFixed(2), '56.50')
  assert.equal(fivePly.cutLengthCm.toFixed(2), '154.20')
})
