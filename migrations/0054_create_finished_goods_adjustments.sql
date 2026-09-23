CREATE TABLE IF NOT EXISTS finished_goods_adjustments (
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
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('INCREASE','DECREASE')),
  adjustment_quantity REAL NOT NULL CHECK (adjustment_quantity > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  remarks TEXT NOT NULL DEFAULT '',
  previous_closing_stock REAL NOT NULL CHECK (previous_closing_stock >= 0),
  uom TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (reason <> 'Other' OR length(trim(remarks)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_fg_adjustment_job ON finished_goods_adjustments(job_card_id,id);

CREATE VIEW finished_goods_balances AS
WITH totals AS (
  SELECT card.id AS job_card_id,card.manufactured_quantity,
    COALESCE((SELECT SUM(dispatch_quantity) FROM finished_goods_dispatches WHERE job_card_id=card.id),0) AS dispatched_quantity,
    COALESCE((SELECT SUM(adjustment_quantity) FROM finished_goods_adjustments WHERE job_card_id=card.id AND adjustment_type='INCREASE'),0) AS adjustment_increase,
    COALESCE((SELECT SUM(adjustment_quantity) FROM finished_goods_adjustments WHERE job_card_id=card.id AND adjustment_type='DECREASE'),0) AS adjustment_decrease
  FROM job_cards card
)
SELECT totals.*,adjustment_increase-adjustment_decrease AS stock_adjustment,
  manufactured_quantity-dispatched_quantity+adjustment_increase-adjustment_decrease AS closing_stock
FROM totals;

ALTER TABLE finished_goods_dispatches ADD COLUMN previous_closing_stock REAL;

-- Replace only the guard, retaining every existing dispatch transaction.
DROP TRIGGER IF EXISTS trg_fg_dispatch_stock_guard;
CREATE TRIGGER trg_fg_dispatch_stock_guard
BEFORE INSERT ON finished_goods_dispatches
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM job_cards card
    JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    JOIN production_plans plan ON plan.id=line.production_plan_id
    JOIN finished_goods_balances balance ON balance.job_card_id=card.id
    WHERE card.id=NEW.job_card_id AND card.status='COMPLETED' AND plan.deleted_at IS NULL
      AND card.manufactured_quantity > 0
      AND NEW.previous_dispatched_quantity=balance.dispatched_quantity
      AND NEW.previous_closing_stock=balance.closing_stock
      AND NEW.dispatch_quantity<=balance.closing_stock
  ) THEN RAISE(ABORT,'fg_stock_changed') END;
END;

-- Both movement types check the same current balance inside SQLite's write transaction.
CREATE TRIGGER trg_fg_adjustment_stock_guard
BEFORE INSERT ON finished_goods_adjustments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM job_cards card
    JOIN production_plan_lines line ON line.id=card.production_plan_line_id
    JOIN production_plans plan ON plan.id=line.production_plan_id
    JOIN finished_goods_balances balance ON balance.job_card_id=card.id
    WHERE card.id=NEW.job_card_id AND card.status='COMPLETED' AND plan.deleted_at IS NULL
      AND card.manufactured_quantity > 0
      AND NEW.previous_closing_stock=balance.closing_stock
      AND (NEW.adjustment_type='INCREASE' OR NEW.adjustment_quantity<=balance.closing_stock)
  ) THEN RAISE(ABORT,'fg_stock_changed') END;
END;
