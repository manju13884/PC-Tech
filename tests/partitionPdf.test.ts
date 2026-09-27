import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPartitionState,
  calculatePartition,
} from '../src/features/partition-calculator/partitionCalculatorEngine.ts'
import { partitionPdfModel } from '../src/features/partition-calculator/partitionPdfModel.ts'
const reference = () => ({
  ...createPartitionState(),
  length: '370',
  width: '340',
  height: '77',
  cellLength: '72',
  cellWidth: '92',
  thickness: '8',
  lengthProjection: '21',
  widthProjection: '16',
  conversionRate: '12',
  pricingPercent: '20',
})
for (const ply of [3, 5, 7] as const)
  for (const commercial of [true, false]) {
    test(`${ply} ply ${commercial ? 'costing' : 'technical'} PDF uses the calculated snapshot`, () => {
      const state = { ...reference(), ply }
      const calculation = calculatePartition(state)
      const model = partitionPdfModel(
        state,
        calculation,
        commercial,
        'Test User <test@example.com>',
        new Date('2026-09-25T19:00:00Z'),
      )
      assert.equal(
        model.filename,
        `Partition_${ply}Ply_370X340X77_20260926.pdf`,
      )
      assert.equal(model.geometry, calculation.geometry)
      assert.equal(model.paperRows.length, ply)
      assert.deepEqual(model.geometry.counts, { length: 4, width: 3 })
      assert.equal(model.geometry.totalCells, 12)
      assert.equal(model.geometry.pieces.total, 9)
      assert.deepEqual(model.geometry.cells, { length: 72, width: 92 })
      assert.equal(model.geometry.slots.depth, 38.5)
      assert.match(model.dimensionChecks[0], /370 mm - MATCH/)
      assert.equal(model.generatedBy, 'Test User <test@example.com>')
      const serialized = JSON.stringify(model)
      if (commercial) {
        assert.match(serialized, /Per KG/)
        assert.match(serialized, /INR 12.00\/KG/)
        assert.match(serialized, /Margin/)
        assert.match(serialized, /Gross profit/)
      } else {
        assert.doesNotMatch(
          serialized,
          /\b(?:INR|rates?|costs?|conversion|margin|markup|selling|profit)\b/i,
        )
        assert.equal(model.paperHeaders.length, 7)
        assert.ok(model.paperRows.every((row) => row.length === 7))
      }
    })
  }
test('PDF requires a complete valid calculation even when costing is excluded', () => {
  for (const state of [
    createPartitionState(),
    { ...reference(), length: '384.4' },
    { ...reference(), slotOverride: '100' },
  ]) {
    assert.throws(() =>
      partitionPdfModel(state, calculatePartition(state), false, 'User'),
    )
  }
  const state = reference()
  state.layers.top.gsm = ''
  assert.throws(() =>
    partitionPdfModel(state, calculatePartition(state), true, 'User'),
  )
})
test('PDF conversion basis, pricing method and overrides reflect current selections', () => {
  for (const basis of ['kg', 'area', 'set'] as const) {
    const state = {
      ...reference(),
      conversionBasis: basis,
      pricingMethod: 'markup' as const,
      slotOverride: '30',
      slotWidthOverride: '9',
    }
    const model = partitionPdfModel(
      state,
      calculatePartition(state),
      true,
      'User',
    )
    assert.match(JSON.stringify(model.sections), /Markup/)
    assert.ok(
      model.sections
        .find((s) => s.title === 'CONVERSION')!
        .rows[0][3].endsWith(
          basis === 'kg' ? '/KG' : basis === 'area' ? '/m2' : '/Set',
        ),
    )
    assert.equal(model.geometry.slots.depth, 30)
    assert.equal(model.geometry.slots.width, 9)
  }
})
