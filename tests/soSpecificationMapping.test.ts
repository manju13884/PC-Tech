import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('SO Specification Mapping follows customer, Sales Order, display flow', async () => {
  const [component, dashboard, api, migration, childMigration, childQuantityMigration] = await Promise.all([
    readFile('src/features/so-specification-mapping/SoSpecificationMapping.tsx', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('functions/api/so-specification-mappings.ts', 'utf8'),
    readFile('migrations/0021_create_so_specification_mappings.sql', 'utf8'),
    readFile('migrations/0034_add_so_line_child_specifications.sql', 'utf8'),
    readFile('migrations/0035_add_so_line_child_quantity.sql', 'utf8'),
  ])

  assert.match(component, /getCustomers\(\)/)
  assert.match(component, /getSalesOrdersByCustomer\(customerId\)/)
  assert.match(component, /orders\.filter\(isMappableSalesOrder\)/)
  assert.match(component, /new Set\(\['closed', 'void', 'voided', 'invoiced'\]\)/)
  assert.match(component, /match\(\/\[a-z\]\+\/g\)/)
  assert.match(component, /getSalesOrderById\(salesOrderId\)/)
  assert.match(component, /Sales Order Number/)
  assert.match(component, /detail\.line_items\.map/)
  assert.match(component, /customer_id: customerId/)
  assert.match(component, /Product Specification/)
  assert.match(component, /specifications\.map/)
  assert.match(component, /allItemsMapped/)
  assert.match(component, /Save Mapping/)
  assert.match(component, /lineItemId: line\.line_item_id/)
  assert.match(component, /additionalSpecifications/)
  assert.match(component, /Add Additional Product/)
  assert.match(component, /Quantity for additional product/)
  assert.match(component, /String\(mainQuantity\)/)
  assert.match(component, /additionalProductsValid/)
  assert.match(component, /enter Qty greater than zero/)
  assert.match(component, /setSpecificationError\(''\)/)
  assert.match(component, /Primary product/)
  assert.match(component, /Additional product/)
  assert.match(api, /mandatory for every Sales Order item/)
  assert.match(api, /getZohoSalesOrderById/)
  assert.match(api, /Sales Order \$\{salesOrder\.salesorder_number\} is \$\{salesOrder\.status\} and cannot be mapped/)
  assert.match(api, /ON CONFLICT\(sales_order_id, sales_order_line_item_id\) DO UPDATE/)
  assert.match(api, /SELECT id, customer_name FROM product_specification_records/)
  assert.doesNotMatch(api, /SELECT customer_name FROM customer_cache/)
  assert.match(component, /Unable to save mappings \(\$\{response\.status\}\)/)
  assert.match(component, /readApiPayload/)
  assert.match(component, /Local PC-Tech backend is not running/)
  assert.doesNotMatch(component, /const payload = await response\.json\(\)/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS so_specification_mappings/)
  assert.match(childMigration, /CREATE TABLE IF NOT EXISTS so_line_child_specifications/)
  assert.match(childMigration, /is_active INTEGER NOT NULL DEFAULT 1/)
  assert.match(childQuantityMigration, /ADD COLUMN quantity REAL NOT NULL DEFAULT 0/)
  assert.match(api, /UPDATE so_line_child_specifications[\s\S]*SET is_active = 0/)
  assert.match(api, /ON CONFLICT\(sales_order_id, sales_order_line_item_id, product_specification_id\) DO UPDATE/)
  assert.match(api, /quantity greater than zero/)
  assert.match(api, /SELECT sales_order_line_item_id, product_specification_id, quantity[\s\S]*FROM so_line_child_specifications/)
  assert.doesNotMatch(api, /SELECT sales_order_line_item_id, product_specification_id, quantity[\s\S]*FROM so_specification_mappings/)
  assert.doesNotMatch(`${api}\n${migration}\n${childMigration}\n${childQuantityMigration}`, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(dashboard, /selectedItem\.key === 'so-specification-mapping'/)
  const documentPageClass = dashboard.match(/<div className=\{`dashboard-card([\s\S]*?)document-form-page/)?.[1] ?? ''
  for (const menuKey of ['product-specifications', 'so-specification-mapping', 'production-planned', 'job-cards']) {
    assert.match(documentPageClass, new RegExp(`selectedItem\\.key === '${menuKey}'`))
  }
})
