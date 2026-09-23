CREATE TABLE IF NOT EXISTS finished_goods_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  job_card_id INTEGER NOT NULL REFERENCES job_cards(id),
  production_plan_line_id INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  sales_order_id TEXT NOT NULL,
  sales_order_number TEXT NOT NULL,
  item_id TEXT NOT NULL,
  job_number TEXT NOT NULL,
  zoho_invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  dispatch_quantity REAL NOT NULL CHECK (dispatch_quantity > 0),
  previous_dispatched_quantity REAL NOT NULL CHECK (previous_dispatched_quantity >= 0),
  uom TEXT NOT NULL,
  dispatch_date TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fg_dispatch_job ON finished_goods_dispatches(job_card_id, id);

-- Each insert is its own atomic stock movement. SQLite serializes writers.
CREATE TRIGGER IF NOT EXISTS trg_fg_dispatch_stock_guard
BEFORE INSERT ON finished_goods_dispatches
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM job_cards card
    JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    JOIN production_plans plan ON plan.id=line.production_plan_id
    WHERE card.id=NEW.job_card_id AND card.status='COMPLETED' AND plan.deleted_at IS NULL
      AND card.manufactured_quantity > 0
      AND NEW.previous_dispatched_quantity = COALESCE((SELECT SUM(dispatch_quantity) FROM finished_goods_dispatches WHERE job_card_id=card.id),0)
      AND NEW.dispatch_quantity <= card.manufactured_quantity - COALESCE((SELECT SUM(dispatch_quantity) FROM finished_goods_dispatches WHERE job_card_id=card.id),0)
  ) THEN RAISE(ABORT, 'fg_stock_changed') END;
END;
