import { isCurrentDailyCustomerCache } from './customerCacheSchedule'
import { getZohoInventoryVendors, type InventoryVendor } from './inventoryProcurement'
import type { ZohoEnv } from './zoho'

interface VendorCacheEnv extends ZohoEnv { DB?: D1Database }
interface CacheRow { payload_json: string; refreshed_at: string }
const CACHE_KEY = 'active-vendors'

function parseVendors(payload: string): InventoryVendor[] | null {
  try {
    const parsed: unknown = JSON.parse(payload)
    return Array.isArray(parsed) ? parsed as InventoryVendor[] : null
  } catch {
    return null
  }
}

export async function refreshVendorCache(env: VendorCacheEnv) {
  if (!env.DB) throw new Error('Vendor cache database is unavailable.')
  const vendors = await getZohoInventoryVendors(env)
  const refreshedAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO vendor_cache (cache_key, payload_json, refreshed_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, refreshed_at = excluded.refreshed_at`,
  ).bind(CACHE_KEY, JSON.stringify(vendors), refreshedAt).run()
  return { vendors, refreshedAt }
}

export async function getCachedVendors(env: VendorCacheEnv) {
  if (!env.DB) throw new Error('Vendor cache database is unavailable.')
  const cached = await env.DB.prepare(
    'SELECT payload_json, refreshed_at FROM vendor_cache WHERE cache_key = ?',
  ).bind(CACHE_KEY).first<CacheRow>()
  const vendors = cached ? parseVendors(cached.payload_json) : null
  if (cached && vendors && isCurrentDailyCustomerCache(cached.refreshed_at)) {
    return { vendors, refreshedAt: cached.refreshed_at, cacheStatus: 'HIT' }
  }
  const refreshed = await refreshVendorCache(env)
  return { ...refreshed, cacheStatus: vendors ? 'STALE' : 'MISS' }
}
