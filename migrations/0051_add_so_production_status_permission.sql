PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'so-production-status',
  CASE WHEN name = 'SUPERADMIN' THEN 1 ELSE 0 END,
  CASE WHEN name = 'SUPERADMIN' THEN 1 ELSE 0 END,
  0, 0, 0, 0
FROM roles;
