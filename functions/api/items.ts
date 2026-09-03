import { getZohoItems, type ItemSummary } from '../../lib/items'
import { isCurrentDailyCustomerCache } from '../../lib/customerCacheSchedule'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }
interface CacheRow { payload_json: string; refreshed_at: string }

const CACHE_KEY = 'active-items'
const response = (payload: unknown, status = 200, headers: HeadersInit = {}) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
})

function parseItems(value: string): ItemSummary[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as ItemSummary[] : null
  } catch {
    return null
  }
}

async function refresh(env: Env) {
  if (!env.DB) throw new Error('Item cache database is unavailable')
  const items = await getZohoItems(env)
  const refreshedAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO item_cache (cache_key, payload_json, refreshed_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, refreshed_at = excluded.refreshed_at`,
  ).bind(CACHE_KEY, JSON.stringify(items), refreshedAt).run()
  return { items, refreshedAt }
}

export async function onRequestGet(context: Context): Promise<Response> {
  try {
    if (!context.env.DB) throw new Error('Item cache database is unavailable')
    if (!await getAuthenticatedUser(context.request, context.env.DB)) {
      return response({ error: 'Authentication required.' }, 401)
    }

    const cached = await context.env.DB.prepare(
      'SELECT payload_json, refreshed_at FROM item_cache WHERE cache_key = ?',
    ).bind(CACHE_KEY).first<CacheRow>()
    const items = cached ? parseItems(cached.payload_json) : null
    if (cached && items && isCurrentDailyCustomerCache(cached.refreshed_at)) {
      return response(items, 200, { 'X-Item-Cache': 'HIT', 'X-Item-Refreshed-At': cached.refreshed_at })
    }

    try {
      const loaded = await refresh(context.env)
      return response(loaded.items, 200, {
        'X-Item-Cache': items ? 'STALE' : 'MISS',
        'X-Item-Refreshed-At': loaded.refreshedAt,
      })
    } catch (error) {
      if (error instanceof ZohoRequestError && error.status === 401 && error.code === '57') {
        return response({
          error: 'Zoho Books Items permission is required. Re-authorize the Zoho connection with ZohoBooks.settings.READ.',
          code: 'zoho_items_scope_required',
        }, 502)
      }
      throw error
    }
  } catch (error) {
    console.error('[items-api] Unable to load items', error)
    return response({ error: error instanceof Error ? error.message : 'Unable to load items' }, 502)
  }
}

export async function onRequestPost(context: Context): Promise<Response> {
  try {
    if (!context.env.DB) throw new Error('Item cache database is unavailable')
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return response({ error: 'Authentication required.' }, 401)
    if (user.roleName !== 'SUPERADMIN') return response({ error: 'SUPERADMIN access required.' }, 403)
    return response(await refresh(context.env))
  } catch (error) {
    console.error('[items-api] Manual refresh failed', error)
    if (error instanceof ZohoRequestError && error.status === 401 && error.code === '57') {
      return response({ error: 'Zoho Books Items permission is required. Re-authorize the Zoho connection with ZohoBooks.settings.READ.' }, 502)
    }
    return response({ error: error instanceof Error ? error.message : 'Unable to refresh items' }, 502)
  }
}
