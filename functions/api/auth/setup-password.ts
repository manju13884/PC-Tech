import { hashPassword } from '../../lib/password'
import { hashSessionToken } from '../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

interface SetupPasswordRequest {
  token?: unknown
  password?: unknown
}

interface SetupTokenRow {
  id: number
  user_id: number
  expires_at: string
  used_at: string | null
  user_status: string
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
  if (password.length < 6) return 'Password must be at least 6 characters'
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

  let body: SetupPasswordRequest
  try {
    const parsedBody: unknown = await context.request.json()
    body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody as SetupPasswordRequest
      : {}
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!token) {
    return json({ success: false, error: 'Setup token is required' }, 400)
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    return json({ success: false, error: passwordError }, 400)
  }

  try {
    const tokenHash = await hashSessionToken(token)
    const setupToken = await context.env.DB.prepare(
      `SELECT
        pst.id,
        pst.user_id,
        pst.expires_at,
        pst.used_at,
        u.status AS user_status
      FROM password_setup_tokens pst
      INNER JOIN users u ON u.id = pst.user_id
      WHERE pst.token_hash = ?
      LIMIT 1`,
    ).bind(tokenHash).first<SetupTokenRow>()

    if (!setupToken) {
      return json({ success: false, error: 'Password setup link is invalid' }, 400)
    }

    if (setupToken.used_at !== null) {
      return json({ success: false, error: 'Password setup link has already been used' }, 400)
    }

    const expiresAt = Date.parse(setupToken.expires_at)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return json({ success: false, error: 'Password setup link has expired' }, 400)
    }

    if (setupToken.user_status === 'ACTIVE') {
      return json({ success: false, error: 'Password has already been set' }, 400)
    }

    const passwordData = await hashPassword(password)
    const updateResult = await context.env.DB.prepare(
      `UPDATE users
      SET password_hash = ?,
        password_salt = ?,
        status = 'ACTIVE',
        session_version = session_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    ).bind(passwordData.hash, passwordData.salt, setupToken.user_id).run()

    if (!updateResult.success || updateResult.meta.changes !== 1) {
      throw new Error('Password update failed')
    }

    await context.env.DB.prepare(
      'UPDATE password_setup_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).bind(setupToken.id).run()

    return json({ success: true }, 200)
  } catch {
    console.error('[setup-password] Unable to set password')
    return json({ success: false, error: 'Unable to set password' }, 500)
  }
}
