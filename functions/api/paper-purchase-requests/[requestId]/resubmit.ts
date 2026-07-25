import { getPaperItemEligibility } from '../../../../src/features/paper-purchase-request/config/eligiblePaperItems'
import type { PaperCostInputs, PaperCostResult } from '../../../../src/features/paper-purchase-request/types/paperPurchaseRequest'
import { calculatePaperCost } from '../../../../src/features/paper-purchase-request/utils/paperCostCalculations'
import { getAuthenticatedUser } from '../../../lib/authenticatedUser'
import {
  hasPaperRequestPermission,
  PAPER_REQUEST_MENU_KEY,
} from '../../../lib/paperRequestPermissions'

interface Context {
  request: Request
  env: { DB?: D1Database }
  params: { requestId?: string }
}

interface SubmittedItem {
  salesOrderItemId?: unknown
  itemId?: unknown
  result?: unknown
}

const positive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

function toInputs(value: unknown): PaperCostInputs | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Partial<PaperCostResult>
  if (
    !positive(result.calculationQuantity)
    || !positive(result.lengthMm)
    || !positive(result.breadthMm)
    || typeof result.wastagePercent !== 'number'
    || !Number.isFinite(result.wastagePercent)
    || result.wastagePercent < 0
    || !Array.isArray(result.layers)
  ) return null

  return {
    calculationQuantity: String(result.calculationQuantity),
    lengthMm: String(result.lengthMm),
    breadthMm: String(result.breadthMm),
    heightMm: result.heightMm == null ? '' : String(result.heightMm),
    wastagePercent: String(result.wastagePercent),
    layers: result.layers.map((layer) => ({
      key: typeof layer.key === 'string' ? layer.key : '',
      label: typeof layer.label === 'string' ? layer.label : '',
      paperType: typeof layer.paperType === 'string' ? layer.paperType : '',
      otherPaperType: '',
      gsm: String(layer.gsm),
      bf: String(layer.bf),
      paperPricePerKg: String(layer.paperPricePerKg),
      drawRatio: String(layer.drawRatio),
    })),
  }
}

function validResult(result: PaperCostResult, ply: number): boolean {
  return result.layers.length === ply
    && positive(result.totalPaperRequirementKg)
    && result.layers.every((layer) => (
      Boolean(layer.key)
      && Boolean(layer.label)
      && Boolean(layer.paperType.trim())
      && positive(layer.gsm)
      && positive(layer.bf)
      && positive(layer.drawRatio)
      && positive(layer.totalRequirementKg)
      && Number.isFinite(layer.baseWeightKg)
      && Number.isFinite(layer.wastageWeightKg)
      && Number.isFinite(layer.paperPricePerKg)
      && layer.paperPricePerKg >= 0
      && Number.isFinite(layer.totalPaperCost)
    ))
}

