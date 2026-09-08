import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }

const json = (payload: unknown, status = 200) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

async function permission(db: D1Database, roleId: number, roleName: string, edit = false) {
  if (roleName === 'SUPERADMIN') return true
  const row = await db.prepare(
    `SELECT can_full, can_view, can_edit FROM role_menu_permissions
     WHERE role_id = ? AND menu_key = 'job-tracking'`,
  ).bind(roleId).first<{ can_full: number; can_view: number; can_edit: number }>()
  return Boolean(row && (row.can_full === 1 || (edit ? row.can_edit === 1 : row.can_view === 1)))
}

const selectTrackedJobs = `
  SELECT card.id AS job_card_id, card.job_number, card.status AS job_status, card.created_at AS job_created_at,
    card.updated_at AS job_updated_at, card.supervisor_name, card.quality_name, card.dispatch_name,
    card.box_weight_kg, card.manufactured_quantity, line.id AS production_plan_line_id, plan.plan_number, plan.plan_date,
    plan.status AS plan_status, plan.remarks AS plan_remarks, line.customer_name, line.sales_order_number,
    line.delivery_date, line.item_name, line.item_description, line.customer_po_number, line.production_quantity,
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
  FROM job_cards card
  INNER JOIN production_plan_lines line ON line.id = card.production_plan_line_id
  INNER JOIN production_plans plan ON plan.id = line.production_plan_id
  LEFT JOIN product_specification_records spec ON spec.id = line.approved_specification_revision_id
  WHERE plan.deleted_at IS NULL
  ORDER BY plan.plan_date DESC, card.id DESC`

export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Job Tracking database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(db, user.roleId, user.roleName)) return json({ error: 'Job Tracking view access is required.' }, 403)
  const result = await db.prepare(selectTrackedJobs).all()
  return json({ jobs: result.results ?? [] })
}

export async function onRequestPatch(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Job Tracking database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (!await permission(db, user.roleId, user.roleName, true)) return json({ error: 'Job Tracking edit access is required.' }, 403)
  const body = await context.request.json<Record<string, unknown>>().catch(() => ({}))
  const jobCardId = Number(body.jobCardId)
  if (typeof body.footerField === 'string') {
    const allowedFooterFields = ['supervisor_name', 'quality_name', 'dispatch_name', 'box_weight_kg', 'manufactured_quantity'] as const
    const footerField = allowedFooterFields.includes(body.footerField as typeof allowedFooterFields[number]) ? body.footerField : ''
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    const isNumeric = footerField === 'box_weight_kg' || footerField === 'manufactured_quantity'
    const numericValue = Number(value)
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !footerField ||
      (isNumeric && value !== '' && (!Number.isFinite(numericValue) || numericValue < 0)) ||
      (!isNumeric && value.length > 120)) return json({ error: 'Enter a valid Job Card completion value.' }, 400)
    const result = await db.prepare(
      `UPDATE job_cards SET ${footerField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(isNumeric && value !== '' ? numericValue : value || null, jobCardId).run()
    if (!result.meta.changes) return json({ error: 'Job Card was not found.' }, 404)
    const jobs = await db.prepare(selectTrackedJobs).all()
    return json({ success: true, jobs: jobs.results ?? [] })
  }
  if (typeof body.processName === 'string') {
    const processName = body.processName.trim()
    const allowedFields = ['start_datetime', 'end_datetime', 'in_quantity', 'out_quantity', 'employee_name', 'in_quantity_2', 'out_quantity_2', 'employee_name_2', 'reel_number', 'in_reel_weight', 'out_reel_weight', 'remaining_reel_weight', 'reel_number_2', 'in_reel_weight_2', 'out_reel_weight_2', 'remaining_reel_weight_2'] as const
    const field = typeof body.field === 'string' && allowedFields.includes(body.field as typeof allowedFields[number]) ? body.field : ''
    const value = typeof body.value === 'string' ? body.value.trim() : ''
    const allowedProcesses = ['Paper Cutting', 'Corrugation', 'Pasting', 'Board / Sheet Cutting', 'Printing', 'Creasing', 'RS4', 'Slotting', 'Die Cutting', 'Stitching / Gluing', 'Quality Inspection', 'Bundling / Packing']
    const isDateTime = field === 'start_datetime' || field === 'end_datetime'
    const isQuantity = ['in_quantity', 'out_quantity', 'in_quantity_2', 'out_quantity_2', 'in_reel_weight', 'out_reel_weight', 'remaining_reel_weight', 'in_reel_weight_2', 'out_reel_weight_2', 'remaining_reel_weight_2'].includes(field)
    const isReelField = field.startsWith('reel_number') || field.includes('reel_weight')
    const numericValue = Number(value)
    if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !allowedProcesses.includes(processName) || !field ||
      (isDateTime && value !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) ||
      (isQuantity && value !== '' && (!Number.isFinite(numericValue) || numericValue < 0)) ||
      ((field === 'employee_name' || field === 'employee_name_2') && value.length > 120) ||
      (field.startsWith('reel_number') && value.length > 80) ||
      (field.endsWith('_2') && processName !== 'Corrugation') ||
      (isReelField && processName !== 'Paper Cutting' && processName !== 'Corrugation')) {
      return json({ error: 'Enter a valid process value.' }, 400)
    }
    const job = await db.prepare('SELECT id FROM job_cards WHERE id = ?').bind(jobCardId).first()
    if (!job) return json({ error: 'Job Card was not found.' }, 404)
    await db.prepare(
      `INSERT INTO job_card_process_entries (job_card_id, process_name, ${field}, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(job_card_id, process_name) DO UPDATE SET
         ${field} = excluded.${field}, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP`,
    ).bind(jobCardId, processName, isQuantity && value !== '' ? numericValue : value || null, user.id).run()
    await db.prepare('UPDATE job_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(jobCardId).run()
    const jobs = await db.prepare(selectTrackedJobs).all()
    return json({ success: true, jobs: jobs.results ?? [] })
  }
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : ''
  if (!Number.isInteger(jobCardId) || jobCardId <= 0 || !['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    return json({ error: 'Select a valid Job Card status.' }, 400)
  }
  const result = await db.prepare(
    `UPDATE job_cards SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(status, jobCardId).run()
  if (!result.meta.changes) return json({ error: 'Job Card was not found.' }, 404)
  const jobs = await db.prepare(selectTrackedJobs).all()
  return json({ success: true, jobs: jobs.results ?? [] })
}
