import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }

const json = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

async function permission(db: D1Database, roleId: number, roleName: string, create = false) {
  if (roleName === 'SUPERADMIN') return true
  const row = await db.prepare(
    `SELECT can_full, can_view, can_create FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'job-cards'`,
  ).bind(roleId).first<{ can_full: number; can_view: number; can_create: number }>()
  return Boolean(row && (row.can_full === 1 || (create ? row.can_create === 1 : row.can_view === 1)))
}

const selectJobCardLines = `
  SELECT line.id AS production_plan_line_id, card.id AS job_card_id, card.job_number, card.status AS job_status,
    card.created_at AS job_created_at, card.supervisor_name, card.quality_name, card.dispatch_name,
    card.box_weight_kg, card.manufactured_quantity, plan.plan_number, plan.plan_date, plan.status AS plan_status,
    plan.remarks AS plan_remarks, line.customer_name, line.sales_order_number, line.delivery_date,
    line.item_name, line.item_description, line.customer_po_number, line.production_quantity,
    line.two_ply_quantity, line.deckle_size, line.uom, line.product_type, line.ply,
    spec.polar_canvas_item_code AS specification_code, spec.product_name, spec.length_mm, spec.width_mm,
    spec.height_mm, spec.print_required, spec.print_colors, spec.notes AS specification_notes, spec.attributes_json,
    COALESCE((SELECT json_group_array(json_object(
      'process_name', entry.process_name, 'start_datetime', entry.start_datetime, 'end_datetime', entry.end_datetime,
      'in_quantity', entry.in_quantity, 'out_quantity', entry.out_quantity, 'employee_name', entry.employee_name,
      'in_quantity_2', entry.in_quantity_2, 'out_quantity_2', entry.out_quantity_2, 'employee_name_2', entry.employee_name_2,
      'reel_number', entry.reel_number, 'in_reel_weight', entry.in_reel_weight, 'out_reel_weight', entry.out_reel_weight,
      'remaining_reel_weight', entry.remaining_reel_weight, 'reel_number_2', entry.reel_number_2,
      'in_reel_weight_2', entry.in_reel_weight_2, 'out_reel_weight_2', entry.out_reel_weight_2,
      'remaining_reel_weight_2', entry.remaining_reel_weight_2
    )) FROM job_card_process_entries entry WHERE entry.job_card_id = card.id), '[]') AS process_entries_json
  FROM production_plan_lines line
  INNER JOIN production_plans plan ON plan.id = line.production_plan_id
  LEFT JOIN product_specification_records spec ON spec.id = line.approved_specification_revision_id
  LEFT JOIN job_cards card ON card.production_plan_line_id = line.id
  WHERE plan.deleted_at IS NULL AND plan.status <> 'DRAFT' AND plan.status <> 'CANCELLED'
  ORDER BY plan.plan_date DESC, line.id DESC`

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Job Card database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(db, user.roleId, user.roleName)) return json({ error: 'Job Cards view access is required.' }, 403)
  const result = await db.prepare(selectJobCardLines).all()
  return json({ lines: result.results ?? [] })
}

export async function onRequestPost(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Job Card database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(db, user.roleId, user.roleName, true)) return json({ error: 'Create access is required.' }, 403)
  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const lineIds = [...new Set((Array.isArray(body.lineIds) ? body.lineIds : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100)
  if (!lineIds.length) return json({ error: 'Select at least one Production Planned item.' }, 400)

  const statements = lineIds.map((lineId) => db.prepare(
    `INSERT OR IGNORE INTO job_cards (
       job_number, production_plan_line_id, created_by_user_id, created_by_name
     )
     SELECT 'JC-' || printf('%06d', line.id), line.id, ?, ?
     FROM production_plan_lines line
     INNER JOIN production_plans plan ON plan.id = line.production_plan_id
     WHERE line.id = ? AND plan.deleted_at IS NULL
       AND plan.status <> 'DRAFT' AND plan.status <> 'CANCELLED'`,
  ).bind(user.id, user.fullName, lineId))
  await db.batch(statements)
  const result = await db.prepare(selectJobCardLines).all()
  return json({ success: true, lines: result.results ?? [] })
}
