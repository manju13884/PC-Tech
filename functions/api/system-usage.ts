import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { collectSystemUsage, type UsageEnv } from '../lib/systemUsage'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function onRequest(context: { request: Request; env: UsageEnv }): Promise<Response> {
  if (context.request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } })
  try {
    const db = context.env.DB
    if (!db) return json({ error: 'System Usage is temporarily unavailable.' }, 503)
    const user = await getAuthenticatedUser(context.request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    if (user.roleName !== 'SUPERADMIN') {
      const allowed = await db.prepare(`SELECT 1 AS allowed FROM role_menu_permissions
        WHERE role_id = ? AND menu_key = 'data-management'
        AND (can_full = 1 OR can_view = 1 OR can_create = 1 OR can_edit = 1 OR can_delete = 1 OR can_approve = 1)
        LIMIT 1`).bind(user.roleId).first()
      if (!allowed) return json({ error: 'Data Management access is required.' }, 403)
    }
    return json(await collectSystemUsage(context.request, context.env))
  } catch { return json({ error: 'System Usage is temporarily unavailable.' }, 503) }
}
