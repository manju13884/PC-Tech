CREATE TABLE IF NOT EXISTS inventory_stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_number TEXT UNIQUE,
  adjustment_date TEXT NOT NULL,
  material_type TEXT NOT NULL,
  inventory_stock_id INTEGER NOT NULL,
  location_name TEXT,
  current_stock_snapshot REAL NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE')),
  adjustment_qty REAL NOT NULL CHECK (adjustment_qty > 0),
  revised_stock_snapshot REAL NOT NULL CHECK (revised_stock_snapshot >= 0),
  uom TEXT NOT NULL,
  reason TEXT NOT NULL,
  other_reason TEXT,
  remarks TEXT NOT NULL,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  created_by_user_id INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_by_user_id INTEGER,
  submitted_at TEXT,
  approved_by_user_id INTEGER,
  approved_by_name TEXT,
  approved_by_email TEXT,
  approved_at TEXT,
  rejected_by_user_id INTEGER,
  rejected_by_name TEXT,
  rejected_by_email TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  updated_by_user_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  FOREIGN KEY (rejected_by_user_id) REFERENCES users(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_stock_adjustment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_by_user_id INTEGER NOT NULL,
  action_by_name TEXT NOT NULL,
  action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  remarks TEXT,
  FOREIGN KEY (adjustment_id) REFERENCES inventory_stock_adjustments(id),
  FOREIGN KEY (action_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  reference_number TEXT NOT NULL,
  material_type TEXT NOT NULL,
  inventory_stock_id INTEGER NOT NULL,
  movement TEXT NOT NULL CHECK (movement IN ('IN', 'OUT')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  uom TEXT NOT NULL,
  previous_stock REAL NOT NULL,
  revised_stock REAL NOT NULL CHECK (revised_stock >= 0),
  reason TEXT NOT NULL,
  remarks TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  approved_by_user_id INTEGER NOT NULL,
  transaction_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  UNIQUE (reference_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_status_date ON inventory_stock_adjustments(status, adjustment_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_material ON inventory_stock_adjustments(inventory_stock_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_inventory ON inventory_stock_ledger(inventory_stock_id, transaction_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_stock_adjustment_assign_number
AFTER INSERT ON inventory_stock_adjustments
FOR EACH ROW WHEN NEW.adjustment_number IS NULL
BEGIN
  UPDATE inventory_stock_adjustments
  SET adjustment_number = 'SA-' || printf('%06d', NEW.id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_adjustment_ledger_validate
BEFORE INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'STOCK_ADJUSTMENT'
BEGIN
  SELECT CASE
    WHEN COALESCE((SELECT status FROM inventory_stock_adjustments WHERE id = NEW.reference_id), '') <> 'PENDING_APPROVAL'
      THEN RAISE(ABORT, 'stock_adjustment_not_pending')
    WHEN ABS(COALESCE((SELECT reel_weight_kg FROM material_inventory_records WHERE id = NEW.inventory_stock_id), -1) - NEW.previous_stock) > 0.000001
      THEN RAISE(ABORT, 'stock_balance_changed')
    WHEN NEW.revised_stock < 0
      THEN RAISE(ABORT, 'negative_stock_not_allowed')
    WHEN NEW.movement = 'IN' AND ABS((NEW.previous_stock + NEW.quantity) - NEW.revised_stock) > 0.000001
      THEN RAISE(ABORT, 'invalid_stock_calculation')
    WHEN NEW.movement = 'OUT' AND ABS((NEW.previous_stock - NEW.quantity) - NEW.revised_stock) > 0.000001
      THEN RAISE(ABORT, 'invalid_stock_calculation')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_adjustment_ledger_apply
AFTER INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'STOCK_ADJUSTMENT'
BEGIN
  UPDATE material_inventory_records
  SET reel_weight_kg = NEW.revised_stock, updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.inventory_stock_id;
END;
