ALTER TABLE sessions ADD COLUMN logout_type TEXT CHECK (logout_type IN ('USER', 'SYSTEM'));
ALTER TABLE sessions ADD COLUMN system_ended_at TEXT;

CREATE TRIGGER record_user_session_end
AFTER UPDATE OF session_version, status ON users
BEGIN
  UPDATE sessions SET system_ended_at = CURRENT_TIMESTAMP, logout_type = 'SYSTEM'
  WHERE user_id = NEW.id AND revoked_at IS NULL AND system_ended_at IS NULL
    AND julianday(expires_at) > julianday('now')
    AND (session_version <> NEW.session_version OR NEW.status <> 'ACTIVE');
END;

CREATE TRIGGER record_role_session_end
AFTER UPDATE OF is_active ON roles
WHEN NEW.is_active = 0
BEGIN
  UPDATE sessions SET system_ended_at = CURRENT_TIMESTAMP, logout_type = 'SYSTEM'
  WHERE user_id IN (SELECT id FROM users WHERE role_id = NEW.id)
    AND revoked_at IS NULL AND system_ended_at IS NULL
    AND julianday(expires_at) > julianday('now');
END;

-- Password changes preserve the session making the change.
CREATE TRIGGER preserve_updated_session
AFTER UPDATE OF session_version ON sessions
WHEN NEW.session_version = (SELECT session_version FROM users WHERE id = NEW.user_id)
  AND NEW.revoked_at IS NULL
  AND (SELECT status FROM users WHERE id = NEW.user_id) = 'ACTIVE'
BEGIN
  UPDATE sessions SET system_ended_at = NULL, logout_type = NULL WHERE id = NEW.id;
END;
