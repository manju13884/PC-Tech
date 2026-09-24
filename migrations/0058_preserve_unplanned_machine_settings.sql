CREATE TABLE production_planning_machine_settings (
  sales_order_id TEXT NOT NULL,
  sales_order_line_item_id TEXT NOT NULL,
  flute_run TEXT NOT NULL DEFAULT '',
  ups INTEGER NOT NULL DEFAULT 1 CHECK (ups > 0 AND ups = CAST(ups AS INTEGER)),
  deckle_size TEXT,
  cut_length_cm REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sales_order_id, sales_order_line_item_id)
);
