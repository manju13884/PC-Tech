import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('SO Specification Mapping follows customer, Sales Order, display flow', async () => {
  const [component, dashboard, api, migration] = await Promise.all([
    readFile('src/features/so-specification-mapping/SoSpecificationMapping.tsx', 'utf8'),
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('functions/api/so-specification-mappings.ts', 'utf8'),
    readFile('migrations/0021_create_so_specification_mappings.sql', 'utf8'),
  ])

  assert.match(component, /getCustomers\(\)/)
  assert.match(component, /getSalesOrdersByCustomer\(customerId\)/)
  assert.match(component, /getSalesOrderById\(salesOrderId\)/)
  assert.match(component, /Sales Order Number/)
  assert.match(component, /detail\.line_items\.map/)
  assert.match(component, /customer_id: customerId/)
  assert.match(component, /Product Specification/)
  assert.match(component, /specifications\.map/)
  assert.match(component, /allItemsMapped/)
  assert.match(component, /Save Mapping/)
  assert.match(component, /lineItemId: line\.line_item_id/)
  assert.match(api, /mandatory for every Sales Order item/)
  assert.match(api, /getZohoSalesOrderById/)
  assert.match(api, /ON CONFLICT\(sales_order_id, sales_order_line_item_id\) DO UPDATE/)
  assert.match(api, /SELECT id, customer_name FROM product_specification_records/)
  assert.doesNotMatch(api, /SELECT customer_name FROM customer_cache/)
  assert.match(component, /Unable to save mappings \(\$\{response\.status\}\)/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS so_specification_mappings/)
  assert.doesNotMatch(`${api}\n${migration}`, /\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(dashboard, /selectedItem\.key === 'so-specification-mapping'/)
  assert.match(dashboard, /selectedItem\.key === 'product-specifications' \|\| selectedItem\.key === 'so-specification-mapping' \? ' document-form-page'/)
})
