import { getZohoSalesOrderById } from '../../lib/salesOrders'
import type { ZohoEnv } from '../../lib/zoho'
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from '../lib/authenticatedUser'

interface Env extends ZohoEnv {
  DB?: D1Database
}
interface Context {
  request: Request
  env: Env
}
interface SubmittedLine {
  salesOrderId?: unknown
  lineItemId?: unknown
  productionQuantity?: unknown
  twoPlyQuantity?: unknown
  deckleSize?: unknown
  productionDate?: unknown
  deliveryDate?: unknown
}

const ACTIVE_STATUSES =
  "'PLANNED', 'TAKEN_FOR_PRODUCTION', 'PARTIALLY_COMPLETED', 'COMPLETED', 'ON_HOLD'"
const json = (payload: unknown, status = 200) =>
  Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

async function permission(
  db: D1Database,
  user: AuthenticatedUser,
  action: 'view' | 'draft' | 'generate',
) {
  if (user.roleName === 'SUPERADMIN') return true
  const menuKey = action === 'view' ? 'production-planned' : 'production-planning'
  const row = await db
    .prepare(
      `SELECT can_full, can_view, can_create, can_edit FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = ?`,
    )
    .bind(user.roleId, menuKey)
    .first<{
      can_full: number
      can_view: number
      can_create: number
      can_edit: number
    }>()
  if (!row) return false
  if (row.can_full === 1) return true
  if (action === 'view') return row.can_view === 1
  if (action === 'draft') return row.can_create === 1 || row.can_edit === 1
  return false
}

function financialYear(date = new Date()) {
  const india = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  )
  const year = india.getFullYear()
  const start = india.getMonth() >= 3 ? year : year - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

