ALTER TABLE product_specification_records
  ADD COLUMN polar_canvas_item_code TEXT;

UPDATE product_specification_records
SET polar_canvas_item_code = 'PC-' || printf('%06d', id)
WHERE polar_canvas_item_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_spec_records_pc_item_code
  ON product_specification_records(polar_canvas_item_code);
