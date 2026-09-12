ALTER TABLE job_card_process_entries ADD COLUMN process_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
  CHECK (process_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'));
ALTER TABLE job_card_process_entries ADD COLUMN completed_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE job_card_process_entries ADD COLUMN completed_at TEXT;

CREATE TRIGGER IF NOT EXISTS trg_job_process_ledger_validate
BEFORE INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'JOB_PROCESS'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM job_tracking_reel_consumptions c
      WHERE c.id = NEW.reference_id
        AND c.inventory_stock_id = NEW.inventory_stock_id
        AND ABS(c.previous_weight - NEW.previous_stock) <= 0.000001
        AND ABS(c.consumed_weight - NEW.quantity) <= 0.000001
        AND ABS(c.remaining_weight - NEW.revised_stock) <= 0.000001
    ) THEN RAISE(ABORT, 'invalid_job_process_consumption')
    WHEN ABS(COALESCE((SELECT reel_weight_kg FROM material_inventory_records WHERE id = NEW.inventory_stock_id), -1) - NEW.previous_stock) > 0.000001
      THEN RAISE(ABORT, 'stock_balance_changed')
    WHEN NEW.movement <> 'OUT' OR ABS((NEW.previous_stock - NEW.quantity) - NEW.revised_stock) > 0.000001
      THEN RAISE(ABORT, 'invalid_stock_calculation')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_job_process_ledger_apply
AFTER INSERT ON inventory_stock_ledger
FOR EACH ROW WHEN NEW.reference_type = 'JOB_PROCESS'
BEGIN
  UPDATE material_inventory_records
  SET reel_weight_kg = NEW.revised_stock,
      status = CASE WHEN NEW.revised_stock <= 0 THEN 'Consumed' ELSE 'Available' END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.inventory_stock_id;
END;
