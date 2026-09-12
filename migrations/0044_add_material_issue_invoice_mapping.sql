ALTER TABLE inventory_material_issues ADD COLUMN zoho_invoice_id TEXT;

ALTER TABLE inventory_stock_ledger ADD COLUMN zoho_customer_id TEXT;
ALTER TABLE inventory_stock_ledger ADD COLUMN customer_name TEXT;
ALTER TABLE inventory_stock_ledger ADD COLUMN zoho_invoice_id TEXT;
ALTER TABLE inventory_stock_ledger ADD COLUMN invoice_number TEXT;

CREATE INDEX IF NOT EXISTS idx_material_issues_invoice
  ON inventory_material_issues(zoho_invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_invoice
  ON inventory_stock_ledger(zoho_invoice_id);
