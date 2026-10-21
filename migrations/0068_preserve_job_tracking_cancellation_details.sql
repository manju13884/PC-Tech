CREATE TABLE job_tracking_cancellation_snapshots (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 cancellation_token TEXT NOT NULL UNIQUE,
 job_card_id INTEGER NOT NULL,
 job_number TEXT NOT NULL,
 previous_status TEXT NOT NULL,
 job_card_json TEXT NOT NULL CHECK(json_valid(job_card_json)),
 process_entries_json TEXT NOT NULL CHECK(json_valid(process_entries_json)),
 reel_reservations_json TEXT NOT NULL CHECK(json_valid(reel_reservations_json)),
 release_reason TEXT NOT NULL DEFAULT 'JOB_CANCELLED',
 cancelled_by_user_id INTEGER NOT NULL REFERENCES users(id),
 cancelled_by_name TEXT NOT NULL,
 cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_job_tracking_cancellation_job ON job_tracking_cancellation_snapshots(job_card_id,id);
