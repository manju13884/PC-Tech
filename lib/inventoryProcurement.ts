import { zohoGet, type ZohoEnv } from './zoho'

export interface InventoryVendor {
  vendor_id: string
  vendor_name: string
}

export interface InventoryPurchaseOrder {
  purchase_order_id: string
  purchase_order_number: string
  vendor_id: string
  status: string
}

export interface InventoryPurchaseOrderItem {
  line_item_id: string
  item_id: string
  name: string
  description: string
  quantity: number
  unit: string
}

interface ZohoPage {
  has_more_page?: boolean
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function getZohoInventoryVendors(env?: ZohoEnv): Promise<InventoryVendor[]> {
  const vendors: InventoryVendor[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const payload = await zohoGet(`/contacts?contact_type=vendor&status=active&per_page=200&page=${page}`, env) as {
      contacts?: unknown[]
      page_context?: ZohoPage
    }
    for (const value of payload.contacts ?? []) {
      if (!value || typeof value !== 'object') continue
      const contact = value as Record<string, unknown>
      const vendorId = String(contact.contact_id ?? '').trim()
      const vendorName = text(contact.company_name) || text(contact.contact_name)
      const status = text(contact.status).toLowerCase()
      const contactType = text(contact.contact_type).toLowerCase()
      if (vendorId && vendorName && (!status || status === 'active') && (!contactType || contactType === 'vendor')) {
        vendors.push({ vendor_id: vendorId, vendor_name: vendorName })
      }
    }
    hasMore = payload.page_context?.has_more_page === true
    page += 1
  }

  return [...new Map(vendors.map((vendor) => [vendor.vendor_id, vendor])).values()]
    .sort((left, right) => left.vendor_name.localeCompare(right.vendor_name))
}

export async function getZohoInventoryPurchaseOrders(vendorId: string, env?: ZohoEnv): Promise<InventoryPurchaseOrder[]> {
  const normalizedVendorId = vendorId.trim()
  if (!normalizedVendorId) return []
  const purchaseOrders: InventoryPurchaseOrder[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({ vendor_id: normalizedVendorId, per_page: '200', page: String(page) })
    const payload = await zohoGet(`/purchaseorders?${params.toString()}`, env) as {
      purchaseorders?: unknown[]
      page_context?: ZohoPage
    }
    for (const value of payload.purchaseorders ?? []) {
      if (!value || typeof value !== 'object') continue
      const purchaseOrder = value as Record<string, unknown>
      const purchaseOrderId = String(purchaseOrder.purchaseorder_id ?? '').trim()
      const purchaseOrderNumber = text(purchaseOrder.purchaseorder_number)
      const responseVendorId = String(purchaseOrder.vendor_id ?? normalizedVendorId).trim()
      if (purchaseOrderId && purchaseOrderNumber && responseVendorId === normalizedVendorId) {
        purchaseOrders.push({
          purchase_order_id: purchaseOrderId,
          purchase_order_number: purchaseOrderNumber,
          vendor_id: responseVendorId,
          status: text(purchaseOrder.status),
        })
      }
    }
    hasMore = payload.page_context?.has_more_page === true
    page += 1
  }

  return purchaseOrders
}

export async function getZohoInventoryPurchaseOrderItems(purchaseOrderId: string, env?: ZohoEnv): Promise<InventoryPurchaseOrderItem[]> {
  const normalizedId = purchaseOrderId.trim()
  if (!normalizedId) return []
  const payload = await zohoGet(`/purchaseorders/${encodeURIComponent(normalizedId)}`, env) as {
    purchaseorder?: { line_items?: unknown[] }
  }
  return (payload.purchaseorder?.line_items ?? []).flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const lineItem = value as Record<string, unknown>
    const lineItemId = String(lineItem.line_item_id ?? lineItem.item_id ?? '').trim()
    const itemId = String(lineItem.item_id ?? '').trim()
    const name = text(lineItem.name) || text(lineItem.item_name)
    if (!lineItemId || !name) return []
    const quantity = Number(lineItem.quantity)
    return [{
      line_item_id: lineItemId,
      item_id: itemId,
      name,
      description: text(lineItem.description),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unit: text(lineItem.unit),
    }]
  })
}
