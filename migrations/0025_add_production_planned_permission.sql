PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT
  role_id,
  'production-planned',
  can_full,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve
FROM role_menu_permissions
WHERE menu_key = 'production-planning';
