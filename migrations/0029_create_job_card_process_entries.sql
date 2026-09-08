PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS job_card_process_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_card_id INTEGER NOT NULL,
  process_name TEXT NOT NULL,
  start_datetime TEXT,
  end_datetime TEXT,
  updated_by_user_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_card_id, process_name),
  FOREIGN KEY (job_card_id) REFERENCES job_cards(id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_job_card_process_entries_job
  ON job_card_process_entries(job_card_id, process_name);
