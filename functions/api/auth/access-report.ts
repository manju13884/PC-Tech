import { getAuthenticatedUser } from '../../lib/authenticatedUser'

export const onRequest: PagesFunction<{ DB: D1Database }> = async ({ request, env }) => {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } })
  try {
    const user = await getAuthenticatedUser(request, env.DB)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })
    if (user.roleName !== 'SUPERADMIN') return Response.json({ error: 'SUPERADMIN access required' }, { status: 403 })
    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1)
    if (!Number.isSafeInteger(page) || page > 1000000) return Response.json({ error: 'Invalid page' }, { status: 400 })
    const result = await env.DB.prepare(`SELECT s.id, u.full_name AS fullName, u.email,
      s.created_at AS loginAt,
      CASE WHEN s.system_ended_at IS NOT NULL THEN s.system_ended_at
        WHEN s.revoked_at IS NOT NULL AND julianday(s.revoked_at) < julianday(s.expires_at) THEN s.revoked_at
        WHEN julianday(s.expires_at) <= julianday('now') THEN s.expires_at
        ELSE NULL END AS logoutAt,
      CASE WHEN s.system_ended_at IS NOT NULL THEN 'System logout'
        WHEN s.revoked_at IS NOT NULL AND julianday(s.revoked_at) < julianday(s.expires_at)
          THEN CASE s.logout_type WHEN 'USER' THEN 'User logout' WHEN 'SYSTEM' THEN 'System logout' ELSE 'Unknown' END
        WHEN julianday(s.expires_at) <= julianday('now') THEN 'System logout'
        WHEN s.session_version <> u.session_version OR u.status <> 'ACTIVE' OR r.is_active <> 1 THEN 'Unknown'
        ELSE 'Active' END AS logoutType
      FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
      ORDER BY s.created_at DESC, s.id DESC LIMIT 51 OFFSET ?`).bind((page - 1) * 50).all()
    if (!result.success) throw new Error('Report query failed')
    return Response.json({ records: result.results.slice(0, 50), hasMore: result.results.length > 50 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[access-report] Unable to load access report', error)
    return Response.json({ error: 'Unable to load access report' }, { status: 500 })
  }
}
