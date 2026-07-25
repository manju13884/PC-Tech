import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import {
  hasPaperRequestPermission,
  PAPER_REQUEST_APPROVALS_MENU_KEY,
} from '../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
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
      'approve',
    )) {
      return Response.json({ success: false, error: 'Paper Purchase Request approval access required' }, { status: 403 })
    }

    const result = await context.env.DB.prepare(
      `SELECT
        request.id,
        request.request_number,
        request.customer_name,
        request.sales_order_number,
        request.requested_by_name,
        request.requested_at,
        request.request_status,
        COUNT(item.id) AS total_items,
        COALESCE(SUM(item.is_paper_eligible), 0) AS eligible_items
      FROM paper_purchase_requests request
      LEFT JOIN paper_purchase_request_items item ON item.paper_request_id = request.id
      WHERE request.request_status = 'PENDING_APPROVAL'
      GROUP BY request.id
      ORDER BY request.requested_at DESC, request.id DESC`,
    ).all<{
      id: number
      request_number: string
      customer_name: string
      sales_order_number: string
      requested_by_name: string | null
      requested_at: string
      request_status: string
      total_items: number
      eligible_items: number
    }>()

    return Response.json({
      success: true,
      requests: result.results.map((request) => ({
        id: request.id,
        requestNumber: request.request_number,
        customerName: request.customer_name,
        salesOrderNumber: request.sales_order_number,
        requestedByName: request.requested_by_name,
        requestedAt: request.requested_at,
        status: request.request_status,
        totalItems: request.total_items,
        eligibleItems: request.eligible_items,
      })),
    })
  } catch {
    console.error('[paper-request-approvals] Unable to load pending requests')
    return Response.json({ success: false, error: 'Unable to load pending Paper Purchase Requests' }, { status: 500 })
  }
}
