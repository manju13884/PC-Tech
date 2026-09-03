UPDATE product_specification_records
SET polar_canvas_item_code = 'PC-' || printf('%04d', id)
WHERE polar_canvas_item_code IS NOT NULL;
