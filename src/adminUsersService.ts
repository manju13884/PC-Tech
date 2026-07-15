export interface AdminUser {
  id: number
  email: string
  mobileNo: string
  fullName: string
  role: string
  status: string
  sessionVersion: number
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAdminUserResult {
  user: AdminUser
}

let loading = false
let error: string | null = null

async function getResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()

    if (payload && typeof payload === 'object') {
      const errorPayload = payload as { error?: unknown; message?: unknown }

      if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) {
        return errorPayload.error
      }

      if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) {
        return errorPayload.message
      }
    }
  } catch {
    // Fall back to the status-based message when the response body is not JSON.
  }

  return fallback
}

function isAdminUser(value: unknown): value is AdminUser {
  if (!value || typeof value !== 'object') {
    return false
  }

  const user = value as Partial<AdminUser>

  return (
    typeof user.id === 'number' &&
    typeof user.email === 'string' &&
    typeof user.mobileNo === 'string' &&
    typeof user.fullName === 'string' &&
    typeof user.role === 'string' &&
    typeof user.status === 'string' &&
    typeof user.sessionVersion === 'number' &&
    typeof user.mustChangePassword === 'boolean' &&
    typeof user.createdAt === 'string' &&
    typeof user.updatedAt === 'string'
  )
}

export function isAdminUsersLoading(): boolean {
  return loading
}

export function getAdminUsersError(): string | null {
  return error
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  loading = true
  error = null

  try {
    const response = await fetch('/api/auth/users', { credentials: 'include' })

    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to load users (${response.status})`))
    }

    const data: unknown = await response.json()
    const users = data && typeof data === 'object'
      ? (data as { users?: unknown }).users
      : null

    if (!Array.isArray(users)) {
      throw new Error('User response was not a list')
    }

    return users.filter(isAdminUser)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to load users'
    return []
  } finally {
    loading = false
  }
}

async function readUserResponse(response: Response): Promise<AdminUser> {
  const data: unknown = await response.json()
  const user = data && typeof data === 'object'
    ? (data as { user?: unknown }).user
    : null

  if (!isAdminUser(user)) {
    throw new Error('User response was invalid')
  }

  return user
}

export async function updateAdminUser(
  userId: number,
  values: { email: string; mobileNo: string; fullName: string; role: string },
): Promise<AdminUser> {
  const response = await fetch(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(values),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to update user (${response.status})`))
  }

  return readUserResponse(response)
}

export async function deactivateAdminUser(userId: number): Promise<AdminUser> {
  const response = await fetch(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ status: 'INACTIVE' }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to deactivate user (${response.status})`))
  }

  return readUserResponse(response)
}

export async function activateAdminUser(userId: number): Promise<AdminUser> {
  const response = await fetch(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to activate user (${response.status})`))
  }

  return readUserResponse(response)
}

export async function resetAdminUserPassword(userId: number): Promise<AdminUser> {
  const response = await fetch(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ resetPassword: true }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to reset password (${response.status})`))
  }

  return readUserResponse(response)
}

export async function createAdminUser(values: {
  fullName: string
  email: string
  mobileNo: string
  role: string
}): Promise<CreateAdminUserResult> {
  const response = await fetch('/api/auth/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(values),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to create user (${response.status})`))
  }

  const data: unknown = await response.json()
  const user = data && typeof data === 'object'
    ? (data as { user?: unknown }).user
    : null
  if (!isAdminUser(user)) {
    throw new Error('Create user response was invalid')
  }

  return {
    user,
  }
}
