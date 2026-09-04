import { getZohoSalesOrderById, getZohoSalesOrdersByCustomer } from '../../lib/salesOrders'
import type { ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv { DB?: D1Database }
interface Context { request: Request; env: Env }
interface MappingInput { lineItemId?: unknown; specificationId?: unknown }
interface SubmissionBody { customerId?: unknown; salesOrderId?: unknown; mappings?: unknown }

const json = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

async function hasPermission(db: D1Database, roleId: number, roleName: string, action: 'view' | 'save') {
  if (roleName === 'SUPERADMIN') return true
  const row = await db.prepare(
    `SELECT can_full, can_view, can_create, can_edit
     FROM role_menu_permissions WHERE role_id = ? AND menu_key = 'so-specification-mapping'`,
  ).bind(roleId).first<{ can_full: number; can_view: number; can_create: number; can_edit: number }>()
  return Boolean(row && (row.can_full === 1 || (action === 'view' ? row.can_view === 1 : row.can_create === 1 || row.can_edit === 1)))
}

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.env.DB) return json({ error: 'SO Specification Mapping database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await hasPermission(context.env.DB, user.roleId, user.roleName, 'view')) return json({ error: 'View access required.' }, 403)
  const salesOrderId = new URL(context.request.url).searchParams.get('sales_order_id')?.trim() ?? ''
  if (!salesOrderId) return json({ error: 'Sales Order is required.' }, 400)

  const result = await context.env.DB.prepare(
    `SELECT sales_order_line_item_id, product_specification_id
     FROM so_specification_mappings
     WHERE sales_order_id = ?
     ORDER BY id ASC`,
  ).bind(salesOrderId).all()
  return json({ mappings: result.results ?? [] })
}

export async function onRequestPost(context: Context): Promise<Response> {
  if (!context.env.DB) return json({ error: 'SO Specification Mapping database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, context.env.DB)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await hasPermission(context.env.DB, user.roleId, user.roleName, 'save')) return json({ error: 'Create or edit access required.' }, 403)

  const body = await context.request.json<SubmissionBody>().catch(() => ({}))
  const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
  const salesOrderId = typeof body.salesOrderId === 'string' ? body.salesOrderId.trim() : ''
  const mappings = Array.isArray(body.mappings) ? body.mappings as MappingInput[] : []
  if (!customerId || !salesOrderId) return json({ error: 'Customer and Sales Order are required.' }, 400)

  const customerOrders = await getZohoSalesOrdersByCustomer(customerId, context.env)
  if (!customerOrders.some((order) => order.salesorder_id === salesOrderId)) {
    return json({ error: 'The selected Sales Order does not belong to the selected customer.' }, 400)
  }
  const salesOrder = await getZohoSalesOrderById(salesOrderId, context.env)
  if (!salesOrder) return json({ error: 'Sales Order was not found.' }, 404)
  if (salesOrder.line_items.length === 0) return json({ error: 'The Sales Order has no items to map.' }, 400)

  const submittedByLine = new Map<string, number>()
  for (const mapping of mappings) {
    const lineItemId = typeof mapping.lineItemId === 'string' ? mapping.lineItemId.trim() : ''
    const specificationId = Number(mapping.specificationId)
    if (!lineItemId || !Number.isInteger(specificationId) || specificationId <= 0 || submittedByLine.has(lineItemId)) {
      return json({ error: 'Every Sales Order item must have one valid Product Specification.' }, 400)
    }
    submittedByLine.set(lineItemId, specificationId)
  }
  if (submittedByLine.size !== salesOrder.line_items.length || salesOrder.line_items.some((line) => !submittedByLine.has(line.line_item_id))) {
    return json({ error: 'Product Specification mapping is mandatory for every Sales Order item.' }, 400)
  }

  const specificationIds = [...new Set(submittedByLine.values())]
  const placeholders = specificationIds.map(() => '?').join(', ')
  const specificationResult = await context.env.DB.prepare(
    `SELECT id, customer_name FROM product_specification_records WHERE customer_id = ? AND id IN (${placeholders})`,
  ).bind(customerId, ...specificationIds).all<{ id: number; customer_name: string }>()
  const validIds = new Set((specificationResult.results ?? []).map((row) => Number(row.id)))
  if (validIds.size !== specificationIds.length) {
    return json({ error: 'One or more Product Specifications do not belong to the selected customer.' }, 400)
  }

  const customerName = specificationResult.results?.[0]?.customer_name ?? customerId
  const statements = salesOrder.line_items.map((line) => context.env.DB!.prepare(
    `INSERT INTO so_specification_mappings (
       sales_order_id, sales_order_number, customer_id, customer_name,
       sales_order_line_item_id, item_id, item_name, product_specification_id,
       created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sales_order_id, sales_order_line_item_id) DO UPDATE SET
       sales_order_number = excluded.sales_order_number,
       customer_id = excluded.customer_id,
       customer_name = excluded.customer_name,
       item_id = excluded.item_id,
       item_name = excluded.item_name,
       product_specification_id = excluded.product_specification_id,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    salesOrder.salesorder_id, salesOrder.salesorder_number, customerId, customerName,
    line.line_item_id, line.item_id, line.name, submittedByLine.get(line.line_item_id),
    user.id, user.id,
  ))
  await context.env.DB.batch(statements)
  return json({ success: true, mappedItems: statements.length })
}
