import { getSessionTokenFromRequest, hashSessionToken } from '../../lib/session'
import { hashPassword } from '../../lib/password'

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

interface UserRow {
  id: number
  email: string
  full_name: string
  role_name: string
  status: string
  session_version: number
  must_change_password: number
  created_at: string
  updated_at: string
}

interface UserCreateRequest {
  email?: unknown
  fullName?: unknown
  role?: unknown
}

interface RoleRow {
  id: number
  name: string
  is_active: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function getDefaultPassword(fullName: string): string {
  return `${fullName.replace(/\s+/g, '')}@123$`
}

function mapUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role_name,
    status: user.status,
    sessionVersion: user.session_version,
    mustChangePassword: user.must_change_password === 1,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }
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

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })
  }

  try {
    const authError = await requireSuperadmin(context)
    if (authError) return authError

    if (context.request.method === 'POST') {
      let body: UserCreateRequest
      try {
        const parsedBody: unknown = await context.request.json()
        body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
          ? parsedBody as UserCreateRequest
          : {}
      } catch {
        return json({ success: false, error: 'Request body must be valid JSON' }, 400)
      }

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
      const roleName = typeof body.role === 'string' ? body.role.trim().toUpperCase() : ''

      if (!EMAIL_PATTERN.test(email)) {
        return json({ success: false, error: 'Email must be a valid email address' }, 400)
      }

      if (!fullName) {
        return json({ success: false, error: 'Name is required' }, 400)
      }

      const role = await context.env.DB.prepare(
        'SELECT id, name, is_active FROM roles WHERE name = ? LIMIT 1',
      ).bind(roleName).first<RoleRow>()

      if (!role) {
        return json({ success: false, error: 'Role not found' }, 400)
      }

      if (role.is_active !== 1) {
        return json({ success: false, error: 'Cannot assign an inactive role' }, 400)
      }

      const existingEmail = await context.env.DB.prepare(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
      ).bind(email).first<{ id: number }>()

      if (existingEmail) {
        return json({ success: false, error: 'A user with this email already exists' }, 409)
      }

      const defaultPassword = getDefaultPassword(fullName)
      const passwordData = await hashPassword(defaultPassword)
      const user = await context.env.DB.prepare(
        `INSERT INTO users (
          email,
          full_name,
          password_hash,
          password_salt,
          role_id,
          status,
          session_version,
          must_change_password,
          created_by,
          updated_by
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, 1, NULL, NULL)
        RETURNING id, email, full_name, status, session_version, must_change_password, created_at, updated_at`,
      ).bind(email, fullName, passwordData.hash, passwordData.salt, role.id).first<Omit<UserRow, 'role_name'>>()

      if (!user) {
        throw new Error('User insert did not return a record')
      }

      return json({
        success: true,
        user: mapUser({ ...user, role_name: role.name }),
      }, 201)
    }

    const result = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        r.name AS role_name,
        u.status,
        u.session_version,
        u.must_change_password,
        u.created_at,
        u.updated_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at ASC, u.id ASC`,
    ).all<UserRow>()

    if (!result.success) {
      throw new Error('User list query failed')
    }

    return json({
      success: true,
      users: result.results.map(mapUser),
    }, 200)
  } catch {
    console.error('[admin-users] Unable to load users')
    return json({ success: false, error: 'Unable to load users' }, 500)
  }
}
