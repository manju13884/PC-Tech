import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canSelectReel, filterReels, reelFilterOptions, sortReels } from '../src/features/job-tracking/reelSelection.ts'

const reel = { inventory_stock_id: 1, material_no: 'PCM-0001', reel_number: '01245', gsm: 120, bf: 16, reel_size_cm: 62, available_weight: 838, shade: 'GYT', paper_type: 'Kraft', vendor_name: 'Sample Paper Mills', purchase_order_number: 'PO-001' }

test('reel filters combine exact numeric criteria with case-insensitive text and general search', () => {
  const reels = [reel, { ...reel, inventory_stock_id: 2, reel_number: '01246', gsm: 150 }, { ...reel, inventory_stock_id: 3, bf: null }]
  assert.deepEqual(filterReels(reels, { gsm: '120', bf: '16', reel_size_cm: '62.0', shade: ' gyt ', paper_type: 'kraft' }), [reel])
  for (const search of ['01245', 'sample paper', 'po-001', 'kraft', 'PCM-0001']) assert.ok(filterReels(reels, { search }).includes(reel))
  assert.equal(filterReels(reels, { gsm: '12' }).length, 0)
  assert.equal(filterReels(reels, { bf: '0' }).length, 0)
  assert.equal(filterReels(reels, { search: 'no match' }).length, 0)
  assert.equal(filterReels(reels, {}).length, 3)
})

test('zero stock and reservations for other assignments cannot be selected', () => {
  assert.equal(canSelectReel(reel, 0, 'Corrugation', 1), true)
  assert.equal(canSelectReel({ ...reel, available_weight: 0 }, 1, 'Corrugation', 1), false)
  const reserved = { ...reel, reserved_job_card_id: 5, reserved_process_name: 'Corrugation', reserved_reel_slot: 1, reel_status: 'Reserved' as const }
  assert.equal(canSelectReel(reserved, 0, 'Corrugation', 1), false)
  assert.equal(canSelectReel(reserved, 1, 'Corrugation', 1), true)
  assert.equal(canSelectReel(reserved, 1, 'Paper Cutting', 1), false)
  assert.equal(canSelectReel(reserved, 1, 'Corrugation', 2), false)
})

test('sorting is numeric, stable and does not mutate inventory', () => {
  const reels = [reel, { ...reel, inventory_stock_id: 2, reel_number: '9', available_weight: 1000, bf: null }]
  assert.equal(sortReels(reels, 'reel_number', true)[0].reel_number, '9')
  assert.equal(sortReels(reels, 'available_weight', false)[0].available_weight, 1000)
  assert.equal(sortReels(reels, 'bf', false)[1].bf, null)
  assert.equal(reels[0], reel)
})

test('minimum current available weight combines with specifications and clears cleanly', () => {
  const reels = [reel, { ...reel, inventory_stock_id: 2, available_weight: 425 }, { ...reel, inventory_stock_id: 3, available_weight: 500 }]
  assert.deepEqual(filterReels(reels, { gsm: '120', bf: '16', reel_size_cm: '62', shade: 'GYT', min_available_weight: '500' }).map(r => r.available_weight), [838, 500])
  assert.equal(filterReels(reels, { min_available_weight: '838.01' }).length, 0)
  assert.equal(filterReels(reels, { min_available_weight: '' }).length, 3)
  assert.equal(filterReels(reels, { min_available_weight: '-1' }).length, 0)
  assert.equal(filterReels(reels, { min_available_weight: 'invalid' }).length, 0)
  assert.deepEqual(sortReels(reels, 'available_weight', true).map(r => r.available_weight), [425, 500, 838])
  assert.deepEqual(sortReels(reels, 'available_weight', false).map(r => r.available_weight), [838, 500, 425])
})

test('filter options come from inventory and shade selection matches exactly', () => {
  const reels = [reel, { ...reel, gsm: 90, shade: ' gyt ' }, { ...reel, gsm: 150, shade: 'Natural' }, { ...reel, shade: null, bf: null }]
  assert.deepEqual(reelFilterOptions(reels, 'gsm'), ['90', '120', '150'])
  assert.deepEqual(reelFilterOptions(reels, 'bf'), ['16'])
  assert.deepEqual(reelFilterOptions(reels, 'shade'), ['GYT', 'Natural'])
  assert.equal(filterReels(reels, { shade: 'gyt' }).length, 2)
  assert.equal(filterReels(reels, { shade: 'nat' }).length, 0)
  assert.equal(sortReels(reels, 'shade', false)[0].shade, 'Natural')
})

test('picker reuses inventory metadata and the existing reel assignment handler', async () => {
  const api = await readFile('functions/api/job-tracking.ts', 'utf8')
  const card = await readFile('src/features/job-cards/JobCards.tsx', 'utf8')
  assert.match(api, /stock\.paper_type, stock\.color AS shade, stock\.vendor_name, stock\.purchase_order_number/)
  assert.match(api, /WHERE stock\.status = 'Available' AND stock\.reel_weight_kg > 0/)
  assert.match(card, /onSelect=\{\(inventoryStockId\) => onReelSelect\?\.\(stage, slot, inventoryStockId\)\}/)
  assert.doesNotMatch(card, /<select[^>]*job-card-reel-select/)
  const tracking = await readFile('src/features/job-tracking/JobTracking.tsx', 'utf8')
  const picker = await readFile('src/features/job-tracking/ReelSelector.tsx', 'utf8')
  assert.match(tracking, /onReelSelect=\{\(processName, reelSlot, inventoryStockId\) => updateReel/)
  assert.match(tracking, /setInventoryReels\(latest\.reels\)/)
  assert.match(picker, /await onSelect\(id\)\s+onClose\(\)/)
  assert.match(picker, /role="alert"/)
})
