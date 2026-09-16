CREATE TABLE IF NOT EXISTS job_card_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER,
  job_number TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by_user_id INTEGER NOT NULL,
  changed_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_job_card_status_history_job
ON job_card_status_history(job_card_id, created_at DESC);
