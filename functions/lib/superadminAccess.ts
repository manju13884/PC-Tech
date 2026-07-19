export interface PermissionRow {
  menu_key: string
  can_full: number
  can_view: number
  can_create: number
  can_edit: number
  can_delete: number
  can_approve: number
}

const MENU_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidMenuKey(menuKey: string): boolean {
  return MENU_KEY_PATTERN.test(menuKey)
}

export function normalizeMenuKeys(menuKeys: readonly string[]): string[] {
  return [...new Set(menuKeys.filter(isValidMenuKey))]
}

export async function ensureSuperadminMenuAccess(
  db: D1Database,
  menuKeys: readonly string[],
): Promise<void> {
  const normalizedMenuKeys = normalizeMenuKeys(menuKeys)
  if (normalizedMenuKeys.length === 0) return

  const statements = normalizedMenuKeys.map((menuKey) => db.prepare(
    `INSERT INTO role_menu_permissions (
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
    SELECT id, ?, 1, 1, 1, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM roles
    WHERE name = 'SUPERADMIN'
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
      OR can_approve <> 1`,
  ).bind(menuKey))

  const results = await db.batch(statements)
  if (results.some((result) => !result.success)) {
    throw new Error('SUPERADMIN menu access synchronization failed')
  }
}

export async function getMenuPermission(
  db: D1Database,
  roleId: number,
  menuKey: string,
): Promise<PermissionRow | null> {
  return db.prepare(
    `SELECT
      menu_key,
      can_full,
      can_view,
      can_create,
      can_edit,
      can_delete,
      can_approve
    FROM role_menu_permissions
    WHERE role_id = ? AND menu_key = ?
    LIMIT 1`,
  ).bind(roleId, menuKey).first<PermissionRow>()
}
