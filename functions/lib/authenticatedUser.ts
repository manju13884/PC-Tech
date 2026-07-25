import { getSessionTokenFromRequest, hashSessionToken } from './session'

export interface AuthenticatedUser {
  id: number
  fullName: string
  roleId: number
  roleName: string
}

interface AuthenticatedUserRow {
  user_id: number
  user_full_name: string
  user_status: string
  user_session_version: number
  session_version: number
  session_expires_at: string
  session_revoked_at: string | null
  role_is_active: number
  role_id: number
  role_name: string
}

export async function getAuthenticatedUser(
  request: Request,
  db: D1Database,
): Promise<AuthenticatedUser | null> {
  const sessionToken = getSessionTokenFromRequest(request)
  if (!sessionToken) return null

  const tokenHash = await hashSessionToken(sessionToken)
  const row = await db.prepare(
    `SELECT
      u.id AS user_id,
      u.full_name AS user_full_name,
      u.status AS user_status,
      u.session_version AS user_session_version,
      s.session_version,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      r.is_active AS role_is_active
      , r.id AS role_id
      , r.name AS role_name
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`,
  ).bind(tokenHash).first<AuthenticatedUserRow>()

  if (
    !row
    || row.user_status !== 'ACTIVE'
    || row.role_is_active !== 1
    || row.session_revoked_at !== null
    || row.session_version !== row.user_session_version
    || !Number.isFinite(Date.parse(row.session_expires_at))
    || Date.parse(row.session_expires_at) <= Date.now()
  ) {
    return null
  }

  return {
    id: row.user_id,
    fullName: row.user_full_name,
    roleId: row.role_id,
    roleName: row.role_name,
  }
}
