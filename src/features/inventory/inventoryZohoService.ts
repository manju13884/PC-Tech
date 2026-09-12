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

let cachedVendors: InventoryVendor[] | null = null
let vendorsRefreshedAt: Date | null = null
let vendorsRequest: Promise<InventoryVendor[]> | null = null
const VENDOR_REQUEST_TIMEOUT_MS = 15_000

export interface InventoryPurchaseOrderItem {
  line_item_id: string
  item_id: string
  name: string
  description: string
  quantity: number
  unit: string
}

async function readList<T>(response: Response, fallback: string): Promise<T[]> {
  const text = await response.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : []
  } catch {
    throw new Error(fallback)
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null
    throw new Error(typeof message === 'string' && message.trim() ? message : fallback)
  }
  if (!Array.isArray(payload)) throw new Error(fallback)
  return payload as T[]
}

export async function getInventoryVendors(options: { force?: boolean } = {}): Promise<InventoryVendor[]> {
  if (options.force) cachedVendors = null
  if (cachedVendors !== null) return cachedVendors
  if (vendorsRequest) return vendorsRequest

  vendorsRequest = (async () => {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), VENDOR_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch('/api/inventory-vendors', { credentials: 'include', signal: controller.signal })
      const text = await response.text()
      let payload: { success?: unknown; vendors?: unknown; refreshedAt?: unknown; error?: unknown }
      try { payload = text ? JSON.parse(text) as typeof payload : {} } catch { throw new Error('Vendor service returned an invalid response. Please retry.') }
      if (!response.ok || payload.success !== true) {
        throw new Error(typeof payload.error === 'string' && payload.error.trim() ? payload.error : 'Unable to load vendors. Please retry.')
      }
      if (!Array.isArray(payload.vendors)) throw new Error('Vendor service returned an invalid response. Please retry.')
      cachedVendors = payload.vendors as InventoryVendor[]
      vendorsRefreshedAt = typeof payload.refreshedAt === 'string' ? new Date(payload.refreshedAt) : null
      return cachedVendors
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Vendor loading timed out. Please retry.')
      throw error
    } finally {
      globalThis.clearTimeout(timeout)
    }
  })().finally(() => { vendorsRequest = null })
  return vendorsRequest
}

export function getInventoryVendorsRefreshedAt(): Date | null {
  return vendorsRefreshedAt
}

export async function refreshInventoryVendors(): Promise<{ vendors: InventoryVendor[]; refreshedAt: Date }> {
  const response = await fetch('/api/inventory-vendors', { method: 'POST', credentials: 'include' })
  const text = await response.text()
  let payload: { error?: unknown; vendors?: unknown; refreshedAt?: unknown }
  try { payload = text ? JSON.parse(text) as typeof payload : {} } catch { throw new Error('Vendor refresh service returned an invalid response.') }
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to refresh vendor details.')
  if (!Array.isArray(payload.vendors) || typeof payload.refreshedAt !== 'string') throw new Error('Vendor refresh response is invalid.')
  cachedVendors = payload.vendors as InventoryVendor[]
  vendorsRefreshedAt = new Date(payload.refreshedAt)
  return { vendors: cachedVendors, refreshedAt: vendorsRefreshedAt }
}

export async function getInventoryPurchaseOrders(vendorId: string): Promise<InventoryPurchaseOrder[]> {
  const params = new URLSearchParams({ vendor_id: vendorId })
  return readList<InventoryPurchaseOrder>(
    await fetch(`/api/inventory-purchase-orders?${params.toString()}`, { credentials: 'include' }),
    'Unable to load purchase orders from Zoho Books.',
  )
}

export async function getInventoryPurchaseOrderItems(purchaseOrderId: string): Promise<InventoryPurchaseOrderItem[]> {
  const params = new URLSearchParams({ purchase_order_id: purchaseOrderId })
  return readList<InventoryPurchaseOrderItem>(
    await fetch(`/api/inventory-purchase-order-items?${params.toString()}`, { credentials: 'include' }),
    'Unable to load items for the selected purchase order from Zoho Books.',
  )
}

export interface SavedMaterialInventoryRecord {
  id: number
  material_no: string
  created_at: string
}

export async function saveMaterialInventoryRecord(payload: Record<string, unknown>): Promise<SavedMaterialInventoryRecord> {
  const response = await fetch('/api/material-inventory-records', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let result: { error?: unknown; record?: SavedMaterialInventoryRecord }
  try {
    result = text ? JSON.parse(text) as typeof result : {}
  } catch {
    throw new Error('Material Inventory service returned an invalid response.')
  }
  if (!response.ok || !result.record) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Unable to save Material Inventory.')
  }
  return result.record
}
