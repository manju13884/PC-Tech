CREATE TABLE IF NOT EXISTS material_inventory_edit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_stock_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  old_values TEXT NOT NULL,
  proposed_values TEXT NOT NULL,
  stock_updated_at_snapshot TEXT NOT NULL,
  edit_reason TEXT NOT NULL,
  requested_by_user_id INTEGER NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INTEGER,
  reviewed_by_name TEXT,
  reviewed_by_email TEXT,
  reviewed_at TEXT,
  rejection_reason TEXT,
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_edit_one_pending
ON material_inventory_edit_requests(inventory_stock_id)
WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS idx_material_edit_status_date
ON material_inventory_edit_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS material_inventory_edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edit_request_id INTEGER NOT NULL,
  inventory_stock_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('REQUESTED', 'APPROVED', 'REJECTED')),
  old_values TEXT NOT NULL,
  proposed_values TEXT NOT NULL,
  reason TEXT NOT NULL,
  action_by_user_id INTEGER NOT NULL,
  action_by_name TEXT NOT NULL,
  action_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (edit_request_id) REFERENCES material_inventory_edit_requests(id),
  FOREIGN KEY (inventory_stock_id) REFERENCES material_inventory_records(id),
  FOREIGN KEY (action_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_material_edit_history_stock
ON material_inventory_edit_history(inventory_stock_id, action_at DESC);
