PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coa_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  coa_data_json TEXT NOT NULL,
  generated_by_user_id INTEGER NOT NULL,
  generated_by_user_name TEXT NOT NULL,
  generated_by_user_email TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER,
  updated_by_user_name TEXT,
  updated_by_user_email TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (customer_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_coa_records_customer_id
  ON coa_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_coa_records_invoice_id
  ON coa_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_coa_records_generated_at
  ON coa_records(generated_at);
