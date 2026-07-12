import { getSessionTokenFromRequest, hashSessionToken } from '../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

interface AuthenticatedSessionRow {
  session_id: number
  session_expires_at: string
  session_revoked_at: string | null
  session_session_version: number
  user_status: string
  user_session_version: number
  role_name: string
  role_is_active: number
}

interface PermissionRow {
  menu_key: string
  can_full: number
  can_view: number
  can_create: number
  can_edit: number
  can_delete: number
  can_approve: number
}

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function authenticationRequired(): Response {
  return json({ success: false, error: 'Authentication required' }, 401)
}

async function requireSuperadmin(context: FunctionContext): Promise<Response | null> {
  const sessionToken = getSessionTokenFromRequest(context.request)
  if (!sessionToken) return authenticationRequired()

  const tokenHash = await hashSessionToken(sessionToken)
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`,
  ).bind(tokenHash).first<AuthenticatedSessionRow>()

  if (!session) return authenticationRequired()

  const expiresAt = Date.parse(session.session_expires_at)
  if (
    session.session_revoked_at !== null
    || !Number.isFinite(expiresAt)
    || expiresAt <= Date.now()
    || session.session_session_version !== session.user_session_version
  ) {
    return authenticationRequired()
  }

  if (session.user_status !== 'ACTIVE') {
    return json({ success: false, error: 'User account is inactive' }, 403)
  }

  if (session.role_is_active !== 1) {
    return json({ success: false, error: 'User role is inactive' }, 403)
  }

  if (session.role_name !== 'SUPERADMIN') {
    return json({ success: false, error: 'SUPERADMIN access required' }, 403)
  }

  await context.env.DB.prepare(
    'UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).bind(session.session_id).run()

  return null
}

function mapPermission(row: PermissionRow) {
  return {
    menuKey: row.menu_key,
    full: row.can_full === 1,
    view: row.can_view === 1,
    create: row.can_create === 1,
    edit: row.can_edit === 1,
    delete: row.can_delete === 1,
    approve: row.can_approve === 1,
  }
}

function getSafeAccessError(caughtError: unknown): string {
  const message = caughtError instanceof Error ? caughtError.message : ''

  if (message.includes('role_menu_permissions') || message.includes('no such table')) {
    return 'Access permissions table is missing. Apply the D1 migrations to production.'
  }

  return 'Unable to load access'
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET' })
  }

  try {
    const authError = await requireSuperadmin(context)
    if (authError) return authError

    const url = new URL(context.request.url)
    const roleId = Number(url.searchParams.get('role_id'))

    if (!Number.isInteger(roleId) || roleId <= 0) {
      return json({ success: false, error: 'Role id is required' }, 400)
    }

    const result = await context.env.DB.prepare(
      `SELECT
        menu_key,
        can_full,
        can_view,
        can_create,
        can_edit,
        can_delete,
        can_approve
      FROM role_menu_permissions
      WHERE role_id = ?
      ORDER BY menu_key ASC`,
    ).bind(roleId).all<PermissionRow>()

    if (!result.success) {
      throw new Error('Access list query failed')
    }

    return json({
      success: true,
      access: result.results.map(mapPermission),
    }, 200)
  } catch (caughtError) {
    console.error('[admin-access] Unable to load access')
    return json({ success: false, error: getSafeAccessError(caughtError) }, 500)
  }
}
