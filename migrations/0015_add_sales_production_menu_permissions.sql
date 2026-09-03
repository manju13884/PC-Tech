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
  'sales-orders',
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'so-specification-mapping',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'product-specifications',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'production-specifications',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'job-cards',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'production-planning',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;

INSERT OR IGNORE INTO role_menu_permissions (
  role_id, menu_key, can_full, can_view, can_create, can_edit, can_delete, can_approve
)
SELECT id, 'job-tracking',
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END,
  CASE WHEN name IN ('SUPERADMIN', 'ADMIN') THEN 1 ELSE 0 END
FROM roles;
