import { zohoGet, type ZohoEnv } from './zoho'

interface ZohoItem {
  item_id?: string | number
  name?: string
  item_name?: string
  sku?: string
  description?: string
  status?: string
}

interface ZohoItemsResponse {
  items?: unknown[]
  data?: unknown[]
  page_context?: { has_more_page?: boolean }
}

export interface ItemSummary {
  item_id: string
  item_name: string
  sku: string
  description: string
}

const ITEMS_PER_PAGE = 200

export async function getZohoItems(env?: ZohoEnv): Promise<ItemSummary[]> {
  const items: unknown[] = []
  let page = 1
  let hasMorePage = true

  while (hasMorePage) {
    const payload = await zohoGet(`/items?page=${page}&per_page=${ITEMS_PER_PAGE}`, env)
    if (!payload || typeof payload !== 'object') break

    const response = payload as ZohoItemsResponse
    const pageItems = Array.isArray(response.items)
      ? response.items
      : Array.isArray(response.data) ? response.data : []
    items.push(...pageItems)
    hasMorePage = response.page_context?.has_more_page ?? pageItems.length === ITEMS_PER_PAGE
    page += 1
  }

  return items
    .filter((value): value is ZohoItem => Boolean(value) && typeof value === 'object')
    .filter((item) => !item.status || item.status.toLowerCase() === 'active')
    .map((item) => ({
      item_id: item.item_id == null ? '' : String(item.item_id),
      item_name: (item.name || item.item_name || '').trim(),
      sku: (item.sku || '').trim(),
      description: (item.description || '').trim(),
    }))
    .filter((item) => item.item_id && item.item_name)
    .sort((left, right) => left.item_name.localeCompare(right.item_name))
}
