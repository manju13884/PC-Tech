import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { formatLayerGsm } from '../src/features/production-planning/paperLayerDisplay.ts'

test('GSM display abbreviates only known shades without changing the source layer', () => {
  for (const [shade, expected] of [['GYT', '120 G'], [' gyt ', '120 G'], ['Natural', '120 N'], ['NATURAL', '120 N'], ['natural', '120 N'], ['', '120'], [' ', '120'], ['Kraft', '120']] as const) {
    const layer = Object.freeze({ gsm: 120, shade })
    assert.equal(formatLayerGsm(layer), expected)
    assert.equal(layer.gsm, 120)
    assert.equal(layer.shade, shade)
  }
  assert.equal(formatLayerGsm({ gsm: '120' }), '120')
  assert.equal(formatLayerGsm({ gsm: '120', shade: null }), '120')
  assert.equal(formatLayerGsm(undefined), '—')
  assert.equal(formatLayerGsm({ shade: 'Natural' }), '—')
  assert.equal(formatLayerGsm({ gsm: '', shade: 'GYT' }), '—')
})

test('mixed layer shades remain distinct for 3, 5 and 7 ply specifications', () => {
  const layers = [
    { gsm: 150, shade: 'GYT' },
    { gsm: 120, shade: 'Natural' },
    { gsm: 120, shade: 'GYT' },
    { gsm: 140, shade: '' },
    { gsm: 150, shade: 'natural' },
    { gsm: 180, shade: 'gyt' },
    { gsm: 180, shade: 'Natural' },
  ]
  const expected = ['150 G', '120 N', '120 G', '140', '150 N', '180 G', '180 N']
  for (const ply of [3, 5, 7]) {
    const applicable = layers.slice(0, ply)
    assert.deepEqual(Array.from({ length: 7 }, (_, index) => formatLayerGsm(applicable[index])),
      [...expected.slice(0, ply), ...Array(7 - ply).fill('—')])
  }
})

test('both production grids format each existing GSM column using its own layer', async () => {
  for (const path of ['src/features/production-planning/ProductionPlanning.tsx', 'src/features/production-planned/ProductionPlanned.tsx']) {
    const source = await readFile(path, 'utf8')
    for (const label of ['Top', 'B Flute', 'B Liner', 'A Flute', 'A Liner', 'C Flute', 'C Liner']) {
      assert.ok(source.includes(`<th>${label} GSM (G/N)</th>`))
    }
    for (const layer of ['top', 'bFlute', 'bLiner', 'aFlute', 'aLiner', 'cFlute', 'cLiner']) {
      assert.ok(source.includes(`{formatLayerGsm(${layer})}`))
    }
  }
  const api = await readFile('functions/api/production-plans.ts', 'utf8')
  assert.match(api, /spec\.attributes_json/)
  assert.match(api, /spec\.id = line\.approved_specification_revision_id/)
})
