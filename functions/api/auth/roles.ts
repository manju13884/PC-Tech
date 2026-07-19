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

interface RoleRow {
  id: number
  name: string
  description: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface RoleCreateRequest {
  name?: unknown
  description?: unknown
  status?: unknown
}

const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

function authenticationRequired(): Response {
  return json({ success: false, error: 'Authentication required' }, 401)
}

function mapRole(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? '',
    status: role.is_active === 1 ? 'ACTIVE' : 'INACTIVE',
    createdAt: role.created_at,
    updatedAt: role.updated_at,
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
  if (context.request.method !== 'GET' && context.request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'GET, POST' })
  }

  try {
    const authError = await requireSuperadmin(context)
    if (authError) return authError

    if (context.request.method === 'POST') {
      let body: RoleCreateRequest
      try {
        const parsedBody: unknown = await context.request.json()
        body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
          ? parsedBody as RoleCreateRequest
          : {}
      } catch {
        return json({ success: false, error: 'Request body must be valid JSON' }, 400)
      }

      const name = typeof body.name === 'string' ? body.name.trim().toUpperCase() : ''
      const description = typeof body.description === 'string' ? body.description.trim() : ''
      const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : ''

      if (!name) {
        return json({ success: false, error: 'Role name is required' }, 400)
      }

      if (!ROLE_NAME_PATTERN.test(name)) {
        return json({
          success: false,
          error: 'Role name must use uppercase letters, numbers or underscore and be at least 2 characters',
        }, 400)
      }

      if (description.length > 300) {
        return json({ success: false, error: 'Role description must be 300 characters or fewer' }, 400)
      }

      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        return json({ success: false, error: 'Role status must be ACTIVE or INACTIVE' }, 400)
      }

      const duplicateRole = await context.env.DB.prepare(
        'SELECT id FROM roles WHERE UPPER(name) = ? LIMIT 1',
      ).bind(name).first<{ id: number }>()

      if (duplicateRole) {
        return json({ success: false, error: 'A role with this name already exists' }, 409)
      }

      try {
        const createdRole = await context.env.DB.prepare(
          `INSERT INTO roles (name, description, is_active)
          VALUES (?, ?, ?)
          RETURNING id, name, description, is_active, created_at, updated_at`,
        ).bind(name, description, status === 'ACTIVE' ? 1 : 0).first<RoleRow>()

        if (!createdRole) {
          throw new Error('Role insert did not return a record')
        }

        return json({ success: true, role: mapRole(createdRole) }, 201)
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message.toLowerCase() : ''
        if (message.includes('unique') || message.includes('constraint')) {
          return json({ success: false, error: 'A role with this name already exists' }, 409)
        }
        throw caughtError
      }
    }

    const result = await context.env.DB.prepare(
      `SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM roles
      ORDER BY created_at ASC, id ASC`,
    ).all<RoleRow>()

    if (!result.success) {
      throw new Error('Role list query failed')
    }

    return json({
      success: true,
      roles: result.results.map(mapRole),
    }, 200)
  } catch {
    const isCreateRequest = context.request.method === 'POST'
    console.error(isCreateRequest ? '[admin-roles] Unable to create role' : '[admin-roles] Unable to load roles')
    return json({
      success: false,
      error: isCreateRequest ? 'Unable to create role' : 'Unable to load roles',
    }, 500)
  }
}
