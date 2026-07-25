import { getZohoCustomers } from '../../lib/customers'
import { getZohoSalesOrderById, getZohoSalesOrdersByCustomer } from '../../lib/salesOrders'
import type { ZohoEnv } from '../../lib/zoho'
import { getPaperItemEligibility } from '../../src/features/paper-purchase-request/config/eligiblePaperItems'
import type { PaperCostInputs, PaperCostResult } from '../../src/features/paper-purchase-request/types/paperPurchaseRequest'
import { calculatePaperCost } from '../../src/features/paper-purchase-request/utils/paperCostCalculations'
import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { loadPaperRequestBySalesOrder } from '../lib/paperPurchaseRequests'
import { hasPaperRequestPermission, PAPER_REQUEST_MENU_KEY } from '../lib/paperRequestPermissions'

interface Env extends ZohoEnv {
  DB?: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

interface SubmittedItem {
  salesOrderItemId?: unknown
  itemId?: unknown
  result?: unknown
}

interface SubmissionBody {
  customerId?: unknown
  salesOrderId?: unknown
  items?: unknown
}

interface ValidatedItem {
  salesOrderItemId: string
  itemId: string
  itemName: string
  itemDescription: string
  orderedQuantity: number
  eligible: boolean
  result: PaperCostResult | null
}

const finitePositive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

function resultToInputs(value: unknown): PaperCostInputs | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Partial<PaperCostResult>
  if (
    !finitePositive(result.calculationQuantity)
    || !finitePositive(result.lengthMm)
    || !finitePositive(result.breadthMm)
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

function validateCalculatedResult(result: PaperCostResult, expectedPly: number): boolean {
  return result.layers.length === expectedPly
    && finitePositive(result.totalPaperRequirementKg)
    && Number.isFinite(result.totalBaseWeightKg)
    && Number.isFinite(result.totalWastageWeightKg)
    && Number.isFinite(result.totalPaperCost)
    && result.layers.every((layer) => (
      Boolean(layer.key)
      && Boolean(layer.label)
      && Boolean(layer.paperType.trim())
      && finitePositive(layer.gsm)
      && finitePositive(layer.bf)
      && finitePositive(layer.drawRatio)
      && finitePositive(layer.totalRequirementKg)
      && Number.isFinite(layer.baseWeightKg)
      && Number.isFinite(layer.wastageWeightKg)
      && Number.isFinite(layer.paperPricePerKg)
      && layer.paperPricePerKg >= 0
      && Number.isFinite(layer.totalPaperCost)
    ))
}

async function nextRequestNumber(db: D1Database): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `PPR-${year}-`
  const row = await db.prepare(
    `SELECT MAX(CAST(SUBSTR(request_number, ?) AS INTEGER)) AS sequence
    FROM paper_purchase_requests
    WHERE request_number LIKE ?`,
  ).bind(prefix.length + 1, `${prefix}%`).first<{ sequence: number | null }>()
  return `${prefix}${String((row?.sequence ?? 0) + 1).padStart(6, '0')}`
}

async function saveRequest(
  db: D1Database,
  requestNumber: string,
  customer: { customer_id: string; customer_name: string },
  salesOrder: { salesorder_id: string; salesorder_number: string },
  user: { id: number; fullName: string },
  items: ValidatedItem[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO paper_purchase_requests (
        request_number, customer_id, customer_name, sales_order_id,
        sales_order_number, request_status, requested_by_user_id,
        requested_by_name, requested_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ).bind(
      requestNumber,
      customer.customer_id,
      customer.customer_name,
      salesOrder.salesorder_id,
      salesOrder.salesorder_number,
      user.id,
      user.fullName,
    ),
  ]
  statements.push(db.prepare(
    `INSERT INTO paper_purchase_request_history (
      paper_request_id, previous_status, new_status, action_type,
      action_by_user_id, action_by_name, action_at, created_at
    ) VALUES (
      (SELECT id FROM paper_purchase_requests WHERE request_number = ?),
      'DRAFT', 'PENDING_APPROVAL', 'SUBMITTED', ?, ?,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`,
  ).bind(requestNumber, user.id, user.fullName))

  for (const item of items) {
    const result = item.result
    statements.push(db.prepare(
      `INSERT INTO paper_purchase_request_items (
        paper_request_id, sales_order_item_id, item_id, item_name,
        item_description, ordered_quantity, is_paper_eligible, item_type,
        length_mm, breadth_mm, height_mm, box_ply, calculation_quantity,
        wastage_percent, area_sq_m, size_cm, deckle_cm, total_base_weight_kg,
        total_wastage_weight_kg, total_paper_requirement_kg, total_paper_cost,
        paper_cost_per_unit, created_at
      ) VALUES (
        (SELECT id FROM paper_purchase_requests WHERE request_number = ?),
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )`,
    ).bind(
      requestNumber,
      item.salesOrderItemId,
      item.itemId,
      item.itemName,
      item.itemDescription,
      item.orderedQuantity,
      item.eligible ? 1 : 0,
      result?.productType ?? 'NON_ELIGIBLE',
      result?.lengthMm ?? null,
      result?.breadthMm ?? null,
      result?.heightMm ?? null,
      result?.boxPly ?? null,
      result?.calculationQuantity ?? null,
      result?.wastagePercent ?? null,
      result?.areaSqM ?? null,
      result?.sizeCm ?? null,
      result?.deckleCm ?? null,
      result?.totalBaseWeightKg ?? null,
      result?.totalWastageWeightKg ?? null,
      result?.totalPaperRequirementKg ?? null,
      result?.totalPaperCost ?? null,
      result?.paperCostPerUnit ?? null,
    ))

    for (const layer of result?.layers ?? []) {
      statements.push(db.prepare(
        `INSERT INTO paper_purchase_request_layers (
          paper_request_item_id, layer_key, layer_name, paper_type, gsm, bf,
          deckle_cm, cut_length_cm, sheet_quantity, paper_weight_kg,
          wastage_factor, total_paper_weight_kg, paper_rate, total_paper_cost,
          draw_ratio, wastage_weight_kg, created_at
        ) VALUES (
          (SELECT i.id FROM paper_purchase_request_items i
            INNER JOIN paper_purchase_requests r ON r.id = i.paper_request_id
            WHERE r.request_number = ? AND i.sales_order_item_id = ?),
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )`,
      ).bind(
        requestNumber,
        item.salesOrderItemId,
        layer.key,
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
      ))
    }
  }

  const results = await db.batch(statements)
  if (results.some((result) => !result.success)) throw new Error('Paper request batch failed')
}

export async function onRequestPost(context: FunctionContext): Promise<Response> {
  if (!context.env.DB) {
    return Response.json({ success: false, error: 'Paper request database is unavailable' }, { status: 500 })
  }

  let body: SubmissionBody
  try {
    body = await context.request.json() as SubmissionBody
  } catch {
    return Response.json({ success: false, error: 'Request body must be valid JSON' }, { status: 400 })
  }

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) {
      return Response.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    if (!await hasPaperRequestPermission(context.env.DB, user, PAPER_REQUEST_MENU_KEY, 'edit')) {
      return Response.json({ success: false, error: 'Paper Purchase Request access required' }, { status: 403 })
    }

    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    const salesOrderId = typeof body.salesOrderId === 'string' ? body.salesOrderId.trim() : ''
    const submittedItems = Array.isArray(body.items) ? body.items as SubmittedItem[] : []
    if (!customerId || !salesOrderId || submittedItems.length === 0) {
      return Response.json({ success: false, error: 'Customer, Sales Order and items are required' }, { status: 400 })
    }

    const existing = await loadPaperRequestBySalesOrder(context.env.DB, salesOrderId)
    if (existing) {
      return Response.json({ success: false, error: 'A Paper Purchase Request already exists for this Sale Order.', request: existing }, { status: 409 })
    }

    const [customers, customerOrders, salesOrder] = await Promise.all([
      getZohoCustomers(context.env),
      getZohoSalesOrdersByCustomer(customerId, context.env),
      getZohoSalesOrderById(salesOrderId, context.env),
    ])
    const customer = customers.find((entry) => entry.customer_id === customerId)
    const orderSummary = customerOrders.find((entry) => entry.salesorder_id === salesOrderId)
    if (!customer || !salesOrder || !orderSummary) {
      return Response.json({ success: false, error: 'The selected Customer or Sales Order is invalid' }, { status: 400 })
    }

    const submittedByLineId = new Map(submittedItems.map((item) => [
      typeof item.salesOrderItemId === 'string' ? item.salesOrderItemId : '',
      item,
    ]))
    if (submittedByLineId.size !== salesOrder.line_items.length) {
      return Response.json({ success: false, error: 'The submitted Sale Order item list is incomplete' }, { status: 400 })
    }

    const validatedItems: ValidatedItem[] = []
    let eligibleCount = 0
    for (const orderItem of salesOrder.line_items) {
      const submitted = submittedByLineId.get(orderItem.line_item_id)
      if (!submitted || submitted.itemId !== orderItem.item_id) {
        return Response.json({ success: false, error: `Sale Order item "${orderItem.name}" does not match the selected order` }, { status: 400 })
      }

      const configuration = getPaperItemEligibility(orderItem.item_id).configuration
      if (!configuration) {
        validatedItems.push({
          salesOrderItemId: orderItem.line_item_id,
          itemId: orderItem.item_id,
          itemName: orderItem.name,
          itemDescription: orderItem.description,
          orderedQuantity: orderItem.quantity,
          eligible: false,
          result: null,
        })
        continue
      }

      eligibleCount += 1
      const inputs = resultToInputs(submitted.result)
      const result = inputs ? calculatePaperCost(configuration.productType, inputs) : null
      if (!result || !validateCalculatedResult(result, configuration.defaultPly)) {
        return Response.json({
          success: false,
          error: `Complete the paper requirement for Sale Order item "${orderItem.name}" before submitting the request.`,
          salesOrderItemId: orderItem.line_item_id,
        }, { status: 400 })
      }

      validatedItems.push({
        salesOrderItemId: orderItem.line_item_id,
        itemId: orderItem.item_id,
        itemName: orderItem.name,
        itemDescription: orderItem.description,
        orderedQuantity: orderItem.quantity,
        eligible: true,
        result,
      })
    }

    if (eligibleCount === 0) {
      return Response.json({ success: false, error: 'This Sale Order has no eligible paper items' }, { status: 400 })
    }

    let requestNumber = ''
    for (let attempt = 0; attempt < 3; attempt += 1) {
      requestNumber = await nextRequestNumber(context.env.DB)
      try {
        await saveRequest(context.env.DB, requestNumber, customer, orderSummary, user, validatedItems)
        const saved = await loadPaperRequestBySalesOrder(context.env.DB, salesOrderId)
        return Response.json({ success: true, request: saved }, { status: 201 })
      } catch (caughtError) {
        console.error('[paper-purchase-requests] Atomic insert attempt failed', {
          attempt: attempt + 1,
          message: caughtError instanceof Error ? caughtError.message : 'Unknown D1 batch error',
        })
        const duplicate = await loadPaperRequestBySalesOrder(context.env.DB, salesOrderId)
        if (duplicate) {
          return Response.json({ success: false, error: 'A Paper Purchase Request already exists for this Sale Order.', request: duplicate }, { status: 409 })
        }
      }
    }

    console.error('[paper-purchase-requests] Atomic insert failed')
    return Response.json({ success: false, error: 'Unable to save the Paper Purchase Request' }, { status: 500 })
  } catch {
    console.error('[paper-purchase-requests] Unexpected submission failure')
    return Response.json({ success: false, error: 'Unable to submit the Paper Purchase Request' }, { status: 500 })
  }
}
