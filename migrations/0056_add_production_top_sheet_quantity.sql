ALTER TABLE production_plan_lines
ADD COLUMN top_sheet_quantity REAL CHECK (top_sheet_quantity > 0);

UPDATE production_plan_lines
SET top_sheet_quantity = production_quantity
WHERE top_sheet_quantity IS NULL;
