PRAGMA foreign_keys = ON;

ALTER TABLE production_plan_lines ADD COLUMN two_ply_quantity REAL;
ALTER TABLE production_plan_lines ADD COLUMN deckle_size TEXT NOT NULL DEFAULT '';
