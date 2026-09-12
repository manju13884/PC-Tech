ALTER TABLE job_cards ADD COLUMN supervisor_user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_job_cards_supervisor_user
  ON job_cards(supervisor_user_id);
