ALTER TABLE product_specifications
  ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}';
