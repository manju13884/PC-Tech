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
  user_id: number
  user_email: string
  user_full_name: string
  user_status: string
  user_session_version: number
  role_name: string
  role_is_active: number
}

const AUTHENTICATION_REQUIRED = 'Authentication required'

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function authenticationRequired(): Response {
  return json({ success: false, error: AUTHENTICATION_REQUIRED }, 401)
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET' })
  }

  const sessionToken = getSessionTokenFromRequest(context.request)
  if (!sessionToken) return authenticationRequired()

  try {
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

    // TEMPORARY_LEGACY_LOGIN must remain until the new D1 login, sessions, route protection and user management are verified and explicitly approved for cutover.
    return json({
      success: true,
      user: {
        id: session.user_id,
        email: session.user_email,
        fullName: session.user_full_name,
        role: session.role_name,
        status: session.user_status,
      },
    }, 200)
  } catch {
    console.error('[current-user] Unexpected session validation error')
    return json({ success: false, error: 'Unable to validate session' }, 500)
  }
}
