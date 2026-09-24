CREATE TABLE IF NOT EXISTS sales_order_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
