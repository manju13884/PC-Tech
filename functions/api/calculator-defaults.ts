import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { readMasterData } from './master-data'

export async function onRequestGet(context: { request: Request; env: { DB?: D1Database } }): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  const db = context.env.DB
  if (!db) return json({ error: 'Master Data database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (user.roleName !== 'SUPERADMIN') {
    const allowed = await db.prepare(`SELECT 1 AS allowed FROM role_menu_permissions
      WHERE role_id = ? AND menu_key IN ('corrugated-box-price', 'corrugated-box-price-advanced', 'corrugated-board-price', 'partition-calculator')
      AND (can_full = 1 OR can_view = 1 OR can_create = 1 OR can_edit = 1 OR can_delete = 1 OR can_approve = 1) LIMIT 1`).bind(user.roleId).first()
    if (!allowed) return json({ error: 'Calculator access is required.' }, 403)
  }
  return json(await readMasterData(db))
}
