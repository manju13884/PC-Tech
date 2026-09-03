PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS item_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_by_user_id INTEGER NOT NULL,
  updated_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (customer_id, item_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_product_specifications_customer
  ON product_specifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_specifications_item
  ON product_specifications(item_id);
