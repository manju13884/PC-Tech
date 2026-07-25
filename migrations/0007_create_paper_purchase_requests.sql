PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paper_purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  sales_order_id TEXT NOT NULL UNIQUE,
  sales_order_number TEXT NOT NULL,
  request_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (request_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  requested_by_user_id INTEGER NOT NULL,
  requested_by_name TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_user_id INTEGER,
  approved_by_name TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_purchase_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_request_id INTEGER NOT NULL,
  sales_order_item_id TEXT,
  item_id TEXT,
  item_name TEXT NOT NULL,
  item_description TEXT,
  ordered_quantity REAL,
  is_paper_eligible INTEGER NOT NULL DEFAULT 0 CHECK (is_paper_eligible IN (0, 1)),
  item_type TEXT NOT NULL CHECK (item_type IN ('BOX', 'BOARD', 'SHEET', 'NON_ELIGIBLE')),
  length_mm REAL,
  breadth_mm REAL,
  height_mm REAL,
  box_ply INTEGER,
  calculation_quantity REAL,
  wastage_percent REAL,
  area_sq_m REAL,
  size_cm REAL,
  deckle_cm REAL,
  total_base_weight_kg REAL,
  total_wastage_weight_kg REAL,
  total_paper_requirement_kg REAL,
  total_paper_cost REAL,
  paper_cost_per_unit REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_request_id) REFERENCES paper_purchase_requests(id),
  UNIQUE (paper_request_id, sales_order_item_id)
);

CREATE TABLE IF NOT EXISTS paper_purchase_request_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_request_item_id INTEGER NOT NULL,
  layer_key TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  paper_type TEXT,
  gsm REAL,
  bf REAL,
  deckle_cm REAL,
  cut_length_cm REAL,
  sheet_quantity REAL,
  paper_weight_kg REAL,
  wastage_factor REAL,
  total_paper_weight_kg REAL,
  paper_rate REAL,
  total_paper_cost REAL,
  draw_ratio REAL,
  wastage_weight_kg REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_request_item_id) REFERENCES paper_purchase_request_items(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_purchase_requests_sales_order_id
  ON paper_purchase_requests(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_paper_purchase_requests_sales_order_number
  ON paper_purchase_requests(sales_order_number);
CREATE INDEX IF NOT EXISTS idx_paper_purchase_requests_customer_id
  ON paper_purchase_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_paper_purchase_requests_status
  ON paper_purchase_requests(request_status);
CREATE INDEX IF NOT EXISTS idx_paper_purchase_request_items_request_id
  ON paper_purchase_request_items(paper_request_id);
CREATE INDEX IF NOT EXISTS idx_paper_purchase_request_layers_item_id
  ON paper_purchase_request_layers(paper_request_item_id);
