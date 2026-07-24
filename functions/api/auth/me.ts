import { getSessionTokenFromRequest, hashSessionToken } from '../../lib/session'

interface Env {
  DB?: D1Database
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
  user_id: number
  user_email: string
  user_full_name: string
  user_status: string
  user_session_version: number
  user_must_change_password: number
  role_id: number
  role_name: string
  role_is_active: number
}

const ALL_MENU_KEYS = [
  'corrugated-box-price',
  'corrugated-box-price-advanced',
  'corrugated-board-price',
  'paper-purchase-request',
  'coc',
  'packing-slip',
  'coa',
  'admin-configurations',
]
const AUTHENTICATION_REQUIRED = 'Authentication required'

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function authenticationRequired(): Response {
  return json({ success: false, error: AUTHENTICATION_REQUIRED }, 401)
}

async function getMenuAccess(env: Env, roleId: number, roleName: string): Promise<string[]> {
  if (roleName === 'SUPERADMIN') {
    return ALL_MENU_KEYS
  }

  if (!env.DB) {
    console.error('[current-user] Missing DB binding while loading menu access')
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT menu_key
      FROM role_menu_permissions
      WHERE role_id = ?
        AND (
          can_full = 1
          OR can_view = 1
          OR can_create = 1
          OR can_edit = 1
          OR can_delete = 1
          OR can_approve = 1
        )
      ORDER BY menu_key ASC`,
    ).bind(roleId).all<{ menu_key: string }>()

    if (!result.success) {
      throw new Error('Menu access query failed')
    }

    return result.results
      .map((row) => row.menu_key)
      .filter((menuKey) => menuKey !== 'admin-configurations')
  } catch {
    console.error('[current-user] Unable to load menu access')
    return []
  }
}

function getSafeCurrentUserError(caughtError: unknown): string {
  const message = caughtError instanceof Error ? caughtError.message : ''

  if (message.includes('DB binding') || message.includes('undefined')) {
    return 'Authentication database binding is missing in production.'
  }

  if (message.includes('must_change_password') || message.includes('no such column')) {
    return 'Database migration missing. Apply D1 migrations to production.'
  }

  if (message.includes('no such table') || message.includes('users') || message.includes('sessions')) {
    return 'Authentication database is not ready. Check production D1 binding and migrations.'
  }

  return 'Unable to validate session'
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET' })
  }

  const sessionToken = getSessionTokenFromRequest(context.request)
  if (!sessionToken) return authenticationRequired()

  try {
    if (!context.env.DB) {
      throw new Error('DB binding is missing')
    }

    const tokenHash = await hashSessionToken(sessionToken)
    const session = await context.env.DB.prepare(
      `SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        s.revoked_at AS session_revoked_at,
        s.session_version AS session_session_version,
        u.id AS user_id,
        u.email AS user_email,
        u.full_name AS user_full_name,
        u.status AS user_status,
        u.session_version AS user_session_version,
        u.must_change_password AS user_must_change_password,
        r.id AS role_id,
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

    const updateResult = await context.env.DB.prepare(
      'UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(session.session_id).run()

    if (!updateResult.success || updateResult.meta.changes !== 1) {
      throw new Error('Session last-used update failed')
    }

    const menuAccess = await getMenuAccess(context.env, session.role_id, session.role_name)

    // TEMPORARY_LEGACY_LOGIN must remain until the new D1 login, sessions, route protection and user management are verified and explicitly approved for cutover.
    return json({
      success: true,
      user: {
        id: session.user_id,
        email: session.user_email,
        fullName: session.user_full_name,
        role: session.role_name,
        status: session.user_status,
        mustChangePassword: session.user_must_change_password === 1,
        menuAccess,
      },
    }, 200)
  } catch (caughtError) {
    console.error('[current-user] Unexpected session validation error')
    return json({ success: false, error: getSafeCurrentUserError(caughtError) }, 500)
  }
}
