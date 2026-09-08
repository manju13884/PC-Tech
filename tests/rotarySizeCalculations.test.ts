import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateRotarySize, calculateSlottingSize } from '../src/features/product-specifications/rotarySizeCalculations.ts'

test('Rotary Size uses width, height and selected creasing allowance', () => {
  assert.deepEqual(calculateRotarySize(230, 530, 6), {
    adjustedWidth: 236,
    topFlap: 118,
    bottomFlap: 118,
    rotarySize: 766,
  })
})

test('Rotary Size retains decimal precision and validates required inputs', () => {
  assert.deepEqual(calculateRotarySize(231.5, 530, 6), {
    adjustedWidth: 237.5,
    topFlap: 118.75,
    bottomFlap: 118.75,
    rotarySize: 767.5,
  })
  assert.equal(calculateRotarySize(230, 530, 0), null)
  assert.equal(calculateRotarySize(0, 530, 6), null)
  assert.equal(calculateRotarySize(230, 0, 6), null)
})

test('Slotting Size uses only width and the selected creasing allowance', () => {
  assert.equal(calculateSlottingSize(230, 6), 118)
  assert.equal(calculateSlottingSize(231.5, 6), 118.75)
  assert.equal(calculateSlottingSize(230, 0), null)
  assert.equal(calculateSlottingSize(0, 6), null)
})
