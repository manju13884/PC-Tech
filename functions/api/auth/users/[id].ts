import { hashPassword } from '../../../lib/password'
import { getSessionTokenFromRequest, hashSessionToken } from '../../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
  params: {
    id?: string | string[]
  }
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
  mobile_no: string
  full_name: string
  role_id: number
  role_name: string
  status: string
  session_version: number
  must_change_password: number
  created_at: string
  updated_at: string
}

interface UserUpdateRequest {
  email?: unknown
  mobileNo?: unknown
  fullName?: unknown
  role?: unknown
  status?: unknown
  resetPassword?: unknown
}

interface RoleRow {
  id: number
  name: string
  is_active: number
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MOBILE_NO_PATTERN = /^\d{10}$/

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function getDefaultPassword(fullName: string): string {
  return `${fullName.replace(/\s+/g, '')}@123$`
}

function authenticationRequired(): Response {
  return json({ success: false, error: 'Authentication required' }, 401)
}

function mapUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    mobileNo: user.mobile_no,
    fullName: user.full_name,
    role: user.role_name,
    status: user.status,
    sessionVersion: user.session_version,
    mustChangePassword: user.must_change_password === 1,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }
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
  if (context.request.method !== 'PATCH') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'PATCH' })
  }

  try {
    const authError = await requireSuperadmin(context)
    if (authError) return authError

    const idParam = Array.isArray(context.params.id) ? context.params.id[0] : context.params.id
    const userId = Number(idParam)

    if (!Number.isInteger(userId) || userId <= 0) {
      return json({ success: false, error: 'User id is invalid' }, 400)
    }

    let body: UserUpdateRequest
    try {
      const parsedBody: unknown = await context.request.json()
      body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
        ? parsedBody as UserUpdateRequest
        : {}
    } catch {
      return json({ success: false, error: 'Request body must be valid JSON' }, 400)
    }

    const existingUser = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.mobile_no,
        u.full_name,
        u.role_id,
        r.name AS role_name,
        u.status,
        u.session_version,
        u.must_change_password,
        u.created_at,
        u.updated_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1`,
    ).bind(userId).first<UserRow>()

    if (!existingUser) {
      return json({ success: false, error: 'User not found' }, 404)
    }

    const nextEmail = typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : existingUser.email
    const nextMobileNo = typeof body.mobileNo === 'string'
      ? body.mobileNo.trim()
      : existingUser.mobile_no
    const nextFullName = typeof body.fullName === 'string'
      ? body.fullName.trim()
      : existingUser.full_name
    const nextRoleName = typeof body.role === 'string'
      ? body.role.trim().toUpperCase()
      : existingUser.role_name
    const nextStatus = typeof body.status === 'string'
      ? body.status.trim().toUpperCase()
      : existingUser.status

    if (!EMAIL_PATTERN.test(nextEmail)) {
      return json({ success: false, error: 'Email must be a valid email address' }, 400)
    }

    if (!nextFullName) {
      return json({ success: false, error: 'Full name is required' }, 400)
    }

    if (body.mobileNo !== undefined && !nextMobileNo) {
      return json({ success: false, error: 'Mobile No. is required' }, 400)
    }

    if (body.mobileNo !== undefined && !MOBILE_NO_PATTERN.test(nextMobileNo)) {
      return json({ success: false, error: 'Mobile No. must contain exactly 10 digits' }, 400)
    }

    if (nextStatus !== 'ACTIVE' && nextStatus !== 'INACTIVE') {
      return json({ success: false, error: 'Status must be ACTIVE or INACTIVE' }, 400)
    }

    const nextRole = await context.env.DB.prepare(
      'SELECT id, name, is_active FROM roles WHERE name = ? LIMIT 1',
    ).bind(nextRoleName).first<RoleRow>()

    if (!nextRole) {
      return json({ success: false, error: 'Role not found' }, 400)
    }

    if (nextRole.is_active !== 1) {
      return json({ success: false, error: 'Cannot assign an inactive role' }, 400)
    }

    if (existingUser.role_name === 'SUPERADMIN' && nextStatus !== 'ACTIVE') {
      return json({ success: false, error: 'SUPERADMIN user cannot be deactivated' }, 400)
    }

    if (existingUser.role_name === 'SUPERADMIN' && nextRole.name !== 'SUPERADMIN') {
      return json({ success: false, error: 'SUPERADMIN user role cannot be changed' }, 400)
    }

    const duplicateEmail = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
    ).bind(nextEmail, userId).first<{ id: number }>()

    if (duplicateEmail) {
      return json({ success: false, error: 'A user with this email already exists' }, 409)
    }

    if (body.resetPassword === true) {
      const defaultPassword = getDefaultPassword(existingUser.full_name)
      const passwordData = await hashPassword(defaultPassword)
      const updatedUser = await context.env.DB.prepare(
        `UPDATE users
        SET password_hash = ?,
          password_salt = ?,
          must_change_password = 1,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING
          id,
          email,
          mobile_no,
          full_name,
          role_id,
          ? AS role_name,
          status,
          session_version,
          must_change_password,
          created_at,
          updated_at`,
      ).bind(passwordData.hash, passwordData.salt, userId, existingUser.role_name).first<UserRow>()

      if (!updatedUser) {
        throw new Error('Password reset did not return a record')
      }

      return json({ success: true, user: mapUser(updatedUser) }, 200)
    }

    const isActivatingUser = existingUser.status === 'INACTIVE' && nextStatus === 'ACTIVE'
    const securityChanged = (
      nextRole.id !== existingUser.role_id ||
      nextStatus !== existingUser.status ||
      isActivatingUser
    )
    const nextSessionVersion = securityChanged
      ? existingUser.session_version + 1
      : existingUser.session_version

    if (isActivatingUser) {
      const defaultPassword = getDefaultPassword(nextFullName)
      const passwordData = await hashPassword(defaultPassword)
      const updatedUser = await context.env.DB.prepare(
        `UPDATE users
        SET email = ?,
          mobile_no = ?,
          full_name = ?,
          password_hash = ?,
          password_salt = ?,
          role_id = ?,
          status = ?,
          must_change_password = 1,
          session_version = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING
          id,
          email,
          mobile_no,
          full_name,
          role_id,
          ? AS role_name,
          status,
          session_version,
          must_change_password,
          created_at,
          updated_at`,
      ).bind(
        nextEmail,
        nextMobileNo,
        nextFullName,
        passwordData.hash,
        passwordData.salt,
        nextRole.id,
        nextStatus,
        nextSessionVersion,
        userId,
        nextRole.name,
      ).first<UserRow>()

      if (!updatedUser) {
        throw new Error('User activation did not return a record')
      }

      return json({ success: true, user: mapUser(updatedUser) }, 200)
    }

    const updatedUser = await context.env.DB.prepare(
      `UPDATE users
      SET email = ?,
        mobile_no = ?,
        full_name = ?,
        role_id = ?,
        status = ?,
        session_version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING
        id,
        email,
        mobile_no,
        full_name,
        role_id,
        ? AS role_name,
        status,
        session_version,
        must_change_password,
        created_at,
        updated_at`,
    ).bind(
      nextEmail,
      nextMobileNo,
      nextFullName,
      nextRole.id,
      nextStatus,
      nextSessionVersion,
      userId,
      nextRole.name,
    ).first<UserRow>()

    if (!updatedUser) {
      throw new Error('User update did not return a record')
    }

    return json({ success: true, user: mapUser(updatedUser) }, 200)
  } catch {
    console.error('[admin-user-update] Unable to update user')
    return json({ success: false, error: 'Unable to update user' }, 500)
  }
}
