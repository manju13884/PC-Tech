UPDATE role_menu_permissions
SET can_delete = 0,
    can_full = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE menu_key = 'material-stock'
  AND role_id IN (SELECT id FROM roles WHERE name <> 'SUPERADMIN');
