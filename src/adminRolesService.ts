export interface AdminRole {
  id: number
  name: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
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

function isAdminRole(value: unknown): value is AdminRole {
  if (!value || typeof value !== 'object') {
    return false
  }

  const role = value as Partial<AdminRole>

  return (
    typeof role.id === 'number' &&
    typeof role.name === 'string' &&
    typeof role.description === 'string' &&
    typeof role.status === 'string' &&
    typeof role.createdAt === 'string' &&
    typeof role.updatedAt === 'string'
  )
}

export function getAdminRolesError(): string | null {
  return error
}

export async function getAdminRoles(): Promise<AdminRole[]> {
  loading = true
  error = null

  try {
    const response = await fetch('/api/auth/roles', { credentials: 'include' })

    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to load roles (${response.status})`))
    }

    const data: unknown = await response.json()
    const roles = data && typeof data === 'object'
      ? (data as { roles?: unknown }).roles
      : null

    if (!Array.isArray(roles)) {
      throw new Error('Role response was not a list')
    }

    return roles.filter(isAdminRole)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to load roles'
    return []
  } finally {
    loading = false
  }
}

async function readRoleResponse(response: Response): Promise<AdminRole> {
  const data: unknown = await response.json()
  const role = data && typeof data === 'object'
    ? (data as { role?: unknown }).role
    : null

  if (!isAdminRole(role)) {
    throw new Error('Role response was invalid')
  }

  return role
}

export async function updateAdminRole(
  roleId: number,
  values: { name: string; description: string },
): Promise<AdminRole> {
  const response = await fetch(`/api/auth/roles/${roleId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(values),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to update role (${response.status})`))
  }

  return readRoleResponse(response)
}

export async function createAdminRole(values: {
  name: string
  description: string
  status: 'ACTIVE' | 'INACTIVE'
}): Promise<AdminRole> {
  const response = await fetch('/api/auth/roles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(values),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to create role (${response.status})`))
  }

  return readRoleResponse(response)
}

export async function deactivateAdminRole(roleId: number): Promise<AdminRole> {
  const response = await fetch(`/api/auth/roles/${roleId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ isActive: false }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to deactivate role (${response.status})`))
  }

  return readRoleResponse(response)
}
