ALTER TABLE production_plans
ADD COLUMN closure_status TEXT NOT NULL DEFAULT 'OPEN'
CHECK (closure_status IN ('OPEN', 'CLOSED'));

ALTER TABLE production_plans
ADD COLUMN closed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_production_plans_closure_status
ON production_plans(closure_status, deleted_at);
