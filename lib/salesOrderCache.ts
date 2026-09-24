import type { SalesOrderDetail, SalesOrderSummary } from './salesOrders'
import type { ZohoEnv } from './zoho'

type Env = ZohoEnv & { DB?: D1Database }
interface CacheRow { payload_json: string; refreshed_at: string }
export const SALES_ORDER_CACHE_TTL_MS = 15 * 60 * 1000

async function readThrough<T>(
  env: Env, key: string, load: () => Promise<T>, valid: (value: unknown) => boolean,
  force: boolean,
): Promise<T> {
  if (!env.DB) return load()
  const db = env.DB
  if (!force) {
    try {
      const row = await db.prepare('SELECT payload_json, refreshed_at FROM sales_order_cache WHERE cache_key = ?')
        .bind(key).first<CacheRow>()
      if (row) {
        const age = Date.now() - Date.parse(row.refreshed_at)
        if (age >= 0 && age < SALES_ORDER_CACHE_TTL_MS) {
          const value: unknown = JSON.parse(row.payload_json)
          if (valid(value)) return value as T
        }
      }
    } catch {
      // An unavailable or corrupt cache must not prevent live reads.
      console.warn('[sales-order-cache] Cache read unavailable; fetching from Zoho.')
    }
  }
  const value = await load()
  try {
    await db.prepare(`INSERT INTO sales_order_cache (cache_key, payload_json, refreshed_at) VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, refreshed_at = excluded.refreshed_at`)
      .bind(key, JSON.stringify(value), new Date().toISOString()).run()
  } catch {
    console.warn('[sales-order-cache] Cache write unavailable; returning live data.')
  }
  return value
}

function isOrder(value: unknown): value is SalesOrderSummary {
  if (!value || typeof value !== 'object') return false
  const order = value as SalesOrderSummary
  return typeof order.salesorder_id === 'string' && typeof order.customer_id === 'string'
    && typeof order.salesorder_number === 'string' && typeof order.status === 'string'
}

export function cachedSalesOrder(
  env: Env, id: string, load: () => Promise<SalesOrderDetail | null>, force = false,
) {
  return readThrough(env, `${env.ZOHO_ORG_ID ?? ''}:order:${id}`, load, (value) => {
    if (!isOrder(value) || value.salesorder_id !== id) return false
    const detail = value as SalesOrderDetail
    return Array.isArray(detail.line_items) && detail.line_items.every((line) =>
      line && typeof line.line_item_id === 'string' && typeof line.item_id === 'string'
      && Number.isFinite(line.quantity) && Number.isFinite(line.quantity_invoiced))
  }, force)
}

export function cachedCustomerSalesOrders(
  env: Env, customerId: string, load: () => Promise<SalesOrderSummary[]>, force = false,
) {
  return readThrough(env, `${env.ZOHO_ORG_ID ?? ''}:customer:${customerId}`, load, (value) =>
    Array.isArray(value) && value.every((order) => isOrder(order) && order.customer_id === customerId), force)
}
