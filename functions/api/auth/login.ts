import { verifyPassword } from '../../lib/password'
import {
  buildSessionCookie,
  generateSessionToken,
  getSessionExpiry,
  hashSessionToken,
} from '../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

interface LoginRequest {
  email?: unknown
  password?: unknown
}

interface AuthenticationRow {
  id: number
  email: string
  full_name: string
  password_hash: string
  password_salt: string
  role_id: number
  role_name: string
  user_status: string
  role_is_active: number
  session_version: number
  must_change_password: number
}

const ALL_MENU_KEYS = [
  'corrugated-box-price',
  'coc',
  'packing-slip',
  'coa',
  'admin-configurations',
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password'
const DUMMY_HASH = 'YBXf2d6MiFk522BmWn2oK1TWvXg7xlou/L+HtiRO75I='
const DUMMY_SALT = 'xGw6kBbLDs2oEL9GDm37Yw=='

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

async function getMenuAccess(env: Env, roleId: number, roleName: string): Promise<string[]> {
  if (roleName === 'SUPERADMIN') {
    return ALL_MENU_KEYS
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
    console.error('[d1-login] Unable to load menu access')
    return []
  }
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'POST' })
  }

  let body: LoginRequest
  try {
    const parsedBody: unknown = await context.request.json()
    body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody as LoginRequest
      : {}
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const errors: Record<string, string> = {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email must be a valid email address'

  if (!password) errors.password = 'Password is required'

  if (Object.keys(errors).length > 0) {
    return json({ success: false, error: 'Validation failed', details: errors }, 400)
  }

  try {
    const user = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        u.password_hash,
        u.password_salt,
        r.id AS role_id,
        r.name AS role_name,
        u.status AS user_status,
        r.is_active AS role_is_active,
        u.session_version,
        u.must_change_password
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.email = ?
      LIMIT 1`,
    ).bind(email).first<AuthenticationRow>()

    if (!user) {
      await verifyPassword(password, DUMMY_HASH, DUMMY_SALT)
      return json({ success: false, error: INVALID_CREDENTIALS_MESSAGE }, 401)
    }

    const passwordMatches = await verifyPassword(password, user.password_hash, user.password_salt)
    if (!passwordMatches) {
      return json({ success: false, error: INVALID_CREDENTIALS_MESSAGE }, 401)
    }

    if (user.user_status !== 'ACTIVE') {
      return json({ success: false, error: 'User account is inactive' }, 403)
    }

    if (user.role_is_active !== 1) {
      return json({ success: false, error: 'User role is inactive' }, 403)
    }

    const menuAccess = await getMenuAccess(context.env, user.role_id, user.role_name)

    let sessionCookie: string
    try {
      const sessionToken = generateSessionToken()
      const tokenHash = await hashSessionToken(sessionToken)
      const sessionResult = await context.env.DB.prepare(
        `INSERT INTO sessions (
          user_id, token_hash, session_version, expires_at, last_used_at, revoked_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
      ).bind(user.id, tokenHash, user.session_version, getSessionExpiry()).run()

      if (!sessionResult.success) throw new Error('Session insert failed')
      sessionCookie = buildSessionCookie(sessionToken, new URL(context.request.url).protocol === 'https:')
    } catch {
      console.error('[d1-login] Session creation failed')
      return json({ success: false, error: 'Unable to create session' }, 500)
    }

    // TEMPORARY_LEGACY_LOGIN must remain until the new D1 login, sessions, route protection and user management are verified and explicitly approved for cutover.
    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_name,
        status: user.user_status,
        sessionVersion: user.session_version,
        mustChangePassword: user.must_change_password === 1,
        menuAccess,
      },
    }, 200, { 'Set-Cookie': sessionCookie })
  } catch {
    console.error('[d1-login] Unexpected authentication error')
    return json({ success: false, error: 'Unable to authenticate' }, 500)
  }
}
