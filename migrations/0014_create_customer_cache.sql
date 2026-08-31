-- Additive-only shared cache for active Zoho customer details.
CREATE TABLE IF NOT EXISTS customer_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
