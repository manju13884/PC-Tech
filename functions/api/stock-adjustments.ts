import { getAuthenticatedUser, type AuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
const allowedReasons = ['Physical Stock Verification', 'Excess Stock Found', 'Shortage', 'Damaged Material', 'Production Wastage', 'Wrong Previous Entry', 'Reel Weight Correction', 'Other']

async function permission(db: D1Database, user: AuthenticatedUser, action: 'view' | 'create' | 'edit') {
  if (user.roleName === 'SUPERADMIN') return true
  const row = await db.prepare(
    `SELECT can_full, can_view, can_create, can_edit FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'stock-adjustment'`,
  ).bind(user.roleId).first<{ can_full: number; can_view: number; can_create: number; can_edit: number }>()
  return Boolean(row && (row.can_full === 1 || (action === 'view' ? row.can_view === 1 : action === 'create' ? row.can_create === 1 : row.can_edit === 1)))
}

const selectColumns = `a.*, m.material_no, m.paper_type, m.reel_number, m.gsm, m.bf, m.reel_size_cm,
  m.color, m.vendor_name, m.purchase_order_number, m.item_name, m.item_description,
  CASE WHEN a.status IN ('DRAFT','REJECTED') AND a.created_by_user_id = ? THEN 1 ELSE 0 END AS can_edit`

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return json({ error: 'Stock Adjustment database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(context.env.DB, user, 'view')) return json({ error: 'Stock Adjustment view access is required.' }, 403)
  const url = new URL(context.request.url)
  const clauses: string[] = []
  const values: unknown[] = [user.id]
  const filters: Array<[string, string]> = [
    ['adjustment_number', 'a.adjustment_number LIKE ?'], ['material_type', 'a.material_type = ?'],
    ['material', 'CAST(a.inventory_stock_id AS TEXT) = ?'], ['reason', 'a.reason = ?'],
    ['status', 'a.status = ?'], ['created_by', 'a.created_by_name LIKE ?'],
  ]
  for (const [key, clause] of filters) {
    const value = url.searchParams.get(key)?.trim()
    if (value) { clauses.push(clause); values.push(['adjustment_number', 'created_by'].includes(key) ? `%${value}%` : value) }
  }
  const from = url.searchParams.get('date_from')?.trim()
  const to = url.searchParams.get('date_to')?.trim()
  if (from) { clauses.push('a.adjustment_date >= ?'); values.push(from) }
  if (to) { clauses.push('a.adjustment_date <= ?'); values.push(to) }
  const result = await context.env.DB.prepare(
    `SELECT ${selectColumns} FROM inventory_stock_adjustments a
     INNER JOIN material_inventory_records m ON m.id = a.inventory_stock_id
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC, a.id DESC`,
  ).bind(...values).all()
  return json({ adjustments: result.results ?? [] })
}

async function getStock(db: D1Database, id: number) {
  return db.prepare(
    `SELECT id, material_type, reel_weight_kg AS current_stock
     FROM material_inventory_records WHERE id = ? AND status IN ('Available','Consumed')`,
  ).bind(id).first<{ id: number; material_type: string; current_stock: number }>()
}

export async function onRequestPost(context: Context): Promise<Response> {
  if (!context.env.DB) return json({ error: 'Stock Adjustment database is unavailable.' }, 503)
  const db = context.env.DB
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const text = (key: string) => typeof body[key] === 'string' ? body[key].trim() : ''
  const action = text('action') || 'save_draft'
  const id = Number(body.id)

  if (action === 'approve' || action === 'preview_approval') {
    if (user.roleName !== 'SUPERADMIN') return json({ error: 'Only SUPERADMIN can approve Stock Adjustments.' }, 403)
    const adjustment = await db.prepare(
      `SELECT * FROM inventory_stock_adjustments WHERE id = ? AND status = 'PENDING_APPROVAL'`,
    ).bind(id).first<Record<string, unknown>>()
    if (!adjustment) return json({ error: 'This Stock Adjustment is not pending approval or has already been processed.' }, 409)
    const stock = await getStock(db, Number(adjustment.inventory_stock_id))
    if (!stock) return json({ error: 'The selected material stock record is unavailable.' }, 409)
    const current = Number(stock.current_stock)
    const qty = Number(adjustment.adjustment_qty)
    const revised = adjustment.adjustment_type === 'INCREASE' ? current + qty : current - qty
    if (revised < 0) return json({ error: `Approval blocked. Latest stock is ${current} KG and cannot be decreased by ${qty} KG.` }, 409)
    if (action === 'preview_approval') return json({ currentStock: current, adjustmentQty: qty, revisedStock: revised, uom: adjustment.uom })
    const expectedCurrent = Number(body.expected_current_stock)
    if (!Number.isFinite(expectedCurrent) || Math.abs(expectedCurrent - current) > 0.000001) {
      return json({ error: `Stock changed after approval confirmation. Latest stock is ${current} ${adjustment.uom}. Review and approve again.` }, 409)
    }
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO inventory_stock_ledger (
            transaction_type, reference_type, reference_id, reference_number, material_type,
            inventory_stock_id, movement, quantity, uom, previous_stock, revised_stock,
            reason, remarks, created_by_user_id, approved_by_user_id
          ) VALUES ('Stock Adjustment','STOCK_ADJUSTMENT',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          id, adjustment.adjustment_number, adjustment.material_type, adjustment.inventory_stock_id,
          adjustment.adjustment_type === 'INCREASE' ? 'IN' : 'OUT', qty, adjustment.uom,
          current, revised, adjustment.reason, adjustment.remarks, adjustment.created_by_user_id, user.id,
        ),
        db.prepare(`UPDATE material_inventory_records
          SET status=CASE WHEN ? <= 0 THEN 'Consumed' ELSE 'Available' END, updated_at=CURRENT_TIMESTAMP
          WHERE id=?`).bind(revised, adjustment.inventory_stock_id),
        db.prepare(
          `UPDATE inventory_stock_adjustments SET status = 'APPROVED', approved_by_user_id = ?,
           approved_by_name = ?, approved_by_email = ?, approved_at = CURRENT_TIMESTAMP,
           revised_stock_snapshot = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING_APPROVAL'`,
        ).bind(user.id, user.fullName, user.email, revised, user.id, id),
        db.prepare(
          `INSERT INTO inventory_stock_adjustment_history
           (adjustment_id, previous_status, new_status, action_type, action_by_user_id, action_by_name)
           VALUES (?, 'PENDING_APPROVAL', 'APPROVED', 'APPROVED', ?, ?)`,
        ).bind(id, user.id, user.fullName),
      ])
      return json({ success: true, revisedStock: revised })
    } catch (error) {
      console.error('[stock-adjustments] approval failed', error)
      return json({ error: 'Approval could not be completed because the stock or adjustment status changed. Refresh and retry.' }, 409)
    }
  }

  if (action === 'reject') {
    if (user.roleName !== 'SUPERADMIN') return json({ error: 'Only SUPERADMIN can reject Stock Adjustments.' }, 403)
    const rejectionReason = text('rejection_reason')
    if (!rejectionReason) return json({ error: 'Rejection Reason is required.' }, 400)
    const updated = await db.prepare(
      `UPDATE inventory_stock_adjustments SET status = 'REJECTED', rejected_by_user_id = ?,
       rejected_by_name = ?, rejected_by_email = ?, rejected_at = CURRENT_TIMESTAMP,
       rejection_reason = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'PENDING_APPROVAL' RETURNING id`,
    ).bind(user.id, user.fullName, user.email, rejectionReason, user.id, id).first()
    if (!updated) return json({ error: 'This Stock Adjustment is not pending approval or has already been processed.' }, 409)
    await db.prepare(
      `INSERT INTO inventory_stock_adjustment_history
       (adjustment_id, previous_status, new_status, action_type, action_by_user_id, action_by_name, remarks)
       VALUES (?, 'PENDING_APPROVAL', 'REJECTED', 'REJECTED', ?, ?, ?)`,
    ).bind(id, user.id, user.fullName, rejectionReason).run()
    return json({ success: true })
  }

  const isExisting = Number.isInteger(id) && id > 0
  if (!await permission(db, user, isExisting ? 'edit' : 'create')) return json({ error: 'Stock Adjustment create or edit access is required.' }, 403)
  const adjustmentDate = text('adjustment_date')
  const materialType = text('material_type')
  const stockId = Number(body.inventory_stock_id)
  const adjustmentType = text('adjustment_type').toUpperCase()
  const quantity = Number(body.adjustment_qty)
  const reason = text('reason')
  const otherReason = text('other_reason')
  const remarks = text('remarks')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adjustmentDate) || !materialType || !Number.isInteger(stockId) || !['INCREASE', 'DECREASE'].includes(adjustmentType) || !(quantity > 0) || !allowedReasons.includes(reason) || !remarks || (reason === 'Other' && !otherReason)) {
    return json({ error: 'Complete all mandatory Stock Adjustment fields with valid values.' }, 400)
  }
  const stock = await getStock(db, stockId)
  if (!stock || stock.material_type !== materialType) return json({ error: 'The selected material stock record is invalid.' }, 400)
  const current = Number(stock.current_stock)
  const revised = adjustmentType === 'INCREASE' ? current + quantity : current - quantity
  if (revised < 0) return json({ error: 'Revised Stock cannot be negative.' }, 400)
  const nextStatus = action === 'submit' ? 'PENDING_APPROVAL' : 'DRAFT'
  const attachment = body.attachment && typeof body.attachment === 'object' ? body.attachment as Record<string, unknown> : {}
  const attachmentName = typeof attachment.name === 'string' ? attachment.name.slice(0, 255) : ''
  const attachmentType = typeof attachment.type === 'string' ? attachment.type.slice(0, 100) : ''
  const attachmentSize = Number(attachment.size)

  if (isExisting) {
    const existing = await db.prepare('SELECT status, created_by_user_id FROM inventory_stock_adjustments WHERE id = ?').bind(id).first<{ status: string; created_by_user_id: number }>()
    if (!existing || !['DRAFT', 'REJECTED'].includes(existing.status) || existing.created_by_user_id !== user.id) return json({ error: 'Only the creator can edit a Draft or Rejected Stock Adjustment.' }, 409)
    await db.prepare(
      `UPDATE inventory_stock_adjustments SET adjustment_date=?, material_type=?, inventory_stock_id=?,
       current_stock_snapshot=?, adjustment_type=?, adjustment_qty=?, revised_stock_snapshot=?, uom='KG',
       reason=?, other_reason=?, remarks=?, attachment_name=?, attachment_type=?, attachment_size=?, status=?,
       submitted_by_user_id=?, submitted_at=?, updated_by_user_id=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).bind(adjustmentDate, materialType, stockId, current, adjustmentType, quantity, revised, reason,
      otherReason || null, remarks, attachmentName || null, attachmentType || null,
      Number.isFinite(attachmentSize) ? attachmentSize : null, nextStatus,
      nextStatus === 'PENDING_APPROVAL' ? user.id : null, nextStatus === 'PENDING_APPROVAL' ? new Date().toISOString() : null,
      user.id, id).run()
    await db.prepare(
      `INSERT INTO inventory_stock_adjustment_history
       (adjustment_id, previous_status, new_status, action_type, action_by_user_id, action_by_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, existing.status, nextStatus, nextStatus === 'PENDING_APPROVAL' ? 'RESUBMITTED' : 'SAVED_DRAFT', user.id, user.fullName).run()
    return json({ success: true, id, status: nextStatus })
  }

  const inserted = await db.prepare(
    `INSERT INTO inventory_stock_adjustments (
      adjustment_date, material_type, inventory_stock_id, current_stock_snapshot, adjustment_type,
      adjustment_qty, revised_stock_snapshot, uom, reason, other_reason, remarks,
      attachment_name, attachment_type, attachment_size, status,
      created_by_user_id, created_by_name, created_by_email, submitted_by_user_id, submitted_at, updated_by_user_id
    ) VALUES (?,?,?,?,?,?,?,'KG',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(adjustmentDate, materialType, stockId, current, adjustmentType, quantity, revised, reason,
    otherReason || null, remarks, attachmentName || null, attachmentType || null,
    Number.isFinite(attachmentSize) ? attachmentSize : null, nextStatus, user.id, user.fullName, user.email,
    nextStatus === 'PENDING_APPROVAL' ? user.id : null, nextStatus === 'PENDING_APPROVAL' ? new Date().toISOString() : null, user.id).run()
  const newId = Number(inserted.meta.last_row_id)
  await db.prepare(
    `INSERT INTO inventory_stock_adjustment_history
     (adjustment_id, previous_status, new_status, action_type, action_by_user_id, action_by_name)
     VALUES (?, NULL, ?, ?, ?, ?)`,
  ).bind(newId, nextStatus, nextStatus === 'PENDING_APPROVAL' ? 'SUBMITTED' : 'SAVED_DRAFT', user.id, user.fullName).run()
  const saved = await db.prepare('SELECT id, adjustment_number, status FROM inventory_stock_adjustments WHERE id = ?').bind(newId).first()
  return json({ success: true, adjustment: saved }, 201)
}
