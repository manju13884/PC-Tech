import { getAuthenticatedUser, type AuthenticatedUser } from '../lib/authenticatedUser'
import { getZohoInventoryPurchaseOrderItems, getZohoInventoryPurchaseOrders, getZohoInventoryVendors } from '../../lib/inventoryProcurement'
import type { ZohoEnv } from '../../lib/zoho'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
const editableFields = ['paper_type', 'vendor_id', 'vendor_name', 'purchase_order_id', 'purchase_order_number',
  'purchase_order_line_item_id', 'zoho_item_id', 'item_name', 'item_description', 'po_quantity', 'po_unit',
  'reel_size_cm', 'color', 'gsm', 'bf', 'reel_number', 'reel_weight_kg', 'status'] as const
type EditableField = typeof editableFields[number]
type Values = Record<EditableField, string | number | null>

async function canEdit(db: D1Database, user: AuthenticatedUser) {
  if (user.roleName === 'SUPERADMIN') return true
  const row = await db.prepare(`SELECT 1 FROM role_menu_permissions
    WHERE role_id=? AND menu_key='material-stock' AND (can_full=1 OR can_edit=1)`).bind(user.roleId).first()
  return Boolean(row)
}

const stockSelect = `SELECT id, material_no, material_type, paper_type, vendor_id, vendor_name, purchase_order_id,
  purchase_order_number, purchase_order_line_item_id, zoho_item_id, item_name, item_description, po_quantity, po_unit,
  reel_size_cm, color, gsm, bf, reel_number, reel_weight_kg, status, updated_at FROM material_inventory_records WHERE id=?`

function valuesOf(row: Record<string, unknown>): Values {
  return Object.fromEntries(editableFields.map((field) => [field, row[field] ?? null])) as Values
}

async function consumptionExists(db: D1Database, stockId: number) {
  const row = await db.prepare(`SELECT
    EXISTS(SELECT 1 FROM inventory_stock_ledger WHERE inventory_stock_id=? AND movement='OUT')
    OR EXISTS(SELECT 1 FROM job_tracking_reel_consumptions WHERE inventory_stock_id=?)
    OR EXISTS(SELECT 1 FROM inventory_material_issues WHERE inventory_stock_id=? AND status='COMPLETED')
    OR EXISTS(SELECT 1 FROM job_card_process_entries WHERE (inventory_stock_id=? OR inventory_stock_id_2=?) AND process_status='COMPLETED') AS consumed`
  ).bind(stockId, stockId, stockId, stockId, stockId).first<{ consumed: number }>()
  return Boolean(row?.consumed)
}

function parseValues(value: unknown): Values | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' ? parsed as Values : null
  } catch { return null }
}

