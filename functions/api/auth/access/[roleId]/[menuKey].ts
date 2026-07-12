import { getSessionTokenFromRequest, hashSessionToken } from '../../../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
  params: {
    roleId?: string | string[]
    menuKey?: string | string[]
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

interface PermissionRow {
  menu_key: string
  can_full: number
  can_view: number
  can_create: number
  can_edit: number
  can_delete: number
  can_approve: number
}

interface PermissionUpdateRequest {
  access?: unknown
  permission?: unknown
  value?: unknown
}

const ALLOWED_MENU_KEYS = new Set([
  'corrugated-box-price',
  'coc',
  'packing-slip',
  'coa',
  'admin-configurations',
])
const PERMISSION_COLUMNS = {
  full: 'can_full',
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  approve: 'can_approve',
} as const

type PermissionName = keyof typeof PERMISSION_COLUMNS

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

function isPermissionName(value: unknown): value is PermissionName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSION_COLUMNS, value)
}

function getSafeAccessUpdateError(caughtError: unknown): string {
  const message = caughtError instanceof Error ? caughtError.message : ''

  if (message.includes('role_menu_permissions') || message.includes('no such table')) {
    return 'Access permissions table is missing. Apply the D1 migrations to production.'
  }

  return 'Unable to update access'
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'PATCH') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'PATCH' })
  }

  try {
    const authError = await requireSuperadmin(context)
    if (authError) return authError

    const roleIdParam = Array.isArray(context.params.roleId) ? context.params.roleId[0] : context.params.roleId
    const menuKeyParam = Array.isArray(context.params.menuKey) ? context.params.menuKey[0] : context.params.menuKey
    const roleId = Number(roleIdParam)
    const menuKey = typeof menuKeyParam === 'string' ? menuKeyParam : ''

    if (!Number.isInteger(roleId) || roleId <= 0) {
      return json({ success: false, error: 'Role id is invalid' }, 400)
    }

    if (!ALLOWED_MENU_KEYS.has(menuKey)) {
      return json({ success: false, error: 'Menu key is invalid' }, 400)
    }

    let body: PermissionUpdateRequest
    try {
      const parsedBody: unknown = await context.request.json()
      body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
        ? parsedBody as PermissionUpdateRequest
        : {}
    } catch {
      return json({ success: false, error: 'Request body must be valid JSON' }, 400)
    }

    if (typeof body.access !== 'boolean') {
      if (!isPermissionName(body.permission)) {
        return json({ success: false, error: 'Permission is invalid' }, 400)
      }

      if (typeof body.value !== 'boolean') {
        return json({ success: false, error: 'Permission value must be true or false' }, 400)
      }
    }

    const role = await context.env.DB.prepare(
      'SELECT id, name FROM roles WHERE id = ? LIMIT 1',
    ).bind(roleId).first<{ id: number; name: string }>()

    if (!role) {
      return json({ success: false, error: 'Role not found' }, 404)
    }

    const requestedAccessValue = typeof body.access === 'boolean' ? body.access : body.value

    if (menuKey === 'admin-configurations' && role.name !== 'SUPERADMIN' && requestedAccessValue === true) {
      return json({ success: false, error: 'Access Management is restricted to SUPERADMIN' }, 400)
    }

    if (role.name === 'SUPERADMIN' && (body.access === false || body.value === false)) {
      return json({ success: false, error: 'SUPERADMIN access cannot be revoked' }, 400)
    }

    if (typeof body.access === 'boolean') {
      const accessValue = body.access ? 1 : 0
      const updated = await context.env.DB.prepare(
        `INSERT INTO role_menu_permissions (
          role_id,
          menu_key,
          can_full,
          can_view,
          can_create,
          can_edit,
          can_delete,
          can_approve,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(role_id, menu_key) DO UPDATE SET
          can_full = excluded.can_full,
          can_view = excluded.can_view,
          can_create = excluded.can_create,
          can_edit = excluded.can_edit,
          can_delete = excluded.can_delete,
          can_approve = excluded.can_approve,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          menu_key,
          can_full,
          can_view,
          can_create,
          can_edit,
          can_delete,
          can_approve`,
      ).bind(
        roleId,
        menuKey,
        accessValue,
        accessValue,
        accessValue,
        accessValue,
        accessValue,
        accessValue,
      ).first<PermissionRow>()

      if (!updated) {
        throw new Error('Access update did not return a record')
      }

      return json({ success: true, access: mapPermission(updated) }, 200)
    }

    const permission = body.permission
    const column = PERMISSION_COLUMNS[permission]
    const permissionValue = body.value ? 1 : 0
    const updated = await context.env.DB.prepare(
      `INSERT INTO role_menu_permissions (
        role_id,
        menu_key,
        ${column},
        created_at,
        updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(role_id, menu_key) DO UPDATE SET
        ${column} = excluded.${column},
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        menu_key,
        can_full,
        can_view,
        can_create,
        can_edit,
        can_delete,
        can_approve`,
    ).bind(roleId, menuKey, permissionValue).first<PermissionRow>()

    if (!updated) {
      throw new Error('Permission update did not return a record')
    }

    return json({ success: true, access: mapPermission(updated) }, 200)
  } catch (caughtError) {
    console.error('[admin-access-update] Unable to update access')
    return json({ success: false, error: getSafeAccessUpdateError(caughtError) }, 500)
  }
}
