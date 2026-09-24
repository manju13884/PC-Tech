ALTER TABLE production_plan_lines
ADD COLUMN ups INTEGER NOT NULL DEFAULT 1 CHECK (ups > 0 AND ups = CAST(ups AS INTEGER));

ALTER TABLE production_plan_lines ADD COLUMN flute_run TEXT;