async function validateProposed(body: Record<string, unknown>, env: Env): Promise<Values | null> {
  const text = (key: EditableField) => typeof body[key] === 'string' ? body[key].trim() : ''
  const numeric = (key: EditableField) => Number(body[key])
  const bf = body.bf === '' || body.bf == null ? null : numeric('bf')
  const vendorId = text('vendor_id'), purchaseOrderId = text('purchase_order_id'), lineItemId = text('purchase_order_line_item_id')
  const proposed = {
    paper_type: text('paper_type'), vendor_id: vendorId, vendor_name: '', purchase_order_id: purchaseOrderId,
    purchase_order_number: '', purchase_order_line_item_id: lineItemId, zoho_item_id: null, item_name: '',
    item_description: null, po_quantity: 0, po_unit: null, reel_size_cm: numeric('reel_size_cm'), color: text('color'),
    gsm: numeric('gsm'), bf, reel_number: text('reel_number'), reel_weight_kg: numeric('reel_weight_kg'),
    status: ['Available', 'Hold'].includes(text('status')) ? text('status') : 'Available',
  } as Values
  if (!proposed.paper_type || !vendorId || !purchaseOrderId || !lineItemId || !proposed.color || !proposed.reel_number || !(Number(proposed.reel_size_cm) > 0)
    || !(Number(proposed.gsm) > 0) || !(Number(proposed.reel_weight_kg) > 0) || (bf !== null && !(bf > 0))) return null
  const [vendors, purchaseOrders, items] = await Promise.all([
    getZohoInventoryVendors(env), getZohoInventoryPurchaseOrders(vendorId, env), getZohoInventoryPurchaseOrderItems(purchaseOrderId, env),
  ])
  const vendor = vendors.find((entry) => entry.vendor_id === vendorId)
  const purchaseOrder = purchaseOrders.find((entry) => entry.purchase_order_id === purchaseOrderId)
  const item = items.find((entry) => entry.line_item_id === lineItemId)
  if (!vendor || !purchaseOrder || !item) return null
  Object.assign(proposed, { vendor_name: vendor.vendor_name, purchase_order_number: purchaseOrder.purchase_order_number,
    zoho_item_id: item.item_id || null, item_name: item.name, item_description: item.description || null,
    po_quantity: item.quantity, po_unit: item.unit || null })
  return proposed
}

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Material Edit database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await canEdit(db, user) && user.roleName !== 'SUPERADMIN') return json({ error: 'Material Stock edit access is required.' }, 403)
  const url = new URL(context.request.url)
  const stockId = Number(url.searchParams.get('inventory_stock_id'))
  const clauses = Number.isInteger(stockId) && stockId > 0 ? 'WHERE r.inventory_stock_id=?' : user.roleName === 'SUPERADMIN' ? '' : 'WHERE r.requested_by_user_id=?'
  const value = Number.isInteger(stockId) && stockId > 0 ? stockId : user.id
  const result = await db.prepare(`SELECT r.*, m.material_no, m.reel_number, m.item_name
    FROM material_inventory_edit_requests r INNER JOIN material_inventory_records m ON m.id=r.inventory_stock_id
    ${clauses} ORDER BY r.requested_at DESC, r.id DESC`).bind(...(clauses ? [value] : [])).all()
  return json({ requests: result.results ?? [] })
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Material Edit database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const action = typeof body.action === 'string' ? body.action.trim() : 'submit'
  const requestId = Number(body.id)

  if (action === 'approve' || action === 'reject') {
    if (user.roleName !== 'SUPERADMIN') return json({ error: 'Only SUPERADMIN can approve or reject Material Edits.' }, 403)
    const request = await db.prepare(`SELECT * FROM material_inventory_edit_requests WHERE id=? AND status='PENDING_APPROVAL'`)
      .bind(requestId).first<Record<string, unknown>>()
    if (!request) return json({ error: 'This Material Edit is not pending approval or has already been processed.' }, 409)
    if (action === 'reject') {
      const reason = typeof body.rejection_reason === 'string' ? body.rejection_reason.trim() : ''
      if (!reason) return json({ error: 'Rejection Reason is required.' }, 400)
      const updated = await db.prepare(`UPDATE material_inventory_edit_requests SET status='REJECTED', reviewed_by_user_id=?,
        reviewed_by_name=?, reviewed_by_email=?, reviewed_at=CURRENT_TIMESTAMP, rejection_reason=?
        WHERE id=? AND status='PENDING_APPROVAL' RETURNING id`).bind(user.id, user.fullName, user.email, reason, requestId).first()
      if (!updated) return json({ error: 'This Material Edit has already been processed.' }, 409)
      await db.prepare(`INSERT INTO material_inventory_edit_history
        (edit_request_id, inventory_stock_id, action_type, old_values, proposed_values, reason, action_by_user_id, action_by_name)
        VALUES (?,?,'REJECTED',?,?,?,?,?)`).bind(requestId, request.inventory_stock_id, request.old_values, request.proposed_values, reason, user.id, user.fullName).run()
      return json({ success: true })
    }

    const stockId = Number(request.inventory_stock_id)
    const stock = await db.prepare(stockSelect).bind(stockId).first<Record<string, unknown>>()
    const oldValues = parseValues(request.old_values)
    const proposed = parseValues(request.proposed_values)
    if (!stock || !oldValues || !proposed) return json({ error: 'The Material Edit request is invalid or its stock row is unavailable.' }, 409)
    const changedSinceRequest = editableFields.some((field) => String(stock[field] ?? '') !== String(oldValues[field] ?? ''))
      || String(stock.updated_at) !== String(request.stock_updated_at_snapshot)
    if (await consumptionExists(db, stockId) || changedSinceRequest) {
      return json({ error: 'This material has inventory activity after the edit request was submitted. The edit cannot be approved.' }, 409)
    }
    try {
      const results = await db.batch([
        db.prepare(`UPDATE material_inventory_records SET paper_type=?, vendor_id=?, vendor_name=?, purchase_order_id=?,
          purchase_order_number=?, purchase_order_line_item_id=?, zoho_item_id=?, item_name=?, item_description=?, po_quantity=?, po_unit=?,
          reel_size_cm=?, color=?, gsm=?, bf=?, reel_number=?, reel_weight_kg=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND updated_at=?`)
          .bind(proposed.paper_type, proposed.vendor_id, proposed.vendor_name, proposed.purchase_order_id, proposed.purchase_order_number,
            proposed.purchase_order_line_item_id, proposed.zoho_item_id, proposed.item_name, proposed.item_description, proposed.po_quantity,
            proposed.po_unit, proposed.reel_size_cm, proposed.color, proposed.gsm, proposed.bf, proposed.reel_number,
            proposed.reel_weight_kg, proposed.status, stockId, request.stock_updated_at_snapshot),
        db.prepare(`UPDATE material_inventory_edit_requests SET status='APPROVED', reviewed_by_user_id=?, reviewed_by_name=?,
          reviewed_by_email=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_APPROVAL'`)
          .bind(user.id, user.fullName, user.email, requestId),
        db.prepare(`INSERT INTO material_inventory_edit_history
          (edit_request_id, inventory_stock_id, action_type, old_values, proposed_values, reason, action_by_user_id, action_by_name)
          VALUES (?,?,'APPROVED',?,?,?,?,?)`).bind(requestId, stockId, request.old_values, request.proposed_values, request.edit_reason, user.id, user.fullName),
      ])
      if (Number(results[0]?.meta.changes) !== 1 || Number(results[1]?.meta.changes) !== 1) throw new Error('stale_material_edit')
      return json({ success: true })
    } catch (error) {
      console.error('[material-edit-requests] approval failed', error)
      return json({ error: 'This material has inventory activity after the edit request was submitted. The edit cannot be approved.' }, 409)
    }
  }

  if (!await canEdit(db, user)) return json({ error: 'Material Stock edit access is required.' }, 403)
  const stockId = Number(body.inventory_stock_id)
  const reason = typeof body.edit_reason === 'string' ? body.edit_reason.trim() : ''
  let proposed: Values | null = null
  try { proposed = await validateProposed(body, context.env) } catch (error) {
    console.error('[material-edit-requests] procurement validation failed', error)
    return json({ error: 'Unable to validate the selected Vendor, PO, or PO item in Zoho Books.' }, 502)
  }
  if (!Number.isInteger(stockId) || stockId <= 0 || !proposed) return json({ error: 'Complete all mandatory Material Edit fields with valid values.' }, 400)
  if (!reason) return json({ error: 'Reason for Edit is required.' }, 400)
  if (reason.length > 500) return json({ error: 'Reason for Edit must not exceed 500 characters.' }, 400)
  const stock = await db.prepare(stockSelect).bind(stockId).first<Record<string, unknown>>()
  if (!stock) return json({ error: 'Material stock record was not found.' }, 404)
  if (await consumptionExists(db, stockId)) return json({ error: 'This material cannot be edited because it has already been consumed or issued.' }, 409)
  const pending = await db.prepare(`SELECT id FROM material_inventory_edit_requests WHERE inventory_stock_id=? AND status='PENDING_APPROVAL'`).bind(stockId).first()
  if (pending) return json({ error: 'This material already has an Edit Pending Approval request.' }, 409)
  const oldValues = valuesOf(stock)
  if (!editableFields.some((field) => String(oldValues[field] ?? '') !== String(proposed[field] ?? ''))) return json({ error: 'Change at least one material value before submitting.' }, 400)
  try {
    const inserted = await db.prepare(`INSERT INTO material_inventory_edit_requests
      (inventory_stock_id, old_values, proposed_values, stock_updated_at_snapshot, edit_reason,
       requested_by_user_id, requested_by_name, requested_by_email)
      VALUES (?,?,?,?,?,?,?,?)`).bind(stockId, JSON.stringify(oldValues), JSON.stringify(proposed), stock.updated_at,
        reason, user.id, user.fullName, user.email).run()
    const id = Number(inserted.meta.last_row_id)
    await db.prepare(`INSERT INTO material_inventory_edit_history
      (edit_request_id, inventory_stock_id, action_type, old_values, proposed_values, reason, action_by_user_id, action_by_name)
      VALUES (?,?,'REQUESTED',?,?,?,?,?)`).bind(id, stockId, JSON.stringify(oldValues), JSON.stringify(proposed), reason, user.id, user.fullName).run()
    return json({ success: true, id, status: 'PENDING_APPROVAL' }, 201)
  } catch (error) {
    console.error('[material-edit-requests] submission failed', error)
    return json({ error: 'This material already has an Edit Pending Approval request.' }, 409)
  }
}
