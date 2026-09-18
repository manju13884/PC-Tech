CREATE TABLE IF NOT EXISTS material_inventory_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_stock_id INTEGER NOT NULL,
  material_no TEXT NOT NULL,
  reel_number TEXT NOT NULL,
  material_snapshot TEXT NOT NULL,
  deletion_reason TEXT NOT NULL,
  deleted_by_user_id INTEGER NOT NULL,
  deleted_by_name TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deleted_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_material_inventory_deletions_stock
ON material_inventory_deletions(inventory_stock_id, deleted_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_material_inventory_prevent_used_delete
BEFORE DELETE ON material_inventory_records
FOR EACH ROW
BEGIN
  SELECT CASE WHEN
    EXISTS (SELECT 1 FROM job_card_process_entries WHERE inventory_stock_id = OLD.id OR inventory_stock_id_2 = OLD.id)
    OR EXISTS (SELECT 1 FROM job_tracking_reel_consumptions WHERE inventory_stock_id = OLD.id)
    OR EXISTS (SELECT 1 FROM inventory_reel_reservations WHERE inventory_stock_id = OLD.id)
    OR EXISTS (SELECT 1 FROM inventory_stock_adjustments WHERE inventory_stock_id = OLD.id)
    OR EXISTS (SELECT 1 FROM inventory_stock_ledger WHERE inventory_stock_id = OLD.id)
    OR EXISTS (SELECT 1 FROM inventory_material_issues WHERE inventory_stock_id = OLD.id)
  THEN RAISE(ABORT, 'material_stock_is_in_use') END;
END;
