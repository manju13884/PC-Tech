-- Ensure SUPERADMIN has full access to every menu key already registered in
-- role_menu_permissions. Runtime menu discovery handles newly introduced keys.
INSERT INTO role_menu_permissions (
  role_id,
  menu_key,
  can_full,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve,
  created_at,
  updated_at
)
SELECT
  superadmin.id,
  known_menu.menu_key,
  1,
  1,
  1,
  1,
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM roles AS superadmin
CROSS JOIN (
  SELECT DISTINCT menu_key
  FROM role_menu_permissions
) AS known_menu
WHERE superadmin.name = 'SUPERADMIN'
ON CONFLICT(role_id, menu_key) DO UPDATE SET
  can_full = 1,
  can_view = 1,
  can_create = 1,
  can_edit = 1,
  can_delete = 1,
  can_approve = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE can_full <> 1
  OR can_view <> 1
  OR can_create <> 1
  OR can_edit <> 1
  OR can_delete <> 1
  OR can_approve <> 1;
