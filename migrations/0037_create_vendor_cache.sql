-- Additive-only shared cache for active Zoho Books vendor details.
CREATE TABLE IF NOT EXISTS vendor_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
