CREATE TABLE IF NOT EXISTS inventory_reel_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_stock_id INTEGER NOT NULL,
  reel_number TEXT NOT NULL,
  job_card_id INTEGER NOT NULL,
  job_number TEXT NOT NULL,
  process_entry_id INTEGER NOT NULL,
  process_name TEXT NOT NULL,
  reel_slot INTEGER NOT NULL CHECK (reel_slot IN (1, 2)),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED')),
  reserved_by_user_id INTEGER NOT NULL,
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by_user_id INTEGER,
  released_at TEXT,
  release_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id),
  FOREIGN KEY (process_entry_id) REFERENCES job_card_process_entries(id),
  FOREIGN KEY (reserved_by_user_id) REFERENCES users(id),
  FOREIGN KEY (released_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reel_reservation_one_active_per_reel
ON inventory_reel_reservations(inventory_stock_id)
WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_reel_reservation_one_active_per_process_slot
ON inventory_reel_reservations(job_card_id, process_name, reel_slot)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_reel_reservation_job_history
ON inventory_reel_reservations(job_card_id, reserved_at DESC);
