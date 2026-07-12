ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_must_change_password ON users(must_change_password);
