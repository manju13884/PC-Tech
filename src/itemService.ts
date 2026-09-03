export interface Item {
  item_id: string
  item_name: string
  sku: string
  description: string
}

let cachedItems: Item[] | null = null
let error: string | null = null
let refreshedAt: Date | null = null

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  } catch { /* Use the safe fallback for non-JSON responses. */ }
  return fallback
}

export function getItemsError(): string | null { return error }
export function getItemsRefreshedAt(): Date | null { return refreshedAt }

export async function getItems(): Promise<Item[]> {
  if (cachedItems) return cachedItems
  const response = await fetch('/api/items', { credentials: 'include' })
  if (!response.ok) {
    let message = 'Unable to load cached Zoho items.'
    try {
      const errorPayload: unknown = await response.json()
      if (errorPayload && typeof errorPayload === 'object' && typeof (errorPayload as { error?: unknown }).error === 'string') {
        message = (errorPayload as { error: string }).error
      }
    } catch {
      // Retain the concise fallback when the API does not return JSON.
    }
    throw new Error(message)
  }
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('Item response was not a list.')
  cachedItems = payload.filter((item): item is Item => Boolean(item) && typeof item === 'object')
  const cacheDate = response.headers.get('X-Item-Refreshed-At')
  refreshedAt = cacheDate ? new Date(cacheDate) : null
  return cachedItems
}

export async function refreshItems(): Promise<{ items: Item[]; refreshedAt: Date }> {
  error = null
  try {
    const response = await fetch('/api/items', { method: 'POST', credentials: 'include' })
    if (!response.ok) throw new Error(await responseError(response, `Unable to refresh items (${response.status})`))
    const payload = await response.json() as { items?: unknown; refreshedAt?: unknown }
    if (!Array.isArray(payload.items) || typeof payload.refreshedAt !== 'string') throw new Error('Invalid item refresh response')
    cachedItems = payload.items.filter((item): item is Item => Boolean(item) && typeof item === 'object')
    refreshedAt = new Date(payload.refreshedAt)
    return { items: cachedItems, refreshedAt }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Unable to refresh items'
    throw caught
  }
}
