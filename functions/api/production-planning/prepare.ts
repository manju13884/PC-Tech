import { getZohoSalesOrderById } from '../../../lib/salesOrders'
import type { ZohoEnv } from '../../../lib/zoho'
import { getAuthenticatedUser } from '../../lib/authenticatedUser'

interface Env extends ZohoEnv {
  DB?: D1Database
}
interface Context {
  request: Request
  env: Env
}

const json = (payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

async function canView(db: D1Database, roleId: number, roleName: string) {
  if (roleName === 'SUPERADMIN') return true
  const row = await db
    .prepare(
      `SELECT 1 AS allowed FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'production-planning' AND (can_full = 1 OR can_view = 1)`,
    )
    .bind(roleId)
    .first()
  return Boolean(row)
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db)
    return json({ error: 'Production Planning database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!(await canView(db, user.roleId, user.roleName)))
    return json({ error: 'Production Planning view access is required.' }, 403)

  const body = await context.request
    .json<{ salesOrderIds?: unknown }>()
    .catch(() => ({}))
  const salesOrderIds = Array.isArray(body.salesOrderIds)
    ? [
        ...new Set(
          body.salesOrderIds
            .filter(
              (id): id is string =>
                typeof id === 'string' && Boolean(id.trim()),
            )
            .map((id) => id.trim()),
        ),
      ].slice(0, 50)
    : []
  if (salesOrderIds.length === 0)
    return json({ error: 'Select at least one Sales Order.' }, 400)

  try {
    const orders = (
      await Promise.all(
        salesOrderIds.map((id) => getZohoSalesOrderById(id, context.env)),
      )
    ).filter((order): order is NonNullable<typeof order> => Boolean(order))
    if (orders.length !== salesOrderIds.length)
      return json(
        { error: 'One or more selected Sales Orders are no longer available.' },
        409,
      )

    const lineIds = orders.flatMap((order) =>
      order.line_items.map((line) => line.line_item_id),
    )
    if (lineIds.length === 0)
      return json(
        { error: 'The selected Sales Orders have no eligible line items.' },
        400,
      )
    const placeholders = lineIds.map(() => '?').join(', ')
    const [plannedResult, mappingResult] = await Promise.all([
      db
        .prepare(
          `SELECT line.zoho_sales_order_line_item_id AS line_id, SUM(line.production_quantity) AS planned_quantity
         FROM production_plan_lines line
         INNER JOIN production_plans plan ON plan.id = line.production_plan_id
         WHERE (line.zoho_sales_order_line_item_id IN (${placeholders})
           OR substr(line.zoho_sales_order_line_item_id, 1, instr(line.zoho_sales_order_line_item_id, ':child:') - 1) IN (${placeholders}))
           AND plan.deleted_at IS NULL
           AND plan.status IN ('PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD')
         GROUP BY line.zoho_sales_order_line_item_id`,
        )
        .bind(...lineIds, ...lineIds)
        .all<{ line_id: string; planned_quantity: number }>(),
      db
        .prepare(
          `SELECT mapping.sales_order_line_item_id AS line_id, mapping.sales_order_line_item_id AS source_line_id,
           mapping.product_specification_id,
           spec.polar_canvas_item_code, spec.specification_type, spec.length_mm, spec.width_mm, spec.height_mm,
           spec.ply, spec.attributes_json, spec.item_id, spec.item_name, spec.product_name,
           NULL AS mapped_quantity, 0 AS is_additional
         FROM so_specification_mappings mapping
         INNER JOIN product_specification_records spec ON spec.id = mapping.product_specification_id
         WHERE mapping.sales_order_line_item_id IN (${placeholders})
         UNION ALL
         SELECT child.sales_order_line_item_id || ':child:' || child.product_specification_id AS line_id,
           child.sales_order_line_item_id AS source_line_id, child.product_specification_id,
           spec.polar_canvas_item_code, spec.specification_type, spec.length_mm, spec.width_mm, spec.height_mm,
           spec.ply, spec.attributes_json, spec.item_id, spec.item_name, spec.product_name,
           child.quantity AS mapped_quantity, 1 AS is_additional
         FROM so_line_child_specifications child
         INNER JOIN product_specification_records spec ON spec.id = child.product_specification_id
         WHERE child.sales_order_line_item_id IN (${placeholders}) AND child.is_active = 1`,
        )
        .bind(...lineIds, ...lineIds)
        .all<{
          line_id: string
          source_line_id: string
          product_specification_id: number
          polar_canvas_item_code: string
          specification_type: string
          length_mm: number | null
          width_mm: number | null
          height_mm: number | null
          ply: number | null
          attributes_json: string
          item_id: string
          item_name: string
          product_name: string
          mapped_quantity: number | null
          is_additional: number
        }>(),
    ])
    const planned = new Map(
      (plannedResult.results ?? []).map((row) => [
        row.line_id,
        Number(row.planned_quantity) || 0,
      ]),
    )
    const mappingRows = mappingResult.results ?? []
    const openStatuses = new Set(['open', 'partiallyinvoiced', 'overdue'])

    const lines = orders.flatMap((order) => {
      const normalizedStatus = (order.status ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
      const orderOpen = !normalizedStatus || openStatuses.has(normalizedStatus)
      return order.line_items.flatMap((line) => {
        const lineMappings = mappingRows.filter((mapping) => mapping.source_line_id === line.line_item_id)
        const primaryMapping = lineMappings.find((mapping) => !mapping.is_additional)
        const rows = primaryMapping ? [primaryMapping, ...lineMappings.filter((mapping) => mapping.is_additional)] : []
        if (!rows.length) rows.push(undefined as unknown as typeof primaryMapping)
        return rows.map((mapping) => {
        const planningLineId = mapping?.line_id ?? line.line_item_id
        const additional = Boolean(mapping?.is_additional)
        const orderedQuantity = additional ? Number(mapping?.mapped_quantity) || 0 : line.quantity
        const invoicedQuantity = additional ? 0 : Math.min(line.quantity, Math.max(0, line.quantity_invoiced))
        const remainingQuantity = Math.max(0, orderedQuantity - invoicedQuantity)
        const childPreviouslyPlanned = planned.get(planningLineId) ?? 0
        const balance = Math.max(0, remainingQuantity - childPreviouslyPlanned)
        let attributes: Record<string, unknown> = {}
        try {
          attributes = mapping?.attributes_json
            ? JSON.parse(mapping.attributes_json)
            : {}
        } catch {
          /* invalid legacy attributes stay empty */
        }
        const ready = orderOpen && balance > 0 && Boolean(mapping)
        return {
          customerId: order.customer_id ?? '',
          customerName: order.customer_name ?? '',
          salesOrderId: order.salesorder_id,
          salesOrderNumber: order.salesorder_number,
          salesOrderDate: order.date ?? '',
          customerPoNumber: order.reference_number ?? '',
          deliveryDate: order.shipment_date ?? '',
          lineItemId: planningLineId,
          sourceLineItemId: line.line_item_id,
          isAdditionalProduct: additional,
          itemId: additional ? mapping?.item_id ?? '' : line.item_id,
          itemName: additional ? mapping?.product_name || mapping?.item_name || '' : line.name,
          itemDescription: additional ? `Additional Product for ${line.name}` : line.description,
          orderedQuantity,
          invoicedQuantity,
          remainingQuantity,
          previouslyPlannedQuantity: childPreviouslyPlanned,
          balanceQuantity: balance,
          productionQuantity: balance,
          uom: line.unit,
          productSpecificationId: mapping?.product_specification_id ?? null,
          specificationRevisionId: mapping?.product_specification_id ?? null,
          specificationCode: mapping?.polar_canvas_item_code ?? '',
          productType: mapping?.specification_type ?? '',
          lengthMm: mapping?.length_mm ?? null,
          widthMm: mapping?.width_mm ?? null,
          heightMm: mapping?.height_mm ?? null,
          ply: mapping?.ply ?? null,
          specificationAttributes: attributes,
          productionStatus: !orderOpen
            ? 'VALIDATION_REQUIRED'
            : !mapping
              ? 'SPECIFICATION_MISSING'
              : balance <= 0
                ? 'FULLY_PLANNED'
                : 'READY',
          included: ready,
        }})
      })
    })
    return json({
      lines: lines.filter(
        (line) =>
          line.balanceQuantity > 0 ||
          line.productionStatus === 'SPECIFICATION_MISSING',
      ),
    })
  } catch (error) {
    console.error(
      '[production-planning-prepare] Unable to prepare selected Sales Orders',
      error,
    )
    return json(
      { error: 'Unable to prepare the selected Sales Orders. Please retry.' },
      502,
    )
  }
}
