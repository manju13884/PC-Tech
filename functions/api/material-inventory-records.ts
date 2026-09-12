import { getZohoInventoryPurchaseOrderItems, getZohoInventoryPurchaseOrders, getZohoInventoryVendors } from '../../lib/inventoryProcurement'
import type { ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }
const response = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

async function canCreate(db: D1Database, roleId: number, roleName: string) {
  if (roleName === 'SUPERADMIN') return true
  const permission = await db.prepare(
    `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'material-inventory' AND (can_full = 1 OR can_create = 1)`,
  ).bind(roleId).first()
  return Boolean(permission)
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Material Inventory database binding is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  const permission = user.roleName === 'SUPERADMIN' || Boolean(await context.env.DB.prepare(
    `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key IN ('material-inventory', 'stock-adjustment') AND (can_full = 1 OR can_view = 1) LIMIT 1`,
  ).bind(user.roleId).first())
  if (!permission) return response({ error: 'Inventory view access is required.' }, 403)
  const records = await context.env.DB.prepare(
    `SELECT stock.id, stock.material_no, stock.material_type, stock.paper_type, stock.vendor_name, stock.purchase_order_number,
      stock.item_name, stock.item_description, stock.reel_size_cm, stock.color, stock.gsm, stock.bf, stock.reel_number,
      stock.reel_weight_kg AS current_stock, 'KG' AS uom, '' AS location_name,
      CASE WHEN reservation.id IS NOT NULL THEN 'Reserved' ELSE stock.status END AS status,
      reservation.job_number AS reserved_for_job
     FROM material_inventory_records stock
     LEFT JOIN inventory_reel_reservations reservation
       ON reservation.inventory_stock_id=stock.id AND reservation.status='ACTIVE'
     WHERE stock.status = 'Available'
     ORDER BY stock.material_no ASC`,
  ).all()
  return response({ records: records.results ?? [] })
}

export async function onRequestPost(context: Context): Promise<Response> {
  if (!context.env.DB) return response({ error: 'Material Inventory database binding is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return response({ error: 'Authentication required.' }, 401)
  if (!await canCreate(context.env.DB, user.roleId, user.roleName)) return response({ error: 'Material Inventory create access is required.' }, 403)

  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const value = (key: string) => typeof body[key] === 'string' ? body[key].trim() : ''
  const number = (key: string) => Number(body[key])
  const vendorId = value('vendor_id')
  const purchaseOrderId = value('purchase_order_id')
  const lineItemId = value('purchase_order_line_item_id')
  const required = ['material_type', 'paper_type', 'color', 'reel_number'] as const
  if (required.some((key) => !value(key)) || !vendorId || !purchaseOrderId || !lineItemId) {
    return response({ error: 'Complete all required Material Inventory fields.' }, 400)
  }
  const reelSize = number('reel_size_cm')
  const gsm = number('gsm')
  const reelWeight = number('reel_weight_kg')
  const bfValue = body.bf === '' || body.bf == null ? null : number('bf')
  if (!(reelSize > 0) || !(gsm > 0) || !(reelWeight > 0) || (bfValue !== null && !(bfValue > 0))) {
    return response({ error: 'Enter valid positive paper measurements.' }, 400)
  }

  try {
    const [vendors, purchaseOrders, items] = await Promise.all([
      getZohoInventoryVendors(context.env),
      getZohoInventoryPurchaseOrders(vendorId, context.env),
      getZohoInventoryPurchaseOrderItems(purchaseOrderId, context.env),
    ])
    const vendor = vendors.find((entry) => entry.vendor_id === vendorId)
    const purchaseOrder = purchaseOrders.find((entry) => entry.purchase_order_id === purchaseOrderId)
    const item = items.find((entry) => entry.line_item_id === lineItemId)
    if (!vendor || !purchaseOrder || !item) return response({ error: 'The selected Vendor, PO, or PO item is no longer available in Zoho Books.' }, 409)

    const inserted = await context.env.DB.prepare(
      `INSERT INTO material_inventory_records (
        material_type, paper_type, vendor_id, vendor_name, purchase_order_id, purchase_order_number,
        purchase_order_line_item_id, zoho_item_id, item_name, item_description, po_quantity, po_unit,
        reel_size_cm, color, gsm, bf, reel_number, reel_weight_kg, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      value('material_type'), value('paper_type'), vendor.vendor_id, vendor.vendor_name,
      purchaseOrder.purchase_order_id, purchaseOrder.purchase_order_number, item.line_item_id,
      item.item_id || null, item.name, item.description || null, item.quantity, item.unit || null,
      reelSize, value('color'), gsm, bfValue, value('reel_number'), reelWeight,
      ['Available', 'Hold'].includes(value('status')) ? value('status') : 'Available', user.id,
    ).run()
    const id = Number(inserted.meta.last_row_id)
    const saved = await context.env.DB.prepare(
      'SELECT id, material_no, created_at FROM material_inventory_records WHERE id = ?'
    ).bind(id).first()
    if (!saved?.material_no) throw new Error('Material number assignment failed.')
    return response({ success: true, record: saved }, 201)
  } catch (error) {
    console.error('[material-inventory-records] Unable to save material inventory', error)
    return response({ error: 'Unable to save Material Inventory. No record was created.' }, 502)
  }
}
