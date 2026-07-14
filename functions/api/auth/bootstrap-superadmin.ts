import { hashPassword } from '../../lib/password'

interface Env {
  DB: D1Database
  BOOTSTRAP_SECRET: string
}

interface BootstrapRequest {
  email?: unknown
  fullName?: unknown
  password?: unknown
}

interface FunctionContext {
  request: Request
  env: Env
}

interface RoleRow {
  id: number
}

interface UserRow {
  id: number
  email: string
  full_name: string
  status: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'qwerty12345',
  'letmein1234',
  'superadmin',
])

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status })
}

function secretsMatch(submitted: string | null, expected: string | undefined): boolean {
  if (!submitted || !expected) return false

  const submittedBytes = new TextEncoder().encode(submitted)
  const expectedBytes = new TextEncoder().encode(expected)
  let difference = submittedBytes.length ^ expectedBytes.length
  const length = Math.max(submittedBytes.length, expectedBytes.length)

  for (let index = 0; index < length; index += 1) {
    difference |= (submittedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0)
  }

  return difference === 0
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
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const submittedSecret = context.request.headers.get('X-Bootstrap-Secret')
  if (!secretsMatch(submittedSecret, context.env.BOOTSTRAP_SECRET)) {
    return json({ success: false, error: 'Forbidden' }, 403)
  }

  let body: BootstrapRequest
  try {
    body = (await context.request.json()) as BootstrapRequest
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const errors: Record<string, string> = {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email) errors.email = 'Email is required'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email must be a valid email address'

  if (!fullName) errors.fullName = 'Full name is required'

  if (!password) errors.password = 'Password is required'
  else {
    const passwordError = validatePassword(password)
    if (passwordError) errors.password = passwordError
  }

  if (Object.keys(errors).length > 0) {
    return json({ success: false, error: 'Validation failed', details: errors }, 400)
  }

  try {
    const role = await context.env.DB.prepare(
      "SELECT id FROM roles WHERE name = 'SUPERADMIN' AND is_active = 1 LIMIT 1",
    ).first<RoleRow>()

    if (!role) {
      return json({ success: false, error: 'Active SUPERADMIN role not found' }, 500)
    }

    const existingSuperadmin = await context.env.DB.prepare(
      'SELECT u.id FROM users u WHERE u.role_id = ? LIMIT 1',
    ).bind(role.id).first<{ id: number }>()

    if (existingSuperadmin) {
      return json({ success: false, error: 'A SUPERADMIN user already exists' }, 409)
    }

    const existingEmail = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
    ).bind(email).first<{ id: number }>()

    if (existingEmail) {
      return json({ success: false, error: 'A user with this email already exists' }, 409)
    }

    const passwordData = await hashPassword(password)
    const user = await context.env.DB.prepare(
      `INSERT INTO users (
        email, full_name, password_hash, password_salt, role_id, status,
        session_version, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, NULL, NULL)
      RETURNING id, email, full_name, status`,
    ).bind(email, fullName, passwordData.hash, passwordData.salt, role.id).first<UserRow>()

    if (!user) throw new Error('User insert did not return a record')

    // TEMPORARY_LEGACY_LOGIN must remain until the new D1 login is verified and explicitly approved for cutover.
    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: 'SUPERADMIN',
        status: user.status,
      },
    }, 201)
  } catch (error) {
    console.error('[bootstrap-superadmin] database operation failed', {
      message: error instanceof Error ? error.message : 'Unknown database error',
    })
    return json({ success: false, error: 'Unable to create SUPERADMIN user' }, 500)
  }
}
