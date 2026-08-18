-- Additive-only durable cache for the once-daily Zoho dashboard refresh.
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  payload_json TEXT,
  refresh_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refreshed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_business_date
  ON dashboard_snapshots (business_date DESC);
