CREATE TABLE IF NOT EXISTS material_inventory_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_no TEXT UNIQUE,
  material_type TEXT NOT NULL,
  paper_type TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  purchase_order_id TEXT NOT NULL,
  purchase_order_number TEXT NOT NULL,
  purchase_order_line_item_id TEXT NOT NULL,
  zoho_item_id TEXT,
  item_name TEXT NOT NULL,
  item_description TEXT,
  po_quantity REAL NOT NULL,
  po_unit TEXT,
  reel_size_cm REAL NOT NULL,
  color TEXT NOT NULL,
  gsm REAL NOT NULL,
  bf REAL,
  reel_number TEXT NOT NULL,
  reel_weight_kg REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available',
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_inventory_material_no
ON material_inventory_records(material_no);

CREATE TRIGGER IF NOT EXISTS trg_material_inventory_assign_number
AFTER INSERT ON material_inventory_records
FOR EACH ROW
WHEN NEW.material_no IS NULL
BEGIN
  UPDATE material_inventory_records
  SET material_no = 'PCM-' || printf('%04d', NEW.id)
  WHERE id = NEW.id;
END;
