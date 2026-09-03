PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_specification_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_specification_id INTEGER UNIQUE,
  specification_name TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  specification_type TEXT NOT NULL DEFAULT 'GENERAL',
  length_mm REAL,
  width_mm REAL,
  height_mm REAL,
  ply INTEGER,
  gsm REAL,
  bf REAL,
  print_required INTEGER NOT NULL DEFAULT 0 CHECK (print_required IN (0, 1)),
  print_colors TEXT,
  notes TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER NOT NULL,
  updated_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO product_specification_records (
  legacy_specification_id, specification_name, customer_id, customer_name,
  item_id, item_name, item_sku, specification_type, length_mm, width_mm,
  height_mm, ply, gsm, bf, print_required, print_colors, notes, attributes_json,
  created_by_user_id, updated_by_user_id, created_at, updated_at
)
SELECT
  id, 'Specification 1', customer_id, customer_name,
  item_id, item_name, item_sku, specification_type, length_mm, width_mm,
  height_mm, ply, gsm, bf, print_required, print_colors, notes, attributes_json,
  created_by_user_id, updated_by_user_id, created_at, updated_at
FROM product_specifications;

CREATE INDEX IF NOT EXISTS idx_product_spec_records_customer
  ON product_specification_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_spec_records_item
  ON product_specification_records(item_id);
CREATE INDEX IF NOT EXISTS idx_product_spec_records_customer_item
  ON product_specification_records(customer_id, item_id);
