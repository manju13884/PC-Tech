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
  id,
  'paper-po-calculation',
  1,
  1,
  1,
  1,
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM roles
WHERE name = 'SUPERADMIN'
ON CONFLICT(role_id, menu_key) DO UPDATE SET
  can_full = 1,
  can_view = 1,
  can_create = 1,
  can_edit = 1,
  can_delete = 1,
  can_approve = 1,
  updated_at = CURRENT_TIMESTAMP;
