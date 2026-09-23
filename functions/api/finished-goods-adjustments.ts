import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { fgAllowed, fgBalance, fgStock } from '../lib/finishedGoodsStock'
import { fgAdjustmentReasons } from '../../src/features/inventory/fgAdjustmentReasons'

interface Context { request: Request; env: { DB?: D1Database } }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  try {
    const db = env.DB
    if (!db) return json({ error: 'FG Stock database is unavailable.' }, 503)
    const user = await getAuthenticatedUser(request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    if (!await fgAllowed(db, user, 'adjust')) return json({ error: 'FG Stock edit/full access is required to adjust stock.' }, 403)
    const id = Number(new URL(request.url).searchParams.get('job_card_id'))
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Select a valid Job Card.' }, 400)
    const row = await fgStock(db, id)
    if (!row) return json({ error: 'FG Stock record not found.' }, 404)
    if (row.status !== 'COMPLETED') return json({ error: 'Complete the Production Job before adjusting FG stock.' }, 409)
    return json(fgBalance(row))
  } catch (error) {
    console.error('[fg-adjustment] load failed', error)
    return json({ error: 'Unable to load FG stock. Please retry.' }, 500)
  }
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  try {
    const db = env.DB
    if (!db) return json({ error: 'FG Stock database is unavailable.' }, 503)
    const user = await getAuthenticatedUser(request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    if (!await fgAllowed(db, user, 'adjust')) return json({ error: 'FG Stock edit/full access is required to adjust stock.' }, 403)
    const body = await request.json() as Record<string, unknown>
    const id = Number(body.job_card_id), quantity = Number(body.adjustment_quantity), previous = Number(body.previous_closing_stock)
    const type = String(body.adjustment_type ?? ''), reason = String(body.reason ?? '').trim(), remarks = String(body.remarks ?? '').trim(), requestId = String(body.request_id ?? '')
    if (!Number.isSafeInteger(id) || id <= 0 || !['INCREASE','DECREASE'].includes(type) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(previous) || previous < 0 || body.previous_closing_stock == null || !/^[\w-]{16,100}$/.test(requestId))
      return json({ error: 'Select Increase or Decrease and enter Adjustment Qty greater than 0.' }, 400)
    if (!fgAdjustmentReasons.some(value => value === reason)) return json({ error: 'Select a valid adjustment Reason.' }, 400)
    if (reason === 'Other' && !remarks) return json({ error: 'Remarks are required when Reason is Other.' }, 400)
    if (remarks.length > 1000) return json({ error: 'Remarks cannot exceed 1,000 characters.' }, 400)
    const existing = await db.prepare('SELECT job_card_id,adjustment_type,adjustment_quantity,reason,remarks,created_by_user_id FROM finished_goods_adjustments WHERE request_id=?').bind(requestId).first<{job_card_id:number;adjustment_type:string;adjustment_quantity:number;reason:string;remarks:string;created_by_user_id:number}>()
    if (existing) {
      if (existing.job_card_id !== id || existing.adjustment_type !== type || existing.adjustment_quantity !== quantity || existing.reason !== reason || existing.remarks !== remarks || existing.created_by_user_id !== user.id) return json({ error: 'This adjustment request has already been used.' }, 409)
      return json({ success: true })
    }
    const row = await fgStock(db, id)
    if (!row) return json({ error: 'FG Stock record not found.' }, 404)
    if (row.status !== 'COMPLETED') return json({ error: 'Complete the Production Job before adjusting FG stock.' }, 409)
    if (previous !== row.closing_stock) return json({ error: `FG stock changed. Available FG stock is ${row.closing_stock} ${row.uom || 'Nos'}. Review and retry.`, ...fgBalance(row) }, 409)
    if (type === 'DECREASE' && quantity > row.closing_stock) return json({ error: `Adjustment Qty cannot exceed available FG stock of ${row.closing_stock} ${row.uom || 'Nos'}.`, ...fgBalance(row) }, 409)
    if (!Number.isFinite(row.closing_stock + (type === 'INCREASE' ? quantity : -quantity))) return json({ error: 'Enter a smaller Adjustment Qty.' }, 400)
    try {
      await db.prepare(`INSERT INTO finished_goods_adjustments
        (request_id,job_card_id,production_plan_line_id,customer_id,customer_name,sales_order_id,sales_order_number,item_id,job_number,adjustment_type,adjustment_quantity,reason,remarks,previous_closing_stock,uom,created_by_user_id,created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(requestId,id,row.production_plan_line_id,row.customer_id,row.customer_name,row.sales_order_id || '',row.sales_order_number || '',row.item_id || '',row.job_number,type,quantity,reason,remarks,previous,row.uom || 'Nos',user.id,user.fullName).run()
    } catch (error) {
      if (String(error).includes('fg_stock_changed')) {
        const latest = await fgStock(db, id)
        return json({ error: `FG stock changed. Available FG stock is ${latest?.closing_stock ?? 0} ${row.uom || 'Nos'}. Review and retry.`, ...(latest ? fgBalance(latest) : {}) }, 409)
      }
      if (String(error).includes('UNIQUE')) return json({ error: 'This adjustment was already recorded. Refresh the report before retrying.' }, 409)
      throw error
    }
    return json({ success: true })
  } catch (error) {
    console.error('[fg-adjustment] save failed', error)
    return json({ error: 'Unable to confirm adjustment. Please retry.' }, 500)
  }
}
