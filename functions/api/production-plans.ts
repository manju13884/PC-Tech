import { getZohoSalesOrderById } from '../../lib/salesOrders'
import { cachedSalesOrder } from '../../lib/salesOrderCache'
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
  topSheetQuantity?: unknown
  twoPlyQuantity?: unknown
  deckleSize?: unknown
  cutLengthCm?: unknown
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
  action: 'view' | 'draft' | 'generate' | 'unplan',
) {
  if (user.roleName === 'SUPERADMIN') return true
  const menuKey = action === 'view' || action === 'unplan' ? 'production-planned' : 'production-planning'
  const row = await db
    .prepare(
      `SELECT can_full, can_view, can_create, can_edit, can_delete FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = ?`,
    )
    .bind(user.roleId, menuKey)
    .first<{
      can_full: number
      can_view: number
      can_create: number
      can_edit: number
      can_delete: number
    }>()
  if (!row) return false
  if (row.can_full === 1) return true
  if (action === 'view') return row.can_view === 1
  if (action === 'unplan') return row.can_delete === 1
  if (action === 'draft') return row.can_create === 1 || row.can_edit === 1
  return false
}

export async function onRequestDelete(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Production Planning database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!(await permission(db, user, 'unplan')))
    return json({ error: 'Delete access is required to unplan Production activities.' }, 403)

  const lineId = Number(new URL(context.request.url).searchParams.get('line_id'))
  if (!Number.isInteger(lineId) || lineId <= 0)
    return json({ error: 'A valid Production activity is required.' }, 400)

  const line = await db.prepare(
    `SELECT line.id, line.production_plan_id,
      CASE WHEN plan.closure_status = 'CLOSED' THEN 'CLOSED' ELSE plan.status END AS effective_status,
      (SELECT COUNT(*) FROM job_cards card WHERE card.production_plan_line_id = line.id) AS job_card_count
     FROM production_plan_lines line
     INNER JOIN production_plans plan ON plan.id = line.production_plan_id
     WHERE line.id = ? AND plan.deleted_at IS NULL`,
  ).bind(lineId).first<{
    id: number
    production_plan_id: number
    effective_status: string
    job_card_count: number
  }>()
  if (!line) return json({ error: 'Production activity was not found.' }, 404)
  if (!['PLANNED', 'DRAFT'].includes(line.effective_status))
    return json({ error: `${line.effective_status} Production activities cannot be unplanned.` }, 409)
  const cards = await db.prepare(
    `SELECT card.id,card.job_number,card.status,
      CASE WHEN COALESCE(card.manufactured_quantity,0)>0
        OR EXISTS(SELECT 1 FROM job_card_process_entries entry WHERE entry.job_card_id=card.id
          AND (entry.process_status='COMPLETED' OR COALESCE(entry.out_quantity,0)>0 OR COALESCE(entry.out_quantity_2,0)>0))
        OR EXISTS(SELECT 1 FROM job_tracking_reel_consumptions consumption WHERE consumption.job_card_id=card.id)
      THEN 1 ELSE 0 END AS has_transactions
     FROM job_cards card WHERE card.production_plan_line_id=? ORDER BY card.id`,
  ).bind(lineId).all<{ id:number; job_number:string; status:string; has_transactions:number }>()
  const linkedCards = cards.results ?? []
  const active = linkedCards.find((card) => card.status === 'IN_PROGRESS')
  if (active) return json({ error:`Job Card ${active.job_number} has active Job Tracking. Cancel Job Tracking before unplanning this production activity.` },409)
  const protectedCard = linkedCards.find((card) => card.status === 'COMPLETED' || card.has_transactions)
  if (protectedCard) return json({ error:`This production activity cannot be unplanned because Job Card ${protectedCard.job_number} contains production/inventory transactions. Reverse the related production activity before unplanning.` },409)
  const removeJobCards = new URL(context.request.url).searchParams.get('remove_job_cards') === 'true'
  if (linkedCards.length && !removeJobCards)
    return json({ error:'Linked unused Job Cards must be removed before unplanning.', code:'JOB_CARDS_REMOVAL_REQUIRED', jobCards:linkedCards.map((card) => ({ id:card.id, jobNumber:card.job_number })) },409)

  const jobIds = linkedCards.map((card) => card.id)
  const placeholders = jobIds.map(() => '?').join(',')
  const statements: D1PreparedStatement[] = []
  if (jobIds.length) {
    statements.push(db.prepare(`DELETE FROM inventory_reel_reservations WHERE job_card_id IN (${placeholders})`).bind(...jobIds))
    statements.push(db.prepare(`DELETE FROM job_card_process_entries WHERE job_card_id IN (${placeholders})`).bind(...jobIds))
    statements.push(db.prepare(`DELETE FROM job_cards WHERE id IN (${placeholders}) AND status IN ('CREATED','CANCELLED') AND COALESCE(manufactured_quantity,0)<=0 AND NOT EXISTS(SELECT 1 FROM job_tracking_reel_consumptions WHERE job_card_id=job_cards.id)`).bind(...jobIds))
  }
  statements.push(
    db.prepare(
      `DELETE FROM production_plan_lines
       WHERE id = ? AND production_plan_id = ?
         AND NOT EXISTS (SELECT 1 FROM job_cards card WHERE card.production_plan_line_id = production_plan_lines.id)
         AND EXISTS (
           SELECT 1 FROM production_plans plan
           WHERE plan.id = production_plan_lines.production_plan_id
             AND plan.deleted_at IS NULL
             AND plan.status IN ('PLANNED', 'DRAFT')
             AND plan.closure_status <> 'CLOSED'
         )`,
    ).bind(line.id, line.production_plan_id),
    db.prepare(
      `UPDATE production_plans
       SET total_sales_orders = (
         SELECT COUNT(DISTINCT zoho_sales_order_id) FROM production_plan_lines WHERE production_plan_id = ?
       ), total_customers = (
         SELECT COUNT(DISTINCT zoho_customer_id) FROM production_plan_lines WHERE production_plan_id = ?
       ), total_line_items = (
         SELECT COUNT(*) FROM production_plan_lines WHERE production_plan_id = ?
       ), deleted_at = CASE WHEN NOT EXISTS (
         SELECT 1 FROM production_plan_lines WHERE production_plan_id = ?
       ) THEN CURRENT_TIMESTAMP ELSE deleted_at END,
       updated_by_user_id = ?, updated_by_name = ?, updated_by_email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('PLANNED', 'DRAFT') AND closure_status <> 'CLOSED'`,
    ).bind(
      line.production_plan_id,
      line.production_plan_id,
      line.production_plan_id,
      line.production_plan_id,
      user.id,
      user.fullName,
      user.email,
      line.production_plan_id,
    ),
  )
  const results = await db.batch(statements)
  const lineDeleteIndex = jobIds.length ? 3 : 0
  if (!results[lineDeleteIndex].meta.changes)
    return json({ error: 'The Production activity could not be unplanned because its workflow changed.' }, 409)
  if (linkedCards.length) await db.batch(linkedCards.map((card) => db.prepare(`INSERT INTO job_card_status_history (job_card_id,job_number,previous_status,new_status,reason,changed_by_user_id,changed_by_name) VALUES (NULL,?,?, 'REMOVED','Job Card removed during Production activity unplan',?,?)`).bind(card.job_number,card.status,user.id,user.fullName)))
  return json({ success: true, message: jobIds.length ? 'Job Card removed and production activity unplanned successfully.' : 'Production activity unplanned successfully.' })
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
  if (view === 'unplan') {
    const lineId = Number(new URL(context.request.url).searchParams.get('line_id'))
    if (!Number.isInteger(lineId) || lineId <= 0) return json({ error:'A valid Production activity is required.' },400)
    const cards = await db.prepare(
      `SELECT card.id,card.job_number,card.status,
        CASE WHEN COALESCE(card.manufactured_quantity,0)>0
          OR EXISTS(SELECT 1 FROM job_card_process_entries entry WHERE entry.job_card_id=card.id AND (entry.process_status='COMPLETED' OR COALESCE(entry.out_quantity,0)>0 OR COALESCE(entry.out_quantity_2,0)>0))
          OR EXISTS(SELECT 1 FROM job_tracking_reel_consumptions consumption WHERE consumption.job_card_id=card.id)
        THEN 1 ELSE 0 END AS has_transactions
       FROM job_cards card WHERE card.production_plan_line_id=? ORDER BY card.id`,
    ).bind(lineId).all<{ id:number; job_number:string; status:string; has_transactions:number }>()
    return json({ jobCards:(cards.results ?? []).map((card) => ({ id:card.id,jobNumber:card.job_number,status:card.status,hasTransactions:Boolean(card.has_transactions) })) })
  }
  if (view === 'lines') {
    const lines = await db.prepare(
      `SELECT line.id, plan.id AS plan_id, plan.plan_number, plan.plan_date,
       CASE WHEN plan.closure_status = 'CLOSED' THEN 'CLOSED' ELSE plan.status END AS plan_status,
       line.customer_name, line.sales_order_number, line.delivery_date, line.item_name, line.item_description,
       line.production_quantity, line.top_sheet_quantity, line.two_ply_quantity, line.deckle_size, line.cut_length_cm, line.uom, line.product_type, line.ply,
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
      `SELECT id, plan_number, plan_date,
       CASE WHEN closure_status = 'CLOSED' THEN 'CLOSED' ELSE status END AS status,
       priority, remarks, total_sales_orders, total_customers,
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
      `SELECT plan.id, plan.plan_number, plan.plan_date,
       CASE WHEN plan.closure_status = 'CLOSED' THEN 'CLOSED' ELSE plan.status END AS status,
       plan.priority, plan.remarks,
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
  const topSheetQuantities = new Map<string, number>()
  const twoPlyQuantities = new Map<string, number | null>()
  const deckleSizes = new Map<string, string>()
  const cutLengthsCm = new Map<string, number>()
  const orderIds = new Set<string>()
  for (const entry of submitted) {
    const orderId =
      typeof entry.salesOrderId === 'string' ? entry.salesOrderId.trim() : ''
    const lineId =
      typeof entry.lineItemId === 'string' ? entry.lineItemId.trim() : ''
    const quantity = Number(entry.productionQuantity)
    const topSheetQuantity = Number(entry.topSheetQuantity)
    if (!Number.isFinite(topSheetQuantity) || topSheetQuantity <= 0)
      return json({ error: 'Every included row requires a valid positive Top Sheet quantity.' }, 400)
    const twoPlyQuantity = entry.twoPlyQuantity == null || entry.twoPlyQuantity === '' ? null : Number(entry.twoPlyQuantity)
    const deckleSizeCm = typeof entry.deckleSize === 'string' ? Number(entry.deckleSize.trim()) : Number.NaN
    const deckleSize = Number.isFinite(deckleSizeCm) && deckleSizeCm >= 0
      ? String(Number((deckleSizeCm * 10).toFixed(3)))
      : ''
    const cutLengthCm = Number(entry.cutLengthCm)
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
    if (productionDate < minimumDate)
      return json({ error: 'Production Date cannot be in the past.' }, 400)
    if (
      !orderId ||
      !lineId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(cutLengthCm) ||
      cutLengthCm <= 0 ||
      quantities.has(lineId)
    ) {
      return json(
        {
          error:
            'Every included row requires a valid positive Production Quantity and Cut Length in CM.',
        },
        400,
      )
    }
    quantities.set(lineId, quantity)
    topSheetQuantities.set(lineId, topSheetQuantity)
    twoPlyQuantities.set(lineId, Number.isFinite(twoPlyQuantity) && twoPlyQuantity! >= 0 ? twoPlyQuantity : null)
    deckleSizes.set(lineId, deckleSize)
    cutLengthsCm.set(lineId, cutLengthCm)
    productionDates.set(lineId, productionDate)
    deliveryDates.set(lineId, deliveryDate)
    orderIds.add(orderId)
  }

  try {
    const orders = (
      await Promise.all(
        [...orderIds].map((id) => cachedSalesOrder(context.env, id, () => getZohoSalesOrderById(id, context.env), true)),
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
          `SELECT mapping.sales_order_line_item_id AS line_id, mapping.sales_order_line_item_id AS source_line_id,
           mapping.product_specification_id, mapping.customer_id, mapping.customer_name,
           spec.specification_type, spec.ply, spec.item_id, spec.item_name, spec.product_name,
           NULL AS mapped_quantity, 0 AS is_additional
         FROM so_specification_mappings mapping INNER JOIN product_specification_records spec ON spec.id = mapping.product_specification_id
         WHERE mapping.sales_order_line_item_id IN (${placeholders})
         UNION ALL
         SELECT child.sales_order_line_item_id || ':child:' || child.product_specification_id AS line_id,
           child.sales_order_line_item_id AS source_line_id, child.product_specification_id,
           parent.customer_id, parent.customer_name, spec.specification_type, spec.ply,
           spec.item_id, spec.item_name, spec.product_name, child.quantity AS mapped_quantity, 1 AS is_additional
         FROM so_line_child_specifications child
         INNER JOIN so_specification_mappings parent
           ON parent.sales_order_id = child.sales_order_id AND parent.sales_order_line_item_id = child.sales_order_line_item_id
         INNER JOIN product_specification_records spec ON spec.id = child.product_specification_id
         WHERE child.sales_order_line_item_id || ':child:' || child.product_specification_id IN (${placeholders})
           AND child.is_active = 1`,
        )
        .bind(...lineIds, ...lineIds)
        .all<{
          line_id: string
          source_line_id: string
          product_specification_id: number
          customer_id: string
          customer_name: string
          specification_type: string
          ply: number | null
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
        Number(row.quantity) || 0,
      ]),
    )
    const mappings = new Map(
      (mappingResult.results ?? []).map((row) => [row.line_id, row]),
    )
    for (const mapping of mappingResult.results ?? []) {
      if (!mapping.is_additional) continue
      const source = remoteLines.get(mapping.source_line_id)
      if (!source) continue
      remoteLines.set(mapping.line_id, {
        order: source.order,
        line: {
          ...source.line,
          line_item_id: mapping.line_id,
          item_id: mapping.item_id,
          name: mapping.product_name || mapping.item_name,
          description: `Additional Product for ${source.line.name}`,
          quantity: Number(mapping.mapped_quantity) || 0,
          quantity_invoiced: 0,
        },
      })
    }
    if ([...quantities.keys()].some((id) => !remoteLines.has(id)))
      return json({ error: 'A Sales Order line or Additional Product mapping changed after selection. Refresh and retry.' }, 409)
    const allowedStatuses = new Set(['open', 'partiallyinvoiced', 'overdue'])
    if (orders.some((order) => !allowedStatuses.has((order.status ?? '').toLowerCase().replace(/[^a-z]/g, ''))))
      return json({ error: 'Only Open or Partially Invoiced Sales Orders can be pushed to production.' }, 409)
    for (const [lineId, quantity] of quantities) {
      const remote = remoteLines.get(lineId)!
      const remainingQuantity = Math.max(0, remote.line.quantity - remote.line.quantity_invoiced)
      const balance = Math.max(0, remainingQuantity - (planned.get(lineId) ?? 0))
      if (quantity > balance)
        return json(
          {
            error: `Box Qty cannot exceed the available Remaining Qty of ${balance}.`,
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
         production_quantity, top_sheet_quantity, two_ply_quantity, deckle_size, cut_length_cm, uom, customer_product_specification_id, approved_specification_revision_id, product_type, ply)
         VALUES ((SELECT id FROM production_plans WHERE plan_number = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            Math.max(0, line.quantity - line.quantity_invoiced - previous),
            quantity,
            topSheetQuantities.get(lineId),
            twoPlyQuantities.get(lineId),
            deckleSizes.get(lineId),
            cutLengthsCm.get(lineId),
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
          : `Production Plan ${planNumber} has been pushed to Production Planned.`,
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
