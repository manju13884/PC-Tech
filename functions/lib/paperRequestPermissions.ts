import type { AuthenticatedUser } from './authenticatedUser'

export const PAPER_REQUEST_MENU_KEY = 'paper-purchase-request'
export const PAPER_REQUEST_APPROVALS_MENU_KEY = 'paper-purchase-request-approvals'
export const PAPER_PO_CALCULATION_MENU_KEY = 'paper-po-calculation'

export async function hasPaperRequestPermission(
  db: D1Database,
  user: AuthenticatedUser,
  menuKey: string,
  action: 'view' | 'edit' | 'approve',
): Promise<boolean> {
  if (user.roleName === 'SUPERADMIN') return true

  const column = action === 'approve'
    ? 'can_approve'
    : action === 'edit'
      ? 'can_edit'
      : 'can_view'
  const row = await db.prepare(
    `SELECT can_full, ${column} AS allowed
    FROM role_menu_permissions
    WHERE role_id = ? AND menu_key = ?
    LIMIT 1`,
  ).bind(user.roleId, menuKey).first<{ can_full: number; allowed: number }>()

  return row?.can_full === 1 || row?.allowed === 1
}
