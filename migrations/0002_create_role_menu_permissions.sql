PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS role_menu_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  menu_key TEXT NOT NULL,
  can_full INTEGER NOT NULL DEFAULT 0,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_approve INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (role_id, menu_key),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_role_menu_permissions_role_id ON role_menu_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_menu_permissions_menu_key ON role_menu_permissions(menu_key);

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
  menu.menu_key,
  CASE
    WHEN roles.name = 'SUPERADMIN' THEN 1
    WHEN roles.name = 'ADMIN' THEN 1
    ELSE 0
  END,
  CASE
    WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1
    WHEN roles.name = 'SALES' AND menu.menu_key IN ('coc', 'packing-slip') THEN 1
    WHEN roles.name = 'PRODUCTION' AND menu.menu_key IN ('coc', 'packing-slip', 'coa') THEN 1
    ELSE 0
  END,
  CASE
    WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1
    WHEN roles.name = 'SALES' AND menu.menu_key IN ('coc', 'packing-slip') THEN 1
    WHEN roles.name = 'PRODUCTION' AND menu.menu_key IN ('coc', 'packing-slip', 'coa') THEN 1
    ELSE 0
  END,
  CASE
    WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1
    WHEN roles.name = 'SALES' AND menu.menu_key IN ('coc', 'packing-slip') THEN 1
    WHEN roles.name = 'PRODUCTION' AND menu.menu_key IN ('coc', 'packing-slip', 'coa') THEN 1
    ELSE 0
  END,
  CASE
    WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1
    ELSE 0
  END,
  CASE
    WHEN roles.name IN ('SUPERADMIN', 'ADMIN') THEN 1
    ELSE 0
  END
FROM roles
CROSS JOIN (
  SELECT 'corrugated-box-price' AS menu_key
  UNION ALL SELECT 'coc'
  UNION ALL SELECT 'packing-slip'
  UNION ALL SELECT 'coa'
  UNION ALL SELECT 'admin-configurations'
) menu;
