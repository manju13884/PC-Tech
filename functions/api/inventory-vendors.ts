import { getCachedVendors, refreshVendorCache } from '../../lib/vendorCache'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }

const response = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

const VENDOR_LOAD_TIMEOUT_MS = 25_000

async function loadVendorsWithTimeout(env: Env) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      getCachedVendors(env),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ZohoRequestError('Zoho vendor request timed out.', {
          status: 504,
          code: 'request_timeout',
          message: 'Zoho Books did not return vendors before the request timeout',
        })), VENDOR_LOAD_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function canView(db: D1Database, roleId: number, roleName: string) {
  if (roleName === 'SUPERADMIN') return true
  const permission = await db.prepare(
    `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'material-inventory' AND (can_full = 1 OR can_view = 1)`,
  ).bind(roleId).first()
  return Boolean(permission)
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ success: false, error: 'Material Inventory database binding is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ success: false, error: 'Authentication required.' }, 401)
  if (!await canView(context.env.DB, user.roleId, user.roleName)) return response({ success: false, error: 'Material Inventory view access is required.' }, 403)

  try {
    const result = await loadVendorsWithTimeout(context.env)
    return Response.json({ success: true, vendors: result.vendors, refreshedAt: result.refreshedAt }, { status: 200, headers: {
      'Cache-Control': 'no-store',
      'X-Vendor-Cache': result.cacheStatus,
      'X-Vendor-Refreshed-At': result.refreshedAt,
    } })
  } catch (error) {
    console.error('[inventory-vendors] Vendor load failed', {
      status: error instanceof ZohoRequestError ? error.status : 502,
      code: error instanceof ZohoRequestError ? error.code : 'vendor_load_failed',
      message: error instanceof Error ? error.message : 'Unknown vendor load error',
    })
    if (error instanceof ZohoRequestError && (error.status === 401 || error.status === 403)) {
      return response({ success: false, error: 'Zoho Books Vendor permission is required. Re-authorize with ZohoBooks.contacts.READ.' }, 502)
    }
    return response({ success: false, error: 'Unable to load supplied vendors from Zoho Books.' }, 502)
  }
}

export async function onRequestPost(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Vendor cache database binding is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  if (user.roleName !== 'SUPERADMIN') return response({ error: 'SUPERADMIN access required.' }, 403)
  try {
    return response(await refreshVendorCache(context.env))
  } catch (error) {
    console.error('[inventory-vendors] Unable to refresh Zoho Books vendors', error)
    return response({ error: 'Unable to refresh vendor details from Zoho Books.' }, 502)
  }
}
