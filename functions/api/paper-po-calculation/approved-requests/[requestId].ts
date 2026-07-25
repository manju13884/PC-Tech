import { getAuthenticatedUser } from '../../../lib/authenticatedUser'
import { loadPaperRequestBySalesOrder } from '../../../lib/paperPurchaseRequests'
import {
  hasPaperRequestPermission,
  PAPER_PO_CALCULATION_MENU_KEY,
} from '../../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
  params: { requestId?: string }
}

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })
  try {
    const user = await getAuthenticatedUser(context.request, db)
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    if (!await hasPaperRequestPermission(db, user, PAPER_PO_CALCULATION_MENU_KEY, 'view')) {
      return Response.json({ success: false, error: 'You do not have permission to access Paper PO Calculation.' }, { status: 403 })
    }
    const requestId = Number(context.params.requestId)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return Response.json({ success: false, error: 'A valid request ID is required' }, { status: 400 })
    }
    const header = await db.prepare(
      `SELECT sales_order_id FROM paper_purchase_requests
      WHERE id = ? AND request_status = 'APPROVED' LIMIT 1`,
    ).bind(requestId).first<{ sales_order_id: string }>()
    if (!header) return Response.json({ success: false, error: 'Approved Paper Purchase Request not found' }, { status: 404 })
    return Response.json({
      success: true,
      request: await loadPaperRequestBySalesOrder(db, header.sales_order_id),
    })
  } catch {
    console.error('[paper-po-calculation] Unable to load approved request details')
    return Response.json({ success: false, error: 'Unable to load approved request details' }, { status: 500 })
  }
}
