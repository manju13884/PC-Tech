CREATE TABLE IF NOT EXISTS inventory_material_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_number TEXT UNIQUE,
  issue_date TEXT NOT NULL,
  zoho_customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  material_type TEXT NOT NULL,
  inventory_stock_id INTEGER NOT NULL,
  original_available_stock REAL NOT NULL CHECK (original_available_stock >= 0),
  issue_quantity REAL NOT NULL CHECK (issue_quantity > 0),
  remaining_stock REAL NOT NULL CHECK (remaining_stock >= 0),
  uom TEXT NOT NULL DEFAULT 'KG',
  invoice_number TEXT,
  sales_order_number TEXT,
  customer_po_number TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED')),
  issued_by_user_id INTEGER NOT NULL,
  issued_by_name TEXT NOT NULL,
  completed_by_user_id INTEGER,
  completed_by_name TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id),
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_material_issues_status_date
  ON inventory_material_issues(status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_material_issues_stock
  ON inventory_material_issues(inventory_stock_id);
CREATE INDEX IF NOT EXISTS idx_material_issues_customer
  ON inventory_material_issues(zoho_customer_id);

CREATE TRIGGER IF NOT EXISTS trg_material_issue_assign_number
AFTER INSERT ON inventory_material_issues
FOR EACH ROW WHEN NEW.issue_number IS NULL
BEGIN
  UPDATE inventory_material_issues
  SET issue_number = 'MI-' || printf('%06d', NEW.id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_material_issue_ledger_validate
BEFORE INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'MATERIAL_ISSUE'
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT status FROM inventory_material_issues WHERE id=NEW.reference_id), '') <> 'DRAFT'
      THEN RAISE(ABORT, 'material_issue_not_draft')
    WHEN ABS(COALESCE((SELECT reel_weight_kg FROM material_inventory_records WHERE id=NEW.inventory_stock_id), -1) - NEW.previous_stock) > 0.000001
      THEN RAISE(ABORT, 'stock_balance_changed')
    WHEN EXISTS(SELECT 1 FROM inventory_reel_reservations WHERE inventory_stock_id=NEW.inventory_stock_id AND status='ACTIVE')
      THEN RAISE(ABORT, 'reel_is_reserved')
    WHEN NEW.movement <> 'OUT' OR NEW.quantity <= 0 OR NEW.revised_stock < 0
      THEN RAISE(ABORT, 'invalid_material_issue')
    WHEN ABS((NEW.previous_stock - NEW.quantity) - NEW.revised_stock) > 0.000001
      THEN RAISE(ABORT, 'invalid_stock_calculation')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_material_issue_ledger_apply
AFTER INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'MATERIAL_ISSUE'
BEGIN
  UPDATE material_inventory_records
  SET reel_weight_kg=NEW.revised_stock,
      status=CASE WHEN NEW.revised_stock <= 0 THEN 'Consumed' ELSE 'Available' END,
      updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.inventory_stock_id;
END;
