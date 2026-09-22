import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { formatLayerGsm } from '../src/features/production-planning/paperLayerDisplay.ts'
import { isTwoPlyRoll, twoPlyRollLayerName, twoPlyRollLayers } from '../src/features/production-planning/twoPlyRollComposition.ts'

test('2 Ply Rolls use exactly the mapped Top and Flute specification layers', () => {
  const layers = [
    { layer_name: 'Liner', gsm: '120', bf_rct: '16', shade: 'GYT', flute: '' },
    { layer_name: 'Fluting', gsm: '120', bf_rct: '16', shade: 'Natural', flute: '' },
  ]
  assert.equal(isTwoPlyRoll('2 Ply Rolls'), true)
  assert.equal(isTwoPlyRoll('Corrugated Box'), false)
  assert.deepEqual(twoPlyRollLayers(layers), { top: layers[0], flute: layers[1] })
  assert.equal(twoPlyRollLayerName(layers[0].layer_name, true), 'Top')
  assert.equal(twoPlyRollLayerName(layers[1].layer_name, true), 'Flute')
  assert.equal(formatLayerGsm(layers[0]), '120 G')
  assert.equal(formatLayerGsm(layers[1]), '120 N')
})

test('mixed Production Planning rows isolate 2 Ply Rolls without changing other layer lookup', async () => {
  const [specifications, planning, planned, planningStyles, prepareApi, plansApi] = await Promise.all([
    readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8'),
    readFile('src/features/production-planning/ProductionPlanning.tsx', 'utf8'),
    readFile('src/features/production-planned/ProductionPlanned.tsx', 'utf8'),
    readFile('src/features/production-planning/production-planning.css', 'utf8'),
    readFile('functions/api/production-planning/prepare.ts', 'utf8'),
    readFile('functions/api/production-plans.ts', 'utf8'),
  ])
  assert.match(specifications, /selectedIsTwoPlyRoll \? \{ ply: '2', paper_layers: buildPaperLayers\('2', \[\]\) \}/)
  assert.match(specifications, /showsPaperComposition = showsBoardFields \|\| twoPlyRoll/)
  for (const source of [planning, planned]) {
    assert.match(source, /twoPlyRollLayers\(layers\)/)
    assert.match(source, /twoPlyRoll \? rollLayers\.flute/)
    assert.match(source, /twoPlyRoll \? undefined : linerAfterFlute/)
    assert.match(source, /className="two-ply-roll-composition"/)
    assert.match(source, /<b>Top GSM<\/b>/)
    assert.match(source, /<b>Flute GSM<\/b>/)
  }
  assert.match(planningStyles, /\.two-ply-roll-composition span\{[^}]*flex-direction:column[^}]*overflow:hidden/)
  assert.match(prepareApi, /spec\.attributes_json/)
  assert.match(prepareApi, /specificationAttributes: attributes/)
  assert.match(plansApi, /spec\.id = line\.approved_specification_revision_id/)
  assert.doesNotMatch(plansApi, /INSERT INTO[^;]*paper_layers/is)
})
