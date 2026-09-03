import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('product specifications use cached customers and cached Zoho items', async () => {
  const [component, itemsApi, itemsLibrary] = await Promise.all([
    readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8'),
    readFile('functions/api/items.ts', 'utf8'),
    readFile('lib/items.ts', 'utf8'),
  ])
  assert.match(component, /getCustomers\(\)/)
  assert.match(component, /getItems\(\)/)
  assert.match(component, /Promise\.allSettled/)
  assert.match(itemsApi, /FROM item_cache/)
  assert.match(itemsApi, /isCurrentDailyCustomerCache/)
  assert.doesNotMatch(itemsApi, /paper_purchase_request_items|PC-TECH-FALLBACK/)
  assert.match(itemsApi, /ZohoBooks\.settings\.READ/)
  assert.match(itemsApi, /onRequestPost/)
  assert.match(itemsApi, /SUPERADMIN access required/)
  assert.match(itemsLibrary, /zohoGet\(`\/items/)
})

test('product specification persistence supports multiple variants and never deletes data', async () => {
  const [migration, variantMigration, codeMigration, api] = await Promise.all([
    readFile('migrations/0016_create_item_cache_and_product_specifications.sql', 'utf8'),
    readFile('migrations/0018_create_product_specification_records.sql', 'utf8'),
    readFile('migrations/0019_add_polar_canvas_item_code.sql', 'utf8'),
    readFile('functions/api/product-specifications.ts', 'utf8'),
  ])
  assert.match(migration, /CREATE TABLE IF NOT EXISTS item_cache/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS product_specifications/)
  assert.match(variantMigration, /CREATE TABLE IF NOT EXISTS product_specification_records/)
  assert.match(variantMigration, /INSERT OR IGNORE INTO product_specification_records/)
  assert.match(variantMigration, /FROM product_specifications/)
  assert.doesNotMatch(variantMigration, /UNIQUE\s*\(customer_id,\s*item_id\)/i)
  assert.doesNotMatch(api, /ON CONFLICT\(customer_id, item_id\)/)
  assert.match(codeMigration, /'PC-' \|\| printf\('%06d', id\)/)
  assert.match(codeMigration, /CREATE UNIQUE INDEX/)
  assert.doesNotMatch(`${migration}\n${variantMigration}\n${codeMigration}\n${api}`, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
})

test('product form supports item-aware dimensions, GSM, BF and print controls', async () => {
  const component = await readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8')
  for (const field of ['length_mm', 'width_mm', 'height_mm', 'gsm', 'bf', 'print_required']) {
    assert.match(component, new RegExp(field))
  }
  assert.match(component, /detectType/)
  for (const ply of [2, 3, 5, 7, 9]) assert.match(component, new RegExp(`'${ply}'`))
  assert.match(component, /Paper Composition/)
  assert.match(component, /paper_layers/)
  assert.match(component, /Select joint/)
  assert.match(component, /Brass Pinning/)
  assert.match(component, /SS Pinning/)
  assert.match(component, /GI Pinning/)
  assert.match(component, /Select finish/)
  assert.match(component, /Layer-wise/)
  for (const heading of ['Layer Type', 'BF/RCT', 'Shade', 'Paper Grade', 'Flute']) assert.match(component, new RegExp(heading))
  for (const type of ['BOX', 'BOARD \/ SHEET', 'PAPER \/ ROLL', 'TAPE', 'FILM']) {
    assert.match(component, new RegExp(type))
  }
  assert.match(component, /Add Specification/)
  assert.match(component, /Polar Canvas Item Code/)
  assert.match(component, /readOnly/)
  assert.match(component, /padStart\(4, '0'\)/)
  assert.doesNotMatch(component, /Auto-generated on save/)
  assert.doesNotMatch(component, /Specification Exists/)
  assert.match(component, /Saved Specifications/)
  assert.match(component, /specificationSize/)
  assert.match(component, /<th>#<\/th><th>PC Item Code<\/th><th>Item<\/th><th>Size<\/th>/)
  assert.match(component, /Select a customer to display saved specifications/)
  assert.match(component, /All items/)
  assert.match(component, /> Edit</)
  assert.doesNotMatch(component, /No Zoho item description available/)
})