export async function onRequestPut(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })

  let body: { customerId?: unknown; salesOrderId?: unknown; items?: unknown }
  try {
    body = await context.request.json() as typeof body
  } catch {
    return Response.json({ success: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, db)
    if (!user) return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    if (!await hasPaperRequestPermission(db, user, PAPER_REQUEST_MENU_KEY, 'edit')) {
      return Response.json({ success: false, error: 'Paper Purchase Request access required' }, { status: 403 })
    }

    const requestId = Number(context.params.requestId)
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    const salesOrderId = typeof body.salesOrderId === 'string' ? body.salesOrderId.trim() : ''
    const submittedItems = Array.isArray(body.items) ? body.items as SubmittedItem[] : []
    if (!Number.isInteger(requestId) || requestId <= 0 || !customerId || !salesOrderId) {
      return Response.json({ success: false, error: 'Request, Customer and Sales Order are required' }, { status: 400 })
    }

    const header = await db.prepare(
      `SELECT id, customer_id, sales_order_id, request_status
      FROM paper_purchase_requests WHERE id = ? LIMIT 1`,
    ).bind(requestId).first<{
      id: number
      customer_id: string
      sales_order_id: string
      request_status: string
    }>()
    if (!header) return Response.json({ success: false, error: 'Paper Purchase Request not found' }, { status: 404 })
    if (header.request_status !== 'REJECTED') {
      return Response.json({ success: false, error: 'Only a rejected Paper Purchase Request can be resubmitted' }, { status: 409 })
    }
    if (header.customer_id !== customerId || header.sales_order_id !== salesOrderId) {
      return Response.json({ success: false, error: 'Customer and Sales Order cannot be changed during resubmission' }, { status: 400 })
    }

    const itemResult = await db.prepare(
      `SELECT id, sales_order_item_id, item_id, item_name, is_paper_eligible
      FROM paper_purchase_request_items
      WHERE paper_request_id = ?
      ORDER BY id`,
    ).bind(requestId).all<{
      id: number
      sales_order_item_id: string
      item_id: string
      item_name: string
      is_paper_eligible: number
    }>()
    const submittedByLineId = new Map(submittedItems.map((item) => [
      typeof item.salesOrderItemId === 'string' ? item.salesOrderItemId : '',
      item,
    ]))
    if (submittedByLineId.size !== itemResult.results.length) {
      return Response.json({ success: false, error: 'The submitted Sale Order item list is incomplete' }, { status: 400 })
    }

    const calculated = new Map<number, PaperCostResult>()
    for (const item of itemResult.results) {
      const submitted = submittedByLineId.get(item.sales_order_item_id)
      if (!submitted || submitted.itemId !== item.item_id) {
        return Response.json({ success: false, error: `Sale Order item "${item.item_name}" does not match the saved request` }, { status: 400 })
      }
      if (item.is_paper_eligible !== 1) continue

      const configuration = getPaperItemEligibility(item.item_id).configuration
      const inputs = toInputs(submitted.result)
      const result = configuration && inputs
        ? calculatePaperCost(configuration.productType, inputs)
        : null
      if (!configuration || !result || !validResult(result, configuration.defaultPly)) {
        return Response.json({
          success: false,
          error: `Complete the paper requirement for Sale Order item "${item.item_name}" before resubmitting the request.`,
          salesOrderItemId: item.sales_order_item_id,
        }, { status: 400 })
      }
      const savedLayers = await db.prepare(
        `SELECT layer_key
        FROM paper_purchase_request_layers
        WHERE paper_request_item_id = ?
        ORDER BY id`,
      ).bind(item.id).all<{ layer_key: string }>()
      const savedKeys = savedLayers.results.map((layer) => layer.layer_key)
      const submittedKeys = result.layers.map((layer) => layer.key)
      if (
        savedKeys.length !== submittedKeys.length
        || savedKeys.some((key) => !submittedKeys.includes(key))
      ) {
        return Response.json({
          success: false,
          error: `The saved paper layers for Sale Order item "${item.item_name}" do not match the submitted correction.`,
        }, { status: 400 })
      }
      calculated.set(item.id, result)
    }
    if (calculated.size === 0) {
      return Response.json({ success: false, error: 'The request has no eligible paper items' }, { status: 400 })
    }

    const statements: D1PreparedStatement[] = []
    for (const item of itemResult.results) {
      const result = calculated.get(item.id)
      if (!result) continue
      statements.push(db.prepare(
        `UPDATE paper_purchase_request_items
        SET length_mm = ?, breadth_mm = ?, height_mm = ?, box_ply = ?,
          calculation_quantity = ?, wastage_percent = ?, area_sq_m = ?,
          size_cm = ?, deckle_cm = ?, total_base_weight_kg = ?,
          total_wastage_weight_kg = ?, total_paper_requirement_kg = ?,
          total_paper_cost = ?, paper_cost_per_unit = ?
        WHERE id = ? AND paper_request_id = ?
          AND EXISTS (
            SELECT 1 FROM paper_purchase_requests
            WHERE id = ? AND request_status = 'REJECTED'
          )`,
      ).bind(
        result.lengthMm,
        result.breadthMm,
        result.heightMm ?? null,
        result.boxPly,
        result.calculationQuantity,
        result.wastagePercent,
        result.areaSqM,
        result.sizeCm ?? null,
        result.deckleCm ?? null,
        result.totalBaseWeightKg,
        result.totalWastageWeightKg,
        result.totalPaperRequirementKg,
        result.totalPaperCost,
        result.paperCostPerUnit,
        item.id,
        requestId,
        requestId,
      ))

      for (const layer of result.layers) {
        statements.push(db.prepare(
          `UPDATE paper_purchase_request_layers
          SET layer_name = ?, paper_type = ?, gsm = ?, bf = ?,
            deckle_cm = ?, cut_length_cm = ?, sheet_quantity = ?,
            paper_weight_kg = ?, wastage_factor = ?,
            total_paper_weight_kg = ?, paper_rate = ?, total_paper_cost = ?,
            draw_ratio = ?, wastage_weight_kg = ?
          WHERE paper_request_item_id = ? AND layer_key = ?
            AND EXISTS (
              SELECT 1
              FROM paper_purchase_request_items item
              INNER JOIN paper_purchase_requests request
                ON request.id = item.paper_request_id
              WHERE item.id = ? AND request.id = ?
                AND request.request_status = 'REJECTED'
            )`,
        ).bind(
          layer.label,
          layer.paperType,
          layer.gsm,
          layer.bf,
          result.deckleCm ?? null,
          result.sizeCm ?? null,
          result.calculationQuantity,
          layer.baseWeightKg,
          1 + (result.wastagePercent / 100),
          layer.totalRequirementKg,
          layer.paperPricePerKg,
          layer.totalPaperCost,
          layer.drawRatio,
          layer.wastageWeightKg,
          item.id,
          layer.key,
          item.id,
          requestId,
        ))
      }
    }

    statements.push(
      db.prepare(
        `UPDATE paper_purchase_requests
        SET request_status = 'PENDING_APPROVAL',
          requested_by_user_id = ?, requested_by_name = ?,
          requested_at = CURRENT_TIMESTAMP, resubmitted_at = CURRENT_TIMESTAMP,
          resubmission_count = resubmission_count + 1,
          rejection_reason = NULL, rejected_by_user_id = NULL,
          rejected_by_name = NULL, rejected_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND request_status = 'REJECTED'`,
      ).bind(user.id, user.fullName, requestId),
      db.prepare(
        `INSERT INTO paper_purchase_request_history (
          paper_request_id, previous_status, new_status, action_type,
          action_by_user_id, action_by_name, action_at, created_at
        )
        SELECT ?, 'REJECTED', 'PENDING_APPROVAL', 'RESUBMITTED', ?, ?,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        WHERE changes() = 1`,
      ).bind(requestId, user.id, user.fullName),
    )

    const results = await db.batch(statements)
    const headerUpdate = results[results.length - 2]
    if (!headerUpdate.success || headerUpdate.meta.changes !== 1) {
      return Response.json({ success: false, error: 'This request is no longer available for resubmission' }, { status: 409 })
    }
    return Response.json({ success: true, status: 'PENDING_APPROVAL', requestId })
  } catch {
    console.error('[paper-purchase-requests] Resubmission failed')
    return Response.json({ success: false, error: 'Unable to resubmit the Paper Purchase Request' }, { status: 500 })
  }
}