const todayInIndia = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db)
    return json({ error: 'Production Planning database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!(await permission(db, user, 'view')))
    return json({ error: 'Production Planned view access is required.' }, 403)
  const requestedId = new URL(context.request.url).searchParams.get('id')
  const view = new URL(context.request.url).searchParams.get('view')
  if (view === 'lines') {
    const lines = await db.prepare(
      `SELECT line.id, plan.id AS plan_id, plan.plan_number, plan.plan_date, plan.status AS plan_status,
       line.customer_name, line.sales_order_number, line.delivery_date, line.item_name, line.item_description,
       line.production_quantity, line.two_ply_quantity, line.deckle_size, line.uom, line.product_type, line.ply,
       spec.polar_canvas_item_code AS specification_code, spec.length_mm, spec.width_mm, spec.height_mm, spec.attributes_json
       FROM production_plan_lines line
       INNER JOIN production_plans plan ON plan.id = line.production_plan_id
       LEFT JOIN product_specification_records spec ON spec.id = line.approved_specification_revision_id
       WHERE plan.deleted_at IS NULL ORDER BY plan.created_at DESC, line.id`,
    ).all()
    return json({ lines: lines.results ?? [] })
  }
  if (requestedId) {
    const planId = Number(requestedId)
    if (!Number.isInteger(planId) || planId <= 0) return json({ error: 'A valid Production Plan is required.' }, 400)
    const plan = await db.prepare(
      `SELECT id, plan_number, plan_date, status, priority, remarks, total_sales_orders, total_customers,
       total_line_items, created_by_name, created_at, updated_at
       FROM production_plans WHERE id = ? AND deleted_at IS NULL`,
    ).bind(planId).first()
    if (!plan) return json({ error: 'Production Plan not found.' }, 404)
    const lines = await db.prepare(
      `SELECT line.id, line.customer_name, line.sales_order_number, line.sales_order_date,
       line.item_name, line.item_description, line.customer_po_number, line.delivery_date,
       line.ordered_quantity, line.previously_planned_quantity, line.balance_quantity,
       line.production_quantity, line.uom, line.product_type, line.ply, line.line_status,
       spec.polar_canvas_item_code AS specification_code
       FROM production_plan_lines line
       LEFT JOIN product_specification_records spec ON spec.id = line.approved_specification_revision_id
       WHERE line.production_plan_id = ? ORDER BY line.id`,
    ).bind(planId).all()
    return json({ plan, lines: lines.results ?? [] })
  }
  const result = await db
    .prepare(
      `SELECT plan.id, plan.plan_number, plan.plan_date, plan.status, plan.priority, plan.remarks,
       plan.total_sales_orders, plan.total_customers, plan.total_line_items,
       plan.created_by_name, plan.created_at, plan.updated_at,
       COALESCE(SUM(line.production_quantity), 0) AS total_production_quantity
     FROM production_plans plan LEFT JOIN production_plan_lines line ON line.production_plan_id = plan.id
     WHERE plan.deleted_at IS NULL GROUP BY plan.id ORDER BY plan.created_at DESC LIMIT 100`,
    )
    .all()
  return json({ plans: result.results ?? [] })
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db)
    return json({ error: 'Production Planning database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  const body = await context.request
    .json<Record<string, unknown>>()
    .catch(() => ({}))
  const draft = body.action === 'draft'
  if (!(await permission(db, user, draft ? 'draft' : 'generate'))) {
    return json(
      {
        error: draft
          ? 'Create or edit access is required.'
          : 'Full access is required to generate a Production Plan.',
      },
      403,
    )
  }
  const submitted = Array.isArray(body.lines)
    ? (body.lines as SubmittedLine[])
    : []
  if (submitted.length === 0)
    return json(
      { error: 'Include at least one valid Production Plan line.' },
      400,
    )

  const quantities = new Map<string, number>()
  const productionDates = new Map<string, string>()
  const deliveryDates = new Map<string, string>()
  const twoPlyQuantities = new Map<string, number | null>()
  const deckleSizes = new Map<string, string>()
  const orderIds = new Set<string>()
  for (const entry of submitted) {
    const orderId =
      typeof entry.salesOrderId === 'string' ? entry.salesOrderId.trim() : ''
    const lineId =
      typeof entry.lineItemId === 'string' ? entry.lineItemId.trim() : ''
    const quantity = Number(entry.productionQuantity)
    const twoPlyQuantity = entry.twoPlyQuantity == null || entry.twoPlyQuantity === '' ? null : Number(entry.twoPlyQuantity)
    const deckleSize = typeof entry.deckleSize === 'string' ? entry.deckleSize.trim().slice(0, 100) : ''
    const productionDate =
      typeof entry.productionDate === 'string' ? entry.productionDate.trim() : ''
    const deliveryDate =
      typeof entry.deliveryDate === 'string' ? entry.deliveryDate.trim() : ''
    const minimumDate = todayInIndia()
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(productionDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
    )
      return json({ error: 'Select both Production Date and Delivery Date.' }, 400)
    if (productionDate < minimumDate || deliveryDate < minimumDate)
      return json({ error: 'Previous dates cannot be selected.' }, 400)
    if (
      !orderId ||
      !lineId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantities.has(lineId)
    ) {
      return json(
        {
          error:
            'Every included row requires a valid positive Production Quantity.',
        },
        400,
      )
    }
    quantities.set(lineId, quantity)
    twoPlyQuantities.set(lineId, Number.isFinite(twoPlyQuantity) && twoPlyQuantity! >= 0 ? twoPlyQuantity : null)
    deckleSizes.set(lineId, deckleSize)
    productionDates.set(lineId, productionDate)
    deliveryDates.set(lineId, deliveryDate)
    orderIds.add(orderId)
  }

  try {
    const orders = (
      await Promise.all(
        [...orderIds].map((id) => getZohoSalesOrderById(id, context.env)),
      )
    ).filter((order): order is NonNullable<typeof order> => Boolean(order))
    if (orders.length !== orderIds.size)
      return json(
        { error: 'A selected Sales Order is no longer available.' },
        409,
      )
    const remoteLines = new Map(
      orders.flatMap((order) =>
        order.line_items.map(
          (line) => [line.line_item_id, { order, line }] as const,
        ),
      ),
    )
    if ([...quantities.keys()].some((id) => !remoteLines.has(id)))
      return json(
        {
          error:
            'A Sales Order line changed after selection. Refresh and retry.',
        },
        409,
      )

    const lineIds = [...quantities.keys()]
    const placeholders = lineIds.map(() => '?').join(', ')
    const [plannedResult, mappingResult] = await Promise.all([
      db
        .prepare(
          `SELECT line.zoho_sales_order_line_item_id AS line_id, SUM(line.production_quantity) AS quantity
         FROM production_plan_lines line INNER JOIN production_plans plan ON plan.id = line.production_plan_id
         WHERE line.zoho_sales_order_line_item_id IN (${placeholders}) AND plan.deleted_at IS NULL
           AND plan.status IN (${ACTIVE_STATUSES}) GROUP BY line.zoho_sales_order_line_item_id`,
        )
        .bind(...lineIds)
        .all<{ line_id: string; quantity: number }>(),
      db
        .prepare(
          `SELECT mapping.sales_order_line_item_id AS line_id, mapping.product_specification_id,
           mapping.customer_id, mapping.customer_name, spec.specification_type, spec.ply
         FROM so_specification_mappings mapping INNER JOIN product_specification_records spec ON spec.id = mapping.product_specification_id
         WHERE mapping.sales_order_line_item_id IN (${placeholders})`,
        )
        .bind(...lineIds)
        .all<{
          line_id: string
          product_specification_id: number
          customer_id: string
          customer_name: string
          specification_type: string
          ply: number | null
        }>(),
    ])
    const planned = new Map(
      (plannedResult.results ?? []).map((row) => [
        row.line_id,
        Number(row.quantity) || 0,
      ]),
    )
    const mappings = new Map(
      (mappingResult.results ?? []).map((row) => [row.line_id, row]),
    )
    for (const [lineId, quantity] of quantities) {
      const remote = remoteLines.get(lineId)!
      const balance = remote.line.quantity - (planned.get(lineId) ?? 0)
      if (quantity > balance)
        return json(
          {
            error: `Production quantity cannot exceed the available Sales Order balance of ${balance}.`,
            lineItemId: lineId,
          },
          409,
        )
      if (!mappings.has(lineId))
        return json(
          {
            error:
              'An approved Customer Product Specification is not available for one or more items.',
            lineItemId: lineId,
          },
          409,
        )
    }

    if (new Set(productionDates.values()).size !== 1)
      return json({ error: 'Use one Production Date for the Production Plan.' }, 400)
    const planDate = productionDates.values().next().value as string
    const status = draft ? 'DRAFT' : 'PLANNED'
    const fy = financialYear()
    const last = await db
      .prepare(
        `SELECT MAX(CAST(SUBSTR(plan_number, 9) AS INTEGER)) AS sequence FROM production_plans WHERE plan_number LIKE ?`,
      )
      .bind(`PP-${fy}-%`)
      .first<{ sequence: number | null }>()
    const planNumber = `PP-${fy}-${String((Number(last?.sequence) || 0) + 1).padStart(5, '0')}`
    const customerIds = new Set<string>()
    const statements: D1PreparedStatement[] = []
    statements.push(
      db
        .prepare(
          `INSERT INTO production_plans (plan_number, plan_date, status, priority, remarks, total_sales_orders, total_customers,
       total_line_items, created_by_user_id, created_by_name, created_by_email, updated_by_user_id, updated_by_name, updated_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          planNumber,
          planDate,
          status,
          typeof body.priority === 'string' ? body.priority : 'NORMAL',
          typeof body.remarks === 'string' ? body.remarks.trim() : '',
          orderIds.size,
          0,
          submitted.length,
          user.id,
          user.fullName,
          user.email,
          user.id,
          user.fullName,
          user.email,
        ),
    )
    for (const [lineId, quantity] of quantities) {
      const { order, line } = remoteLines.get(lineId)!
      const mapping = mappings.get(lineId)!
      customerIds.add(mapping.customer_id)
      const previous = planned.get(lineId) ?? 0
      statements.push(
        db
          .prepare(
            `INSERT INTO production_plan_lines (production_plan_id, zoho_customer_id, customer_name, zoho_sales_order_id,
         sales_order_number, sales_order_date, zoho_sales_order_line_item_id, zoho_item_id, item_name, item_description,
         customer_po_number, delivery_date, ordered_quantity, previously_planned_quantity, balance_quantity,
         production_quantity, two_ply_quantity, deckle_size, uom, customer_product_specification_id, approved_specification_revision_id, product_type, ply)
         VALUES ((SELECT id FROM production_plans WHERE plan_number = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            planNumber,
            mapping.customer_id,
            mapping.customer_name,
            order.salesorder_id,
            order.salesorder_number,
            order.date ?? '',
            line.line_item_id,
            line.item_id,
            line.name,
            line.description,
            order.reference_number ?? '',
            deliveryDates.get(lineId),
            line.quantity,
            previous,
            line.quantity - previous,
            quantity,
            twoPlyQuantities.get(lineId),
            deckleSizes.get(lineId),
            line.unit,
            mapping.product_specification_id,
            mapping.product_specification_id,
            mapping.specification_type,
            mapping.ply,
          ),
      )
    }
    statements[0] = db
      .prepare(
        `INSERT INTO production_plans (plan_number, plan_date, status, priority, remarks, total_sales_orders, total_customers,
       total_line_items, created_by_user_id, created_by_name, created_by_email, updated_by_user_id, updated_by_name, updated_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        planNumber,
        planDate,
        status,
        typeof body.priority === 'string' ? body.priority : 'NORMAL',
        typeof body.remarks === 'string' ? body.remarks.trim() : '',
        orderIds.size,
        customerIds.size,
        submitted.length,
        user.id,
        user.fullName,
        user.email,
        user.id,
        user.fullName,
        user.email,
      )
    statements.push(
      db
        .prepare(
          `INSERT INTO production_plan_status_history (production_plan_id, previous_status, new_status, changed_by_user_id,
       changed_by_name, changed_by_email, source_context) VALUES ((SELECT id FROM production_plans WHERE plan_number = ?), NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(
          planNumber,
          status,
          user.id,
          user.fullName,
          user.email,
          context.request.headers.get('CF-Connecting-IP') ?? 'session',
        ),
    )
    await db.batch(statements)
    return json(
      {
        success: true,
        planNumber,
        status,
        message: draft
          ? `Production Plan ${planNumber} has been saved as Draft.`
          : `Production Plan ${planNumber} has been generated successfully.`,
      },
      201,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error('[production-plans] submission failed', error)
    if (message.includes('production_quantity_exceeds_balance'))
      return json(
        {
          error:
            'Another Production Plan consumed the available quantity. Refresh and retry.',
        },
        409,
      )
    if (message.includes('UNIQUE'))
      return json(
        { error: 'A concurrent Production Plan was generated. Please retry.' },
        409,
      )
    return json(
      {
        error:
          'Unable to save the Production Plan. No partial plan was retained.',
      },
      500,
    )
  }
}
