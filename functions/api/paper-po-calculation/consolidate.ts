import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import { consolidateApprovedPaperRows, type PaperPoSourceRow } from '../../lib/paperPoConsolidation'
import {
  hasPaperRequestPermission,
  PAPER_PO_CALCULATION_MENU_KEY,
} from '../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })
  let body: { paperRequestIds?: unknown }
  try {
    body = await context.request.json() as typeof body
  } catch {
    return Response.json({ success: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, db)
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    if (!await hasPaperRequestPermission(db, user, PAPER_PO_CALCULATION_MENU_KEY, 'view')) {
      return Response.json({ success: false, error: 'You do not have permission to access Paper PO Calculation.' }, { status: 403 })
    }

    const suppliedIds = Array.isArray(body.paperRequestIds) ? body.paperRequestIds : []
    if (suppliedIds.length === 0) {
      return Response.json({ success: false, error: 'Select at least one approved Paper Purchase Request' }, { status: 400 })
    }
    if (suppliedIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) {
      return Response.json({ success: false, error: 'Every Paper Purchase Request ID must be valid' }, { status: 400 })
    }
    const ids = [...new Set(suppliedIds.map(Number))]
    const placeholders = ids.map(() => '?').join(', ')
    const headerResult = await db.prepare(
      `SELECT id, request_number, request_status
      FROM paper_purchase_requests
      WHERE id IN (${placeholders})`,
    ).bind(...ids).all<{ id: number; request_number: string; request_status: string }>()
    const byId = new Map(headerResult.results.map((request) => [request.id, request]))
    for (const id of ids) {
      const request = byId.get(id)
      if (!request) {
        return Response.json({ success: false, error: `Paper Purchase Request ID ${id} does not exist.` }, { status: 400 })
      }
      if (request.request_status !== 'APPROVED') {
        return Response.json({
          success: false,
          error: `Paper Purchase Request ${request.request_number} is no longer approved and cannot be included.`,
        }, { status: 409 })
      }
    }

    const rows = await db.prepare(
      `SELECT request.id AS paperRequestId, request.request_number AS requestNumber,
        request.customer_name AS customerName, request.sales_order_id AS salesOrderId,
        request.sales_order_number AS salesOrderNumber, item.id AS paperRequestItemId,
        item.item_name AS itemName, item.item_type AS itemType,
        item.length_mm AS lengthMm, item.breadth_mm AS breadthMm,
        layer.layer_key AS layerKey, layer.layer_name AS layerName,
        layer.paper_type AS paperType, layer.gsm, layer.bf,
        layer.deckle_cm AS deckleCm, layer.cut_length_cm AS cutLengthCm,
        layer.total_paper_weight_kg AS quantity
      FROM paper_purchase_requests request
      INNER JOIN paper_purchase_request_items item
        ON item.paper_request_id = request.id AND item.is_paper_eligible = 1
      INNER JOIN paper_purchase_request_layers layer
        ON layer.paper_request_item_id = item.id
      WHERE request.id IN (${placeholders})
        AND request.request_status = 'APPROVED'
      ORDER BY request.id, item.id, layer.id`,
    ).bind(...ids).all<PaperPoSourceRow>()
    if (rows.results.length === 0) {
      return Response.json({ success: false, error: 'Selected requests have no stored eligible paper layers' }, { status: 400 })
    }

    const calculation = consolidateApprovedPaperRows(rows.results)
    const saleOrders = new Set(rows.results.map((row) => row.salesOrderId))
    const customers = new Set(rows.results.map((row) => row.customerName))
    const totalsByUnit = calculation.consolidatedRows.reduce<Record<string, number>>((totals, row) => {
      totals[row.unit] = (totals[row.unit] ?? 0) + row.consolidatedQuantity
      return totals
    }, {})
    return Response.json({
      success: true,
      selectedRequestCount: ids.length,
      selectedSaleOrderCount: saleOrders.size,
      selectedCustomerCount: customers.size,
      sourcePaperRowCount: rows.results.length,
      consolidatedGroupCount: calculation.consolidatedRows.length,
      rowsRequiringReview: calculation.incompleteSpecificationRows.length,
      totalsByUnit,
      ...calculation,
    })
  } catch {
    console.error('[paper-po-calculation] Consolidation failed')
    return Response.json({ success: false, error: 'Unable to calculate the consolidated paper requirement.' }, { status: 500 })
  }
}
