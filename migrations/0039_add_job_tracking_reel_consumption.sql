ALTER TABLE job_card_process_entries ADD COLUMN inventory_stock_id INTEGER REFERENCES material_inventory_records(id);
ALTER TABLE job_card_process_entries ADD COLUMN inventory_stock_id_2 INTEGER REFERENCES material_inventory_records(id);

CREATE TABLE IF NOT EXISTS job_tracking_reel_consumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  process_entry_id INTEGER NOT NULL,
  process_name TEXT NOT NULL,
  reel_slot INTEGER NOT NULL CHECK (reel_slot IN (1, 2)),
  inventory_stock_id INTEGER NOT NULL,
  reel_number TEXT NOT NULL,
  previous_weight REAL NOT NULL CHECK (previous_weight > 0),
  out_reel_weight REAL NOT NULL CHECK (out_reel_weight >= 0),
  consumed_weight REAL NOT NULL CHECK (consumed_weight > 0),
  remaining_weight REAL NOT NULL CHECK (remaining_weight >= 0),
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id),
  FOREIGN KEY (process_entry_id) REFERENCES job_card_process_entries(id),
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE (job_card_id, process_name, reel_slot)
);

CREATE INDEX IF NOT EXISTS idx_job_reel_consumption_material
ON job_tracking_reel_consumptions(inventory_stock_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_job_tracking_ledger_validate
BEFORE INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'JOB_TRACKING'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM job_tracking_reel_consumptions c
      WHERE c.id = NEW.reference_id
        AND c.inventory_stock_id = NEW.inventory_stock_id
        AND ABS(c.previous_weight - NEW.previous_stock) <= 0.000001
        AND ABS(c.consumed_weight - NEW.quantity) <= 0.000001
        AND ABS(c.remaining_weight - NEW.revised_stock) <= 0.000001
    ) THEN RAISE(ABORT, 'invalid_job_tracking_consumption')
    WHEN ABS(COALESCE((SELECT reel_weight_kg FROM material_inventory_records WHERE id = NEW.inventory_stock_id), -1) - NEW.previous_stock) > 0.000001
      THEN RAISE(ABORT, 'stock_balance_changed')
    WHEN NEW.movement <> 'OUT' OR ABS((NEW.previous_stock - NEW.quantity) - NEW.revised_stock) > 0.000001
      THEN RAISE(ABORT, 'invalid_stock_calculation')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_job_tracking_ledger_apply
AFTER INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'JOB_TRACKING'
BEGIN
  UPDATE material_inventory_records
  SET reel_weight_kg = NEW.revised_stock, updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.inventory_stock_id;
END;
