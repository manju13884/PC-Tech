export interface AdminAccessPermission {
  menuKey: string
  full: boolean
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  approve: boolean
}

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

function isAdminAccessPermission(value: unknown): value is AdminAccessPermission {
  if (!value || typeof value !== 'object') {
    return false
  }

  const access = value as Partial<AdminAccessPermission>

  return (
    typeof access.menuKey === 'string' &&
    typeof access.full === 'boolean' &&
    typeof access.view === 'boolean' &&
    typeof access.create === 'boolean' &&
    typeof access.edit === 'boolean' &&
    typeof access.delete === 'boolean' &&
    typeof access.approve === 'boolean'
  )
}

export function getAdminAccessError(): string | null {
  return error
}

export async function getAdminAccess(roleId: number): Promise<AdminAccessPermission[]> {
  error = null

  try {
    const params = new URLSearchParams({ role_id: String(roleId) })
    const response = await fetch(`/api/auth/access?${params.toString()}`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to load access (${response.status})`))
    }

    const data: unknown = await response.json()
    const access = data && typeof data === 'object'
      ? (data as { access?: unknown }).access
      : null

    if (!Array.isArray(access)) {
      throw new Error('Access response was not a list')
    }

    return access.filter(isAdminAccessPermission)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to load access'
    return []
  }
}

export async function updateRoleMenuAccess(
  roleId: number,
  menuKey: string,
  access: boolean,
): Promise<AdminAccessPermission> {
  const response = await fetch(`/api/auth/access/${roleId}/${menuKey}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ access }),
  })

  if (!response.ok) {
    throw new Error(await getResponseError(response, `Unable to update access (${response.status})`))
  }

  const data: unknown = await response.json()
  const updatedAccess = data && typeof data === 'object'
    ? (data as { access?: unknown }).access
    : null

  if (!isAdminAccessPermission(updatedAccess)) {
    throw new Error('Access response was invalid')
  }

  return updatedAccess
}
