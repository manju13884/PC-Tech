import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { calculatePartitionSummary, validatePartition } from '../src/features/product-specifications/partitionSpecifications.ts'

test('standard equal-cell partitions calculate cells and divider pieces', () => {
  const result = calculatePartitionSummary({ partitionType: 'Standard Equal Cell', lengthMm: 600, widthMm: 400, heightMm: 150, rows: 3, columns: 4 })
  assert.deepEqual(result, {
    totalCells: 12,
    cellLengthMm: 150,
    cellWidthMm: 133.33,
    longPieces: 2,
    longPieceLengthMm: 600,
    longPieceHeightMm: 150,
    crossPieces: 3,
    crossPieceLengthMm: 400,
    crossPieceHeightMm: 150,
  })
})

test('custom partitions retain manually entered cell dimensions without inventing formulas', () => {
  const result = calculatePartitionSummary({ partitionType: 'Custom', lengthMm: 600, widthMm: 400, heightMm: 150, rows: 2, columns: 5, cellLengthMm: 92.5, cellWidthMm: 81.25 })
  assert.equal(result.totalCells, 10)
  assert.equal(result.cellLengthMm, 92.5)
  assert.equal(result.cellWidthMm, 81.25)
  assert.equal(result.longPieces, null)
  assert.equal(result.crossPieces, null)
})

test('partition validation requires dimensions, whole-number grid counts, and supported ply', () => {
  const valid = { partitionType: 'Standard Equal Cell', lengthMm: '600', widthMm: '400', heightMm: '150', rows: '3', columns: '4', ply: '5', fluteType: 'B' }
  assert.equal(validatePartition(valid), '')
  assert.match(validatePartition({ ...valid, rows: '2.5' }), /positive whole number/)
  assert.match(validatePartition({ ...valid, heightMm: '0' }), /greater than zero/)
  assert.match(validatePartition({ ...valid, ply: '9' }), /3 Ply, 5 Ply, or 7 Ply/)
  assert.match(validatePartition({ ...valid, fluteType: '' }), /Flute \/ Flute Run/)
})

test('partition fields are persisted as isolated attributes and do not use box drawings', async () => {
  const [component, api] = await Promise.all([
    readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8'),
    readFile('functions/api/product-specifications.ts', 'utf8'),
  ])
  assert.match(component, /Corrugated Partitions/)
  assert.match(component, /Partition Configuration/)
  assert.match(component, /partition_rows/)
  assert.match(component, /partition_columns/)
  assert.match(component, /Cell Length \(mm\)/)
  assert.match(component, /Cell Width \(mm\)/)
  assert.match(component, /Partition Construction/)
  assert.match(component, /Partition Ply/)
  assert.match(component, /Flute \/ Flute Run/)
  assert.match(component, /updatePartitionFlute/)
  assert.match(component, /paperLayerDisplayName/)
  assert.match(component, /current\.specification_type === 'PARTITIONS' && current\.flute_type/)
  assert.match(component, /paperLayerDisplayName\(layer\.layer_name, isPartition, form\.flute_type\)\}<\/td>/)
  assert.match(component, /showsBoardFields && !isPartition && <label>Board Type/)
  assert.match(component, /partitionSummary\.cellLengthMm/)
  assert.match(component, /readOnly=\{form\.partition_type === 'Standard Equal Cell'\}/)
  assert.match(component, /showsBoxCalculations = form\.specification_type === 'BOX'/)
  assert.match(component, /form\.specification_type === 'BOX' && <div className="product-spec-box-preview">/)
  assert.match(api, /partition_type/)
  assert.match(api, /cell_length_mm/)
  assert.match(api, /cell_width_mm/)
  assert.match(api, /numbers\.length_mm as number\) \/ \(partitionColumns as number/)
  assert.match(api, /numbers\.width_mm as number\) \/ \(partitionRows as number/)
  assert.match(api, /Partition Rows and Columns must be positive whole numbers/)
  assert.match(api, /isPartition \? \{/)
})
