PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_plan_sequences (
  financial_year TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_number TEXT UNIQUE,
  plan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED',
    'COMPLETED', 'ON_HOLD', 'CANCELLED'
  )),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  remarks TEXT NOT NULL DEFAULT '',
  total_sales_orders INTEGER NOT NULL DEFAULT 0,
  total_customers INTEGER NOT NULL DEFAULT 0,
  total_line_items INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  updated_by_user_id INTEGER NOT NULL,
  updated_by_name TEXT NOT NULL,
  updated_by_email TEXT NOT NULL,
  cancelled_by_user_id INTEGER,
  cancellation_reason TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS production_plan_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_plan_id INTEGER NOT NULL,
  zoho_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  zoho_sales_order_id TEXT NOT NULL,
  sales_order_number TEXT NOT NULL,
  sales_order_date TEXT,
  zoho_sales_order_line_item_id TEXT NOT NULL,
  zoho_item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_description TEXT NOT NULL DEFAULT '',
  customer_po_number TEXT,
  delivery_date TEXT,
  ordered_quantity REAL NOT NULL CHECK (ordered_quantity > 0),
  previously_planned_quantity REAL NOT NULL DEFAULT 0 CHECK (previously_planned_quantity >= 0),
  balance_quantity REAL NOT NULL CHECK (balance_quantity > 0),
  production_quantity REAL NOT NULL CHECK (production_quantity > 0),
  uom TEXT NOT NULL DEFAULT '',
  customer_product_specification_id INTEGER NOT NULL,
  approved_specification_revision_id INTEGER NOT NULL,
  product_type TEXT,
  ply INTEGER,
  line_status TEXT NOT NULL DEFAULT 'READY' CHECK (line_status IN ('READY', 'VALIDATION_REQUIRED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (production_plan_id, zoho_sales_order_line_item_id),
  FOREIGN KEY (production_plan_id) REFERENCES production_plans(id),
  FOREIGN KEY (customer_product_specification_id) REFERENCES product_specification_records(id),
  FOREIGN KEY (approved_specification_revision_id) REFERENCES product_specification_records(id)
);

CREATE TABLE IF NOT EXISTS production_plan_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_plan_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by_user_id INTEGER NOT NULL,
  changed_by_name TEXT NOT NULL,
  changed_by_email TEXT NOT NULL,
  source_context TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_plan_id) REFERENCES production_plans(id),
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_production_plans_status ON production_plans(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_production_plans_created_at ON production_plans(created_at);
CREATE INDEX IF NOT EXISTS idx_production_plan_lines_plan ON production_plan_lines(production_plan_id);
CREATE INDEX IF NOT EXISTS idx_production_plan_lines_so ON production_plan_lines(zoho_sales_order_id);
CREATE INDEX IF NOT EXISTS idx_production_plan_lines_so_line ON production_plan_lines(zoho_sales_order_line_item_id);
CREATE INDEX IF NOT EXISTS idx_production_plan_lines_spec ON production_plan_lines(approved_specification_revision_id);
CREATE INDEX IF NOT EXISTS idx_production_plan_history_plan ON production_plan_status_history(production_plan_id, created_at);

CREATE TRIGGER IF NOT EXISTS validate_production_plan_line_insert
BEFORE INSERT ON production_plan_lines
WHEN (SELECT status FROM production_plans WHERE id = NEW.production_plan_id) <> 'DRAFT'
BEGIN
  SELECT CASE WHEN NEW.production_quantity > NEW.ordered_quantity - COALESCE((
    SELECT SUM(existing.production_quantity)
    FROM production_plan_lines existing
    INNER JOIN production_plans plan ON plan.id = existing.production_plan_id
    WHERE existing.zoho_sales_order_line_item_id = NEW.zoho_sales_order_line_item_id
      AND plan.deleted_at IS NULL
      AND plan.status IN ('PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD')
  ), 0) THEN RAISE(ABORT, 'production_quantity_exceeds_balance') END;
END;

CREATE TRIGGER IF NOT EXISTS validate_production_plan_finalisation
BEFORE UPDATE OF status ON production_plans
WHEN OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' AND NEW.status <> 'CANCELLED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM production_plan_lines draft_line
    WHERE draft_line.production_plan_id = NEW.id
      AND draft_line.production_quantity > draft_line.ordered_quantity - COALESCE((
        SELECT SUM(existing.production_quantity)
        FROM production_plan_lines existing
        INNER JOIN production_plans plan ON plan.id = existing.production_plan_id
        WHERE existing.zoho_sales_order_line_item_id = draft_line.zoho_sales_order_line_item_id
          AND existing.production_plan_id <> NEW.id
          AND plan.deleted_at IS NULL
          AND plan.status IN ('PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD')
      ), 0)
  ) THEN RAISE(ABORT, 'production_quantity_exceeds_balance') END;
END;
