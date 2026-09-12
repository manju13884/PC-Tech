import { getZohoInventoryPurchaseOrders } from '../../lib/inventoryProcurement'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }

const response = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

async function canView(db: D1Database, roleId: number, roleName: string) {
  if (roleName === 'SUPERADMIN') return true
  const permission = await db.prepare(
    `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'material-inventory' AND (can_full = 1 OR can_view = 1)`,
  ).bind(roleId).first()
  return Boolean(permission)
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Material Inventory database binding is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  if (!await canView(context.env.DB, user.roleId, user.roleName)) return response({ error: 'Material Inventory view access is required.' }, 403)
  const vendorId = new URL(context.request.url).searchParams.get('vendor_id')?.trim() ?? ''
  if (!vendorId) return response({ error: 'Select Supplied Vendor first.' }, 400)

  try {
    return response(await getZohoInventoryPurchaseOrders(vendorId, context.env))
  } catch (error) {
    console.error('[inventory-purchase-orders] Unable to load Zoho Books purchase orders', error)
    if (error instanceof ZohoRequestError && error.status === 401) {
      return response({ error: 'Zoho Books Purchase Order permission is required. Re-authorize with ZohoBooks.purchaseorders.READ.' }, 502)
    }
    return response({ error: 'Unable to load purchase orders from Zoho Books.' }, 502)
  }
}
