import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Material Issue is an additive, ledger-controlled stock-out workflow', async () => {
  const [migration,invoiceMigration,api,component,dashboard,report,ledger,invoices]=await Promise.all([
    readFile('migrations/0043_create_material_issues.sql','utf8'),
    readFile('migrations/0044_add_material_issue_invoice_mapping.sql','utf8'),
    readFile('functions/api/material-issues.ts','utf8'),
    readFile('src/features/inventory/MaterialIssue.tsx','utf8'),
    readFile('src/Dashboard.tsx','utf8'),
    readFile('functions/api/stock-report.ts','utf8'),
    readFile('src/features/inventory/StockLedger.tsx','utf8'),
    readFile('lib/invoices.ts','utf8'),
  ])
  assert.doesNotMatch(migration,/\b(?:DELETE|DROP|TRUNCATE|REPLACE)\b/i)
  assert.match(migration,/CREATE TABLE IF NOT EXISTS inventory_material_issues/)
  assert.match(migration,/status TEXT NOT NULL DEFAULT 'DRAFT'/)
  assert.match(migration,/UNIQUE \(reference_type, reference_id\)|reference_type = 'MATERIAL_ISSUE'/)
  assert.match(migration,/trg_material_issue_ledger_validate/)
  assert.match(migration,/stock_balance_changed/)
  assert.match(migration,/reel_is_reserved/)
  assert.match(migration,/trg_material_issue_ledger_apply/)
  assert.doesNotMatch(invoiceMigration,/\b(?:DELETE|DROP|TRUNCATE|REPLACE|UPDATE)\b/i)
  assert.match(invoiceMigration,/ADD COLUMN zoho_invoice_id TEXT/)
  assert.doesNotMatch(invoiceMigration,/UNIQUE[\s\S]*zoho_invoice_id/i)
  assert.match(api,/menu_key='material-issue-return'/)
  assert.match(api,/cache_key='active-customers'/)
  assert.match(api,/getZohoCustomers\(env\)/)
  assert.match(api,/ON CONFLICT\(cache_key\) DO UPDATE/)
  assert.match(api,/NOT EXISTS\(SELECT 1 FROM inventory_reel_reservations/)
  assert.match(api,/VALUES \('MATERIAL_ISSUE','MATERIAL_ISSUE'/)
  assert.match(api,/if \(issue\.status === 'COMPLETED'\)/)
  assert.match(api,/Available stock has changed\. Current available stock is/)
  assert.match(api,/db\.batch\(\[/)
  assert.match(api,/getZohoInvoiceById/)
  assert.match(api,/invoice\.customer_id!==customerId/)
  assert.match(api,/invoice\.invoice_number!==invoiceNumber/)
  assert.match(api,/\['void','deleted'\]/)
  assert.match(api,/zoho_customer_id,customer_name,zoho_invoice_id,invoice_number/)
  assert.match(component,/Save Draft/)
  assert.match(component,/Complete Issue/)
  assert.match(component,/getInvoicesByCustomer\(form\.zoho_customer_id\)/)
  assert.match(component,/Invoice Number \*/)
  assert.match(component,/disabled=\{!form\.zoho_customer_id\|\|invoicesLoading\}/)
  assert.match(component,/zoho_invoice_id:value/)
  assert.match(component,/zoho_invoice_id:'',invoice_number:''/)
  assert.match(component,/All Customers/)
  assert.doesNotMatch(component,/type="number"/)
  assert.match(dashboard,/key: 'material-issue-return',[\s\S]*title: 'Material Issue'/)
  assert.match(dashboard,/<MaterialIssue \/>/)
  assert.match(report,/transaction_type IN \('Material Issue','MATERIAL_ISSUE'\)/)
  assert.match(ledger,/value="MATERIAL_ISSUE">Material Issue/)
  assert.match(invoices,/!\['void', 'deleted'\]\.includes/)
})
