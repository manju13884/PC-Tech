import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

test('Inventory provides the consolidated ERP menu and material receipt workflow', async () => {
  const [dashboard, pages, accessApi, zohoService, vendorsApi, purchaseOrdersApi, purchaseOrderItemsApi, recordsApi, procurementLibrary, vendorCache, homeDashboardApi] = await Promise.all([
    readFile('src/Dashboard.tsx', 'utf8'),
    readFile('src/features/inventory/InventoryPages.tsx', 'utf8'),
    readFile('functions/api/auth/access.ts', 'utf8'),
    readFile('src/features/inventory/inventoryZohoService.ts', 'utf8'),
    readFile('functions/api/inventory-vendors.ts', 'utf8'),
    readFile('functions/api/inventory-purchase-orders.ts', 'utf8'),
    readFile('functions/api/inventory-purchase-order-items.ts', 'utf8'),
    readFile('functions/api/material-inventory-records.ts', 'utf8'),
    readFile('lib/inventoryProcurement.ts', 'utf8'),
    readFile('lib/vendorCache.ts', 'utf8'),
    readFile('functions/api/home-sales-orders.ts', 'utf8'),
  ])

  assert.match(dashboard, /title: 'Inventory'/)
  for (const key of ['material-inventory', 'material-stock', 'material-issue-return', 'stock-adjustment', 'stock-report', 'inventory-transactions']) {
    assert.equal((dashboard.match(new RegExp(`key: '${key}'`, 'g')) ?? []).length, 1)
    assert.match(dashboard, new RegExp(`selectedItem\\.key === '${key}'`))
  }
  assert.match(dashboard, /userRole === 'SUPERADMIN' \? menuItems\.map/)
  assert.match(dashboard, /const accessMatrix: AccessMatrixItem\[] = menuGroups\.flatMap/)
  assert.match(dashboard, /disabled=\{isProtectedSuperadminAccess/)
  assert.match(accessApi, /ensureSuperadminMenuAccess\(context\.env\.DB, url\.searchParams\.getAll\('menu_key'\)\)/)
  assert.match(pages, /const materialOptions = \['Paper'\] as const/)
  assert.match(pages, /Material <b aria-label="required">\*<\/b>/)
  assert.match(pages, /Select Material/)
  assert.match(pages, /export \{ default as StockAdjustment \} from '\.\/StockAdjustment'/)
  assert.match(dashboard, /title: 'Material Receipt'/)
  assert.match(dashboard, /title: 'Material Stock'/)
  assert.match(dashboard, /title: 'Material Issue'/)
  assert.match(dashboard, /title: 'Stock Ledger'/)
  assert.doesNotMatch(dashboard, /title: 'Inventory Transactions'/)
  assert.match(pages, /material === 'Paper'/)
  assert.match(pages, /Paper Details/)
  assert.match(pages, /Capture material details against the selected Zoho Books purchase order\./)
  for (const field of ['Paper Type', 'Reel Size (cm)', 'Color', 'GSM', 'BF', 'PO Number', 'Supplied Vendor', 'Reel Number', 'Reel Weight (Kg)', 'Status']) {
    assert.ok(pages.includes(field), `${field} field is missing`)
  }
  for (const option of ['Kraft Paper', 'White Paper', 'Duplex Grey Back', 'GYT', 'Natural', 'White', 'Available', 'Hold']) {
    assert.match(pages, new RegExp(`'${option}'`))
  }
  assert.match(pages, /Number\(details\.reelSizeCm\) > 0/)
  assert.match(pages, /Number\(details\.gsm\) > 0/)
  assert.match(pages, /details\.bf && !\(Number\(details\.bf\) > 0\)/)
  assert.match(pages, /details\.reelNumber\.trim\(\)/)
  assert.match(pages, /Number\(details\.reelWeightKg\) > 0/)
  assert.match(pages, /Auto-generated on save/)
  assert.match(pages, /saveMaterialInventoryRecord/)
  assert.match(pages, /Material Inventory saved successfully as/)
  assert.doesNotMatch(pages, /fetch\(|\/api\//)
  assert.doesNotMatch(pages, /Stock Quantity|Received Quantity/)
  const paperTypePosition = pages.indexOf('<span>Paper Type')
  const vendorPosition = pages.indexOf('<span>Supplied Vendor')
  const poNumberPosition = pages.indexOf('<span>PO Number')
  const reelSizePosition = pages.indexOf('<span>Reel Size')
  assert.ok(paperTypePosition < vendorPosition && vendorPosition < poNumberPosition && poNumberPosition < reelSizePosition)
  assert.equal((pages.match(/<span>Supplied Vendor/g) ?? []).length, 1)
  assert.equal((pages.match(/<span>PO Number/g) ?? []).length, 1)
  assert.match(pages, /getInventoryVendors\(/)
  assert.match(pages, /Vendor loading timed out|loadVendors/)
  assert.match(pages, />Retry</)
  assert.match(pages, /getInventoryPurchaseOrders\(vendorId\)/)
  assert.match(pages, /getInventoryPurchaseOrderItems\(purchaseOrderId\)/)
  assert.match(pages, /PO Item &amp; Description/)
  assert.match(pages, /<span>PO Qty<\/span>/)
  assert.match(pages, /inventory-label-note">\(As per Vendor Invoice\)<\/em>/)
  assert.match(pages, /Select Supplied Vendor/)
  assert.match(pages, /Select Vendor first/)
  assert.match(zohoService, /\/api\/inventory-vendors/)
  assert.match(zohoService, /VENDOR_REQUEST_TIMEOUT_MS/)
  assert.match(zohoService, /\/api\/inventory-purchase-orders/)
  assert.match(zohoService, /\/api\/inventory-purchase-order-items/)
  assert.match(vendorsApi, /getAuthenticatedUser/)
  assert.match(vendorsApi, /from '\.\.\/lib\/authenticatedUser'/)
  assert.match(vendorsApi, /menu_key = 'material-inventory'/)
  assert.match(vendorsApi, /getCachedVendors/)
  assert.match(vendorsApi, /refreshVendorCache/)
  assert.match(vendorsApi, /SUPERADMIN access required/)
  assert.match(purchaseOrdersApi, /getAuthenticatedUser/)
  assert.match(purchaseOrdersApi, /from '\.\.\/lib\/authenticatedUser'/)
  assert.match(purchaseOrdersApi, /ZohoBooks\.purchaseorders\.READ/)
  assert.match(purchaseOrderItemsApi, /getZohoInventoryPurchaseOrderItems/)
  assert.match(recordsApi, /INSERT INTO material_inventory_records/)
  assert.match(recordsApi, /SELECT id, material_no, created_at FROM material_inventory_records/)
  assert.match(procurementLibrary, /\/contacts\?contact_type=vendor/)
  assert.match(procurementLibrary, /\/purchaseorders\?/)
  assert.match(procurementLibrary, /\/purchaseorders\/\$\{encodeURIComponent\(normalizedId\)\}/)
  assert.match(procurementLibrary, /quantity: Number\.isFinite\(quantity\) \? quantity : 0/)
  assert.match(vendorCache, /isCurrentDailyCustomerCache/)
  assert.match(vendorCache, /INSERT INTO vendor_cache/)
  assert.match(homeDashboardApi, /getCachedVendors\(context\.env\)/)
  assert.match(dashboard, /<strong>Vendor Details<\/strong>/)
  assert.match(dashboard, /refreshInventoryVendors\(\)/)
  assert.doesNotMatch(`${vendorsApi}\n${purchaseOrdersApi}\n${procurementLibrary}`, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i)
})

test('Material Inventory uses additive persistence/cache migrations and Job Card modules remain available', async () => {
  const [migrations, jobCards, jobTracking] = await Promise.all([
    readdir('migrations'),
    readFile('src/features/job-cards/JobCards.tsx', 'utf8'),
    readFile('src/features/job-tracking/JobTracking.tsx', 'utf8'),
  ])

  assert.ok(migrations.filter((name) => name.endsWith('.sql')).length >= 38)
  assert.ok(migrations.includes('0036_create_material_inventory_records.sql'))
  assert.ok(migrations.includes('0037_create_vendor_cache.sql'))
  assert.match(jobCards, /Job Card/)
  assert.match(jobTracking, /Job Tracking/)
})
