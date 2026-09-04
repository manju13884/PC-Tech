PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS so_specification_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id TEXT NOT NULL,
  sales_order_number TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  sales_order_line_item_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  product_specification_id INTEGER NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  updated_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sales_order_id, sales_order_line_item_id),
  FOREIGN KEY (product_specification_id) REFERENCES product_specification_records(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_so_specification_mappings_sales_order
  ON so_specification_mappings(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_so_specification_mappings_customer
  ON so_specification_mappings(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_specification_mappings_product_specification
  ON so_specification_mappings(product_specification_id);
