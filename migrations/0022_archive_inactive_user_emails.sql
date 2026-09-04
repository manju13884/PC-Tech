ALTER TABLE users ADD COLUMN archived_email TEXT;

UPDATE users
SET archived_email = email,
    email = 'inactive-user-' || id || '@disabled.local',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'INACTIVE';

CREATE INDEX IF NOT EXISTS idx_users_archived_email
  ON users(archived_email);
