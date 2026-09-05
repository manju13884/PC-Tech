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
  assert.match(api, /WHERE customer_id = \?/)
  assert.match(api, /'so-specification-mapping'/)
})

test('product form supports item-aware dimensions, GSM, BF and print controls', async () => {
  const [component, styles, api] = await Promise.all([
    readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8'),
    readFile('src/features/product-specifications/product-specifications.css', 'utf8'),
    readFile('functions/api/product-specifications.ts', 'utf8'),
  ])
  for (const field of ['length_mm', 'width_mm', 'height_mm', 'gsm', 'bf', 'print_required']) {
    assert.match(component, new RegExp(field))
  }
  assert.match(component, /detectType/)
  for (const ply of [2, 3, 5, 7, 9]) assert.match(component, new RegExp(`'${ply}'`))
  assert.match(component, /Paper Composition/)
  assert.match(component, /attributes\.paper_layers\.length > 0 \? attributes\.paper_layers : buildPaperLayers\(savedPly, \[\]\)/)
  assert.match(component, /Select Ply above to enter paper composition\./)
  assert.match(component, /Deckle Size/)
  assert.match(component, /width \+ height \+ 20/)
  assert.match(component, /deckleMm \/ 10/)
  for (const calculatedField of ['Rotary Size', 'Sheet Size', 'Box Weight', 'Board GSM', '>BS<', 'Moisture']) {
    assert.match(component, new RegExp(calculatedField))
  }
  assert.match(component, /Lab test required/)
  assert.match(component, /sheetAreaSqM \* boardGsm \* 1\.05/)
  assert.match(component, /2 \* length.*2 \* width.*\+ 50 =/)
  assert.match(component, /deckleMm \/ 10.*rotaryMm \/ 10/)
  assert.match(component, /Sheet Size \(Deckle × Rotary\)/)
  assert.match(component, /Production Stages/)
  assert.match(component, /Board Type/)
  assert.match(component, /Plant Board/)
  assert.match(component, /Manual Board/)
  assert.match(api, /'board_type'/)
  assert.match(component, /<dt>Design Type<\/dt>.*<dt>Board Type<\/dt>/)
  assert.ok(component.indexOf('paper-composition') < component.indexOf('<strong>Production Stages<\/strong>'))
  assert.match(component, /defaultProductionStages/)
  for (const stage of ['Paper Cutting', 'Corrugation', 'Pasting', 'Board \/ Sheet Cutting', 'Printing', 'RS4', 'Creasing', 'Slotting', 'Die Cutting', 'Stitching \/ Gluing', 'Quality Inspection', 'Bundling \/ Packing']) {
    assert.match(component, new RegExp(stage))
  }
  assert.match(component, /Product Specification Report/)
  assert.match(component, /Box Dimension Drawing \(Isometric Projection\)/)
  assert.match(component, /product-spec-box-preview/)
  assert.match(component, /Generated from the Length, Width and Height above\./)
  assert.match(component, /IsometricBoxDrawing length=\{form\.length_mm\} width=\{form\.width_mm\} height=\{form\.height_mm\}/)
  assert.match(component, /SHEET SIZE/)
  assert.match(component, /DECKLE × ROTARY/)
  assert.match(component, /sheetDimension/)
  assert.match(component, /rotaryFormula/)
  assert.match(component, /deckleFormula/)
  assert.ok(component.indexOf('<h2>Production Stages</h2>') < component.indexOf('<h2>Box Dimension Drawing (Isometric Projection)</h2>'))
  assert.match(component, />PRODUCT SPECIFICATION<\/p>/)
  assert.match(component, /Polar Canvas Item Code : \{form\.polar_canvas_item_code\}/)
  assert.match(component, /Created DateTime/)
  assert.match(component, /Updated DateTime/)
  assert.match(component, /formatIstDateTime\(reportSpecification\?\.created_at\)/)
  assert.match(component, /formatIstDateTime\(reportSpecification\?\.updated_at\)/)
  assert.doesNotMatch(component, /Created \/ Updated DateTime/)
  assert.match(component, /Generated by PC-Tech \| Confidential \| Shred Upon Job Completion/)
  assert.doesNotMatch(component, /<dt>Item SKU<\/dt>/)
  assert.match(api, /attributes_json, created_at, updated_at/)
  assert.doesNotMatch(component, />PRODUCT SPECIFICATION REPORT<\/p>/)
  assert.match(component, /product-spec-report-a4/)
  assert.match(styles, /width:210mm/)
  assert.match(styles, /size:A4 portrait/)
  assert.match(styles, /\.spec-report-stages[^}]*font-size:11px/)
  assert.match(styles, /spec-report-details>div:nth-child\(9\).*nth-child\(10\).*grid-column:span 2/)
  assert.match(styles, /\.spec-report-details dd[^}]*white-space:nowrap/)
  assert.match(styles, /nth-child\(3\).*nth-child\(4\).*white-space:nowrap/)
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
  assert.match(styles, /product-spec-technical \.product-spec-grid \{ grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/)
  assert.match(styles, /input\[readonly\]/)
  assert.match(styles, /background:#edf9f1/)
  assert.match(styles, /spec-dimension-input::-webkit-inner-spin-button/)
})

test('product dimensions are explicitly identified as Outer Dimensions', async () => {
  const component = await readFile('src/features/product-specifications/ProductSpecifications.tsx', 'utf8')

  assert.match(component, /Length - OD \(mm\)/)
  assert.match(component, /Width - OD \(mm\)/)
  assert.match(component, /Height - OD \(mm\)/)
  assert.match(component, /Length \(OD\)/)
})
