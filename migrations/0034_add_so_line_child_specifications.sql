PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS so_line_child_specifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_order_id TEXT NOT NULL,
  sales_order_line_item_id TEXT NOT NULL,
  product_specification_id INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id INTEGER NOT NULL,
  updated_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sales_order_id, sales_order_line_item_id, product_specification_id),
  FOREIGN KEY (product_specification_id) REFERENCES product_specification_records(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_so_line_child_specifications_line
  ON so_line_child_specifications(sales_order_id, sales_order_line_item_id, is_active);
CREATE INDEX IF NOT EXISTS idx_so_line_child_specifications_product_specification
  ON so_line_child_specifications(product_specification_id, is_active);
