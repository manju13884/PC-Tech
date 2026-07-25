import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import {
  hasPaperRequestPermission,
  PAPER_PO_CALCULATION_MENU_KEY,
} from '../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
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

    const result = await db.prepare(
      `SELECT request.id, request.request_number, request.requested_at,
        request.customer_id, request.customer_name, request.sales_order_id,
        request.sales_order_number, request.approved_at, request.approved_by_name,
        COUNT(DISTINCT CASE WHEN item.is_paper_eligible = 1 THEN item.id END) AS eligible_item_count,
        COALESCE(SUM(CASE WHEN item.is_paper_eligible = 1 THEN item.total_paper_requirement_kg ELSE 0 END), 0) AS paper_requirement_kg
      FROM paper_purchase_requests request
      LEFT JOIN paper_purchase_request_items item ON item.paper_request_id = request.id
      WHERE request.request_status = 'APPROVED'
      GROUP BY request.id
      ORDER BY request.approved_at ASC, request.id ASC`,
    ).all<{
      id: number
      request_number: string
      requested_at: string
      customer_id: string
      customer_name: string
      sales_order_id: string
      sales_order_number: string
      approved_at: string | null
      approved_by_name: string | null
      eligible_item_count: number
      paper_requirement_kg: number
    }>()

    return Response.json({
      success: true,
      requests: result.results.map((request) => ({
        id: request.id,
        requestNumber: request.request_number,
        requestDate: request.requested_at,
        customerId: request.customer_id,
        customerName: request.customer_name,
        salesOrderId: request.sales_order_id,
        salesOrderNumber: request.sales_order_number,
        approvedAt: request.approved_at,
        approvedByName: request.approved_by_name,
        eligibleItemCount: request.eligible_item_count,
        paperRequirementKg: request.paper_requirement_kg,
        status: 'APPROVED',
      })),
    })
  } catch {
    console.error('[paper-po-calculation] Unable to load approved requests')
    return Response.json({ success: false, error: 'Unable to load approved Paper Purchase Requests' }, { status: 500 })
  }
}
