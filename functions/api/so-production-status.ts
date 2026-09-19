import { getAuthenticatedUser } from '../lib/authenticatedUser'
import { getMenuPermission } from '../lib/superadminAccess'

interface Env { DB?: D1Database }
interface Context { request: Request; env: Env }
interface ActivityRow { id:number; so_line_item_id:string; production_quantity:number; job_card_id:number|null; job_number:string|null; job_status:string|null; attributes_json:string|null }
interface ProcessRow { job_card_id:number; process_name:string; process_status:string }

const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

function stages(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return []
    const list = (parsed as { production_stages?: unknown }).production_stages
    return Array.isArray(list) ? list.filter((stage): stage is string => typeof stage === 'string' && stage.trim().length > 0) : []
  } catch { return [] }
}
export async function onRequestGet(context: Context): Promise<Response> {
  const db = context.env.DB
  if (!db) return json({ error: 'Production status database is unavailable.' }, 503)
  const user = await getAuthenticatedUser(context.request, db)
  if (!user) return json({ error: 'Authentication required.' }, 401)
  if (user.roleName !== 'SUPERADMIN') {
    const permission = await getMenuPermission(db, user.roleId, 'so-production-status')
    if (!permission || (permission.can_full !== 1 && permission.can_view !== 1)) return json({ error: 'SO Production Status view access is required.' }, 403)
  }
  const salesOrderId = new URL(context.request.url).searchParams.get('sales_order_id')?.trim() ?? ''
  if (!salesOrderId || salesOrderId.length > 100) return json({ error: 'A valid Sales Order is required.' }, 400)

  const activityResult = await db.prepare(
    `SELECT line.id, line.zoho_sales_order_line_item_id AS so_line_item_id, line.production_quantity,
      card.id AS job_card_id, card.job_number, card.status AS job_status, spec.attributes_json
     FROM production_plan_lines line
     INNER JOIN production_plans plan ON plan.id=line.production_plan_id
     LEFT JOIN job_cards card ON card.production_plan_line_id=line.id AND card.status<>'CANCELLED'
     LEFT JOIN product_specification_records spec ON spec.id=line.approved_specification_revision_id
     WHERE line.zoho_sales_order_id=? AND plan.deleted_at IS NULL
       AND plan.status NOT IN ('DRAFT','CANCELLED')
     ORDER BY line.id, card.id`,
  ).bind(salesOrderId).all<ActivityRow>()
  const rows = activityResult.results ?? []
  const jobIds = rows.flatMap((row) => row.job_card_id ? [row.job_card_id] : [])
  let processRows: ProcessRow[] = []
  if (jobIds.length) {
    const result = await db.prepare(
      `SELECT job_card_id,process_name,process_status FROM job_card_process_entries
       WHERE job_card_id IN (${jobIds.map(() => '?').join(',')}) ORDER BY id`,
    ).bind(...jobIds).all<ProcessRow>()
    processRows = result.results ?? []
  }

  const activities = rows.map((row) => {
    const configured = stages(row.attributes_json)
    const saved = processRows.filter((process) => process.job_card_id === row.job_card_id)
    const orderedNames = [...configured, ...saved.map((process) => process.process_name).filter((name) => !configured.includes(name))]
    return {
      id: row.id,
      soLineItemId: row.so_line_item_id,
      quantity: row.production_quantity,
      jobs: row.job_card_id && row.job_number ? [{
        id: row.job_card_id,
        jobNumber: row.job_number,
        status: row.job_status ?? 'CREATED',
        processes: orderedNames.map((name) => ({ name, status: saved.find((process) => process.process_name === name)?.process_status ?? 'NOT_STARTED' })),
      }] : [],
    }
  })
  return json({ activities })
}
