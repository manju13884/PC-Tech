import { zohoGet, type ZohoEnv } from './zoho'

interface ZohoDeliveryChallan {
  deliverychallan_id?: string | number
  delivery_challan_id?: string | number
  deliverychallan_number?: string
  delivery_challan_number?: string
  customer_name?: string
  reference_number?: string
  po_number?: string
  salesorder_number?: string
  date?: string
  line_items?: Array<{
    name?: string
    description?: string
    quantity?: string | number
  }>
}

interface ZohoDeliveryChallansResponse {
  deliverychallans?: unknown[]
  delivery_challans?: unknown[]
  deliverychallan?: unknown
  delivery_challan?: unknown
  data?: unknown
  page_context?: { has_more_page?: boolean }
}

export interface DeliveryChallanSummary {
  delivery_challan_id: string
  delivery_challan_number: string
}

export interface DeliveryChallanDetail extends DeliveryChallanSummary {
  date: string
  customer_name: string
  po_number: string
  sales_order_number: string
  line_items: Array<{ name: string; description: string; quantity: string }>
}

const PAGE_SIZE = 200
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function mapSummary(value: unknown): DeliveryChallanSummary | null {
  if (!value || typeof value !== 'object') return null
  const row = value as ZohoDeliveryChallan
  const id = String(row.deliverychallan_id ?? row.delivery_challan_id ?? '').trim()
  const number = text(row.deliverychallan_number) || text(row.delivery_challan_number)
  return id && number ? { delivery_challan_id: id, delivery_challan_number: number } : null
}

function mapDetail(value: unknown): DeliveryChallanDetail | null {
  const summary = mapSummary(value)
  if (!summary || !value || typeof value !== 'object') return null
  const row = value as ZohoDeliveryChallan
  return {
    ...summary,
    date: text(row.date),
    customer_name: text(row.customer_name),
    po_number: text(row.po_number) || text(row.reference_number),
    sales_order_number: text(row.salesorder_number),
    line_items: Array.isArray(row.line_items) ? row.line_items.map((item) => ({
      name: text(item.name),
      description: text(item.description),
      quantity: item.quantity == null ? '' : String(item.quantity),
    })) : [],
  }
}

export async function getZohoDeliveryChallansByCustomer(customerId: string, env?: ZohoEnv): Promise<DeliveryChallanSummary[]> {
  if (!customerId.trim()) return []
  const rows: unknown[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const params = new URLSearchParams({ customer_id: customerId, page: String(page), per_page: String(PAGE_SIZE) })
    const payload = await zohoGet(`/deliverychallans?${params.toString()}`, env)
    if (!payload || typeof payload !== 'object') break
    const response = payload as ZohoDeliveryChallansResponse
    const pageRows = Array.isArray(response.deliverychallans)
      ? response.deliverychallans
      : Array.isArray(response.delivery_challans)
        ? response.delivery_challans
        : Array.isArray(response.data) ? response.data : []
    rows.push(...pageRows)
    hasMore = response.page_context?.has_more_page ?? pageRows.length === PAGE_SIZE
    page += 1
  }
  return rows.map(mapSummary).filter((row): row is DeliveryChallanSummary => row !== null)
}

export async function getZohoDeliveryChallanById(id: string, env?: ZohoEnv): Promise<DeliveryChallanDetail | null> {
  if (!id.trim()) return null
  const payload = await zohoGet(`/deliverychallans/${encodeURIComponent(id)}`, env)
  if (!payload || typeof payload !== 'object') return null
  const response = payload as ZohoDeliveryChallansResponse
  return mapDetail(response.deliverychallan ?? response.delivery_challan ?? response.data)
}
