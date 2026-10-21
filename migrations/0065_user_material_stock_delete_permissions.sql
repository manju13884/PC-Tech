-- Preserve existing grants while extending the user permission catalog.
ALTER TABLE user_special_permissions RENAME TO user_special_permissions_archive_0065;
CREATE TABLE user_special_permissions (
 user_id INTEGER NOT NULL REFERENCES users(id),
 permission_key TEXT NOT NULL,
 granted INTEGER NOT NULL DEFAULT 0 CHECK(granted IN (0,1)),
 updated_by INTEGER REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,permission_key)
);
INSERT INTO user_special_permissions(user_id,permission_key,granted,updated_by,updated_at)
SELECT user_id,permission_key,granted,updated_by,updated_at FROM user_special_permissions_archive_0065;
-- Carry forward role-based deletion access for existing users as explicit user grants.
-- NULL updated_by identifies migrated access rather than a manual grant.
INSERT OR IGNORE INTO user_special_permissions(user_id,permission_key,granted,updated_by)
SELECT u.id,'material-stock:delete',1,NULL
FROM users u JOIN roles r ON r.id=u.role_id JOIN role_menu_permissions p ON p.role_id=r.id
WHERE r.name!='SUPERADMIN' AND p.menu_key='material-stock' AND (p.can_full=1 OR p.can_delete=1);
