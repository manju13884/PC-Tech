import { getProductionPlanningCustomerIds } from '../../../lib/salesOrders'
import type { ZohoEnv } from '../../../lib/zoho'
import { getAuthenticatedUser } from '../../lib/authenticatedUser'

export async function onRequestGet(context: { request: Request; env: ZohoEnv & { DB?: D1Database } }): Promise<Response> {
  const db = context.env.DB
  if (!db) return Response.json({ error: 'Production Planning database is unavailable.' }, { status: 503 })
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  if (user.roleName !== 'SUPERADMIN') {
    const allowed = await db.prepare("SELECT 1 AS allowed FROM role_menu_permissions WHERE role_id = ? AND menu_key = 'production-planning' AND (can_full = 1 OR can_view = 1)").bind(user.roleId).first()
    if (!allowed) return Response.json({ error: 'Production Planning view access is required.' }, { status: 403 })
  }
  try {
    return Response.json(await getProductionPlanningCustomerIds(context.env), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[production-planning-customers] Unable to load eligible customers', error)
    return Response.json({ error: 'Unable to load eligible customers.' }, { status: 502 })
  }
}
