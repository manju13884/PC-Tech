import { getAuthenticatedUser } from '../../lib/authenticatedUser'

interface Context { request: Request; env: { DB?: D1Database } }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export async function onRequest({ request, env }: Context): Promise<Response> {
  try {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405)
    if (!env.DB) return json({ error: 'Database unavailable.' }, 503)
    const db = env.DB.withSession('first-primary') as unknown as D1Database
    const actor = await getAuthenticatedUser(request, db)
    if (!actor) return json({ error: 'Authentication required.' }, 401)
    if (actor.roleName !== 'SUPERADMIN') return json({ error: 'SUPERADMIN access required.' }, 403)
    if (request.method === 'GET') {
      const users = await db.prepare(`SELECT u.id, u.full_name AS fullName, u.email, r.name AS role,
        CASE WHEN r.name IN ('SUPERADMIN','ADMIN') THEN 1 ELSE COALESCE(p.granted,0) END AS reassign,
        CASE WHEN r.name IN ('SUPERADMIN','ADMIN') THEN 1 ELSE 0 END AS inherited,
        CASE WHEN r.name='SUPERADMIN' THEN 1 ELSE COALESCE(stock.granted,0) END AS deleteStock,
        CASE WHEN r.name='SUPERADMIN' THEN 1 ELSE 0 END AS inheritedDelete,
        CASE WHEN r.name IN ('SUPERADMIN','ADMIN') THEN 1 ELSE COALESCE(all_leads.granted,0) END AS viewAll,
        CASE WHEN r.name IN ('SUPERADMIN','ADMIN') THEN 1 ELSE 0 END AS inheritedViewAll,
        CASE WHEN r.name='SUPERADMIN' THEN 1 ELSE COALESCE(dashboard.granted,0) END AS viewDashboardCustomers,
        CASE WHEN r.name='SUPERADMIN' THEN 1 ELSE 0 END AS inheritedDashboardCustomers
        FROM users u JOIN roles r ON r.id=u.role_id
        LEFT JOIN user_special_permissions p ON p.user_id=u.id AND p.permission_key='lead-management:reassign'
        LEFT JOIN user_special_permissions stock ON stock.user_id=u.id AND stock.permission_key='material-stock:delete'
        LEFT JOIN user_special_permissions all_leads ON all_leads.user_id=u.id AND all_leads.permission_key='lead-management:view-all'
        LEFT JOIN user_special_permissions dashboard ON dashboard.user_id=u.id AND dashboard.permission_key='dashboard:view-customer-names'
        WHERE u.status='ACTIVE' AND r.is_active=1
        ORDER BY u.full_name,u.id`).all()
      return json({ users: users.results })
    }
    let body: { userId?: unknown; granted?: unknown; permissionKey?: unknown }
    try { body = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }
    if (!body || !Number.isSafeInteger(body.userId) || Number(body.userId) <= 0 || typeof body.granted !== 'boolean')
      return json({ error: 'Select a user and a valid permission.' }, 400)
    const permissionKey = body.permissionKey ?? 'lead-management:reassign'
    if (!['lead-management:reassign', 'material-stock:delete', 'lead-management:view-all', 'dashboard:view-customer-names'].includes(permissionKey as string))
      return json({ error: 'Select a valid permission.' }, 400)
    const target = await db.prepare(`SELECT r.name AS role FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.id=? AND u.status='ACTIVE' AND r.is_active=1`).bind(body.userId).first<{role:string}>()
    if (!target) return json({ error: 'Select an active user.' }, 400)
    if (target.role === 'SUPERADMIN') return json({ error: 'SUPERADMIN automatically has this permission.' }, 400)
    if (permissionKey === 'lead-management:view-all' && target.role === 'ADMIN') return json({ error: 'Administrators already have access to all leads.' }, 400)
    if (permissionKey === 'lead-management:reassign' && target.role !== 'SALES') return json({ error: 'Select an active SALES user. Administrators already have this permission.' }, 400)
    await db.prepare(`INSERT INTO user_special_permissions(user_id,permission_key,granted,updated_by)
      VALUES(?,?,?,?) ON CONFLICT(user_id,permission_key)
      DO UPDATE SET granted=excluded.granted,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .bind(body.userId, permissionKey, body.granted ? 1 : 0, actor.id).run()
    return json({ success: true })
  } catch {
    return json({ error: 'Unable to update special permissions.' }, 500)
  }
}
