import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import { loadPaperRequestBySalesOrder } from '../../lib/paperPurchaseRequests'
import {
  hasPaperRequestPermission,
  PAPER_REQUEST_APPROVALS_MENU_KEY,
} from '../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
  params: { requestId?: string }
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) {
    return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    if (!await hasPaperRequestPermission(
      context.env.DB,
      user,
      PAPER_REQUEST_APPROVALS_MENU_KEY,
      'view',
    )) {
      return Response.json({ success: false, error: 'Paper Purchase Request approval access required' }, { status: 403 })
    }

    const requestId = Number(context.params.requestId)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return Response.json({ success: false, error: 'A valid request ID is required' }, { status: 400 })
    }
    const row = await context.env.DB.prepare(
      'SELECT sales_order_id FROM paper_purchase_requests WHERE id = ? LIMIT 1',
    ).bind(requestId).first<{ sales_order_id: string }>()
    if (!row) return Response.json({ success: false, error: 'Paper Purchase Request not found' }, { status: 404 })

    const request = await loadPaperRequestBySalesOrder(context.env.DB, row.sales_order_id)
    return Response.json({ success: true, request })
  } catch {
    console.error('[paper-request-approvals] Unable to load request details')
    return Response.json({ success: false, error: 'Unable to load Paper Purchase Request details' }, { status: 500 })
  }
}
