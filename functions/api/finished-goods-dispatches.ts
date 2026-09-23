import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { getZohoInvoiceById, getZohoInvoicesByCustomer } from '../../lib/invoices'
import type { ZohoEnv } from '../../lib/zoho'
import { fgAllowed as allowed, fgStock as stock, fgBalance } from '../lib/finishedGoodsStock'

interface Context { request: Request; env: ZohoEnv & { DB?: D1Database } }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const available = (row: { closing_stock: number }) => Number(row.closing_stock)

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  try {
    const db = env.DB
    if (!db) return json({ error: 'FG Stock database is unavailable.' }, 503)
    const user = await getAuthenticatedUser(request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    if (!await allowed(db, user)) return json({ error: 'FG Stock view access is required.' }, 403)
    const url = new URL(request.url), id = Number(url.searchParams.get('job_card_id'))
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Select a valid Job Card.' }, 400)
    const row = await stock(db, id)
    if (!row) return json({ error: 'FG Stock record not found.' }, 404)
    if (url.searchParams.get('action') === 'invoices') {
      if (!await allowed(db, user, 'dispatch')) return json({ error: 'FG Stock create access is required to dispatch.' }, 403)
      if (row.status !== 'COMPLETED' || available(row) <= 0 || !row.customer_id) return json({ error: 'No completed FG stock is available to dispatch.' }, 409)
      const invoices = (await getZohoInvoicesByCustomer(row.customer_id, env)).filter(invoice => invoice.customer_id === row.customer_id && !['void', 'deleted'].includes(invoice.status.toLowerCase()))
      // Prefer exact Zoho Sales Order references; retain other customer invoices when references are absent.
      invoices.sort((left, right) => Number(Boolean(right.sales_order_numbers?.includes(row.sales_order_number))) - Number(Boolean(left.sales_order_numbers?.includes(row.sales_order_number))))
      return json({ invoices, ...fgBalance(row) })
    }
    const history = await db.prepare(`SELECT invoice_number,dispatch_quantity,dispatch_date,created_by_name,created_at FROM finished_goods_dispatches WHERE job_card_id=? ORDER BY id DESC`).bind(id).all()
    const transactions = await db.prepare(`SELECT * FROM (
      SELECT 0 AS sort_order,0 AS transaction_id,'PRODUCTION' AS type,card.job_number AS reference,card.manufactured_quantity AS quantity,
        COALESCE((SELECT MAX(completed_at) FROM job_card_process_entries WHERE job_card_id=card.id AND process_status='COMPLETED'),card.updated_at,card.created_at) AS occurred_at,
        '' AS created_by_name,'' AS reason,'' AS remarks
      FROM job_cards card WHERE card.id=? AND card.status='COMPLETED'
      UNION ALL
      SELECT 1,id,'DISPATCH',invoice_number,-dispatch_quantity,dispatch_date,created_by_name,'',''
      FROM finished_goods_dispatches WHERE job_card_id=?
      UNION ALL
      SELECT 1,id,'ADJUSTMENT_' || adjustment_type,'FG-ADJ-' || id,
        CASE WHEN adjustment_type='INCREASE' THEN adjustment_quantity ELSE -adjustment_quantity END,
        created_at,created_by_name,reason,remarks FROM finished_goods_adjustments WHERE job_card_id=?
    ) ORDER BY sort_order,occurred_at,transaction_id`).bind(id,id,id).all()
    return json({ history: history.results ?? [], transactions: transactions.results ?? [], ...fgBalance(row) })
  } catch (error) {
    console.error('[fg-dispatch] load failed', error)
    return json({ error: 'Unable to load FG dispatch details. Please retry.' }, 502)
  }
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const db = env.DB
  if (!db) return json({ error: 'FG Stock database is unavailable.' }, 503)
  try {
    const user = await getAuthenticatedUser(request, db)
    if (!user) return json({ error: 'Authentication required.' }, 401)
    if (!await allowed(db, user, 'dispatch')) return json({ error: 'FG Stock create access is required to dispatch.' }, 403)
    const body = await request.json() as Record<string, unknown>
    const id = Number(body.job_card_id), qty = Number(body.dispatch_quantity), previous = Number(body.previous_dispatched_quantity), previousClosing = Number(body.previous_closing_stock)
    const invoiceId = String(body.zoho_invoice_id ?? '').trim(), date = String(body.dispatch_date ?? ''), requestId = String(body.request_id ?? '')
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(previous) || previous < 0 || body.previous_dispatched_quantity == null || !Number.isFinite(previousClosing) || previousClosing < 0 || body.previous_closing_stock == null || !invoiceId || !/^[\w-]{16,100}$/.test(requestId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)
      return json({ error: 'Select an invoice, a valid dispatch date, and Dispatch Qty greater than 0.' }, 400)
    const existing = await db.prepare('SELECT job_card_id,zoho_invoice_id,dispatch_quantity,dispatch_date,created_by_user_id FROM finished_goods_dispatches WHERE request_id=?').bind(requestId).first<{job_card_id:number;zoho_invoice_id:string;dispatch_quantity:number;dispatch_date:string;created_by_user_id:number}>()
    if (existing) {
      if (existing.job_card_id !== id || existing.zoho_invoice_id !== invoiceId || existing.dispatch_quantity !== qty || existing.dispatch_date !== date || existing.created_by_user_id !== user.id) return json({ error: 'This dispatch request has already been used.' }, 409)
      return json({ success: true })
    }
    const row = await stock(db, id)
    if (!row) return json({ error: 'FG Stock record not found.' }, 404)
    if (row.status !== 'COMPLETED') return json({ error: 'Complete the Production Job before dispatching FG stock.' }, 409)
    if (qty > available(row) || previous !== Number(row.dispatched_quantity) || previousClosing !== available(row)) return json({ error: `Dispatch Qty cannot exceed available FG stock of ${available(row)} ${row.uom || 'Nos'}. Stock may have changed; review and retry.`, ...fgBalance(row) }, 409)
    const invoice = await getZohoInvoiceById(invoiceId, env)
    if (!invoice || invoice.customer_id !== row.customer_id || !invoice.invoice_number || ['void','deleted'].includes(invoice.status.toLowerCase())) return json({ error: 'Select a valid invoice belonging to this FG stock customer.' }, 400)
    try {
      await db.prepare(`INSERT INTO finished_goods_dispatches
        (request_id,job_card_id,production_plan_line_id,customer_id,customer_name,sales_order_id,sales_order_number,item_id,job_number,zoho_invoice_id,invoice_number,dispatch_quantity,previous_dispatched_quantity,uom,dispatch_date,created_by_user_id,created_by_name,previous_closing_stock)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(requestId,id,row.production_plan_line_id,row.customer_id,row.customer_name,row.sales_order_id || '',row.sales_order_number || '',row.item_id || '',row.job_number,invoice.invoice_id,invoice.invoice_number,qty,previous,row.uom || 'Nos',date,user.id,user.fullName,previousClosing).run()
    } catch (error) {
      if (String(error).includes('fg_stock_changed')) {
        const current = await stock(db, id)
        return json({ error: `FG stock changed. Available FG stock is ${current ? available(current) : 0} ${row.uom || 'Nos'}. Review and retry.`, ...(current ? fgBalance(current) : { closing_stock: 0 }) }, 409)
      }
      if (String(error).includes('UNIQUE')) return json({ error: 'This dispatch request was already recorded. Refresh the report before retrying.' }, 409)
      throw error
    }
    return json({ success: true })
  } catch (error) {
    console.error('[fg-dispatch] save failed', error)
    return json({ error: 'Unable to confirm dispatch. Please retry.' }, 502)
  }
}
