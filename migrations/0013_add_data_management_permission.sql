PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id,
  menu_key,
  can_full,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve
)
SELECT
  roles.id,
  'data-management',
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;
