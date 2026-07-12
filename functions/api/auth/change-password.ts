import { hashPassword } from '../../lib/password'
import { getSessionTokenFromRequest, hashSessionToken } from '../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

interface ChangePasswordRequest {
  password?: unknown
}

interface SessionRow {
  session_id: number
  session_expires_at: string
  session_revoked_at: string | null
  session_session_version: number
  user_id: number
  user_status: string
  user_session_version: number
}

const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'qwerty12345',
  'letmein1234',
  'superadmin',
])

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Password is too weak'

  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
  const groupsPresent = characterGroups.filter((pattern) => pattern.test(password)).length

  return groupsPresent >= 2
    ? null
    : 'Password must include characters from at least two of these groups: lowercase, uppercase, numbers, symbols'
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'POST' })
  }

  const sessionToken = getSessionTokenFromRequest(context.request)
  if (!sessionToken) {
    return json({ success: false, error: 'Authentication required' }, 401)
  }

  let body: ChangePasswordRequest
  try {
    const parsedBody: unknown = await context.request.json()
    body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody as ChangePasswordRequest
      : {}
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const passwordError = validatePassword(password)

  if (passwordError) {
    return json({ success: false, error: passwordError }, 400)
  }

  try {
    const tokenHash = await hashSessionToken(sessionToken)
    const session = await context.env.DB.prepare(
      `SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        s.revoked_at AS session_revoked_at,
        s.session_version AS session_session_version,
        u.id AS user_id,
        u.status AS user_status,
        u.session_version AS user_session_version
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1`,
    ).bind(tokenHash).first<SessionRow>()

    if (!session) {
      return json({ success: false, error: 'Authentication required' }, 401)
    }

    const expiresAt = Date.parse(session.session_expires_at)
    if (
      session.session_revoked_at !== null ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      session.session_session_version !== session.user_session_version
    ) {
      return json({ success: false, error: 'Authentication required' }, 401)
    }

    if (session.user_status !== 'ACTIVE') {
      return json({ success: false, error: 'User account is inactive' }, 403)
    }

    const passwordData = await hashPassword(password)
    const nextSessionVersion = session.user_session_version + 1
    const updateUser = await context.env.DB.prepare(
      `UPDATE users
      SET password_hash = ?,
        password_salt = ?,
        must_change_password = 0,
        session_version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    ).bind(passwordData.hash, passwordData.salt, nextSessionVersion, session.user_id).run()

    if (!updateUser.success || updateUser.meta.changes !== 1) {
      throw new Error('Password update failed')
    }

    await context.env.DB.prepare(
      'UPDATE sessions SET session_version = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(nextSessionVersion, session.session_id).run()

    return json({ success: true }, 200)
  } catch {
    console.error('[change-password] Unable to change password')
    return json({ success: false, error: 'Unable to change password' }, 500)
  }
}
