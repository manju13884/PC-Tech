CREATE TABLE user_special_permissions (
 user_id INTEGER NOT NULL REFERENCES users(id),
 permission_key TEXT NOT NULL CHECK(permission_key IN ('lead-management:reassign')),
 granted INTEGER NOT NULL DEFAULT 0 CHECK(granted IN (0,1)),
 updated_by INTEGER NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,permission_key)
);
