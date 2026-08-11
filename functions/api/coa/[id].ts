import { getAuthenticatedUser } from '../../lib/authenticatedUser'
import { COA_SELECT_COLUMNS, mapCoaRecord, parseCoaPayload, type CoaRecordRow } from '../../lib/coaRecords'

interface Env { DB?: D1Database }
interface FunctionContext {
  request: Request
  env: Env
  params: { id?: string | string[] }
}
interface CoaUpdateBody {
  customerId?: unknown
  customerName?: unknown
  invoiceId?: unknown
  invoiceNumber?: unknown
  data?: unknown
}

const json = (payload: unknown, status = 200) => Response.json(payload, { status })
const readText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function onRequestPut(context: FunctionContext): Promise<Response> {
  if (!context.env.DB) return json({ success: false, error: 'COA database is unavailable' }, 500)

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return json({ success: false, error: 'Authentication required' }, 401)
    if (user.roleName !== 'SUPERADMIN') {
      return json({ success: false, error: 'Only SuperAdmin can regenerate an existing COA.' }, 403)
    }

    const rawId = Array.isArray(context.params.id) ? context.params.id[0] : context.params.id
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) return json({ success: false, error: 'COA ID is invalid' }, 400)

    let body: CoaUpdateBody
    try { body = await context.request.json() as CoaUpdateBody } catch {
      return json({ success: false, error: 'Request body must be valid JSON' }, 400)
    }

    const customerId = readText(body.customerId)
    const customerName = readText(body.customerName)
    const invoiceId = readText(body.invoiceId)
    const invoiceNumber = readText(body.invoiceNumber)
    const data = parseCoaPayload(body.data)
    if (!customerId || !invoiceId || !data) {
      return json({ success: false, error: 'Customer ID, Invoice ID and valid COA data are required' }, 400)
    }

    const existing = await context.env.DB.prepare(
      'SELECT id, customer_id, invoice_id FROM coa_records WHERE id = ? LIMIT 1',
    ).bind(id).first<{ id: number; customer_id: string; invoice_id: string }>()
    if (!existing) return json({ success: false, error: 'COA record not found' }, 404)
    if (existing.customer_id !== customerId || existing.invoice_id !== invoiceId) {
      return json({ success: false, error: 'COA customer or invoice does not match the saved record' }, 409)
    }

    const row = await context.env.DB.prepare(
      `UPDATE coa_records SET
        customer_name = ?, invoice_number = ?, coa_data_json = ?,
        updated_by_user_id = ?, updated_by_user_name = ?, updated_by_user_email = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       RETURNING ${COA_SELECT_COLUMNS}`,
    ).bind(
      customerName, invoiceNumber, JSON.stringify(data),
      user.id, user.fullName, user.email, id,
    ).first<CoaRecordRow>()
    if (!row) throw new Error('COA update did not return a record')
    return json({ success: true, exists: true, coa: mapCoaRecord(row) })
  } catch {
    console.error('[coa-put] Unable to regenerate COA')
    return json({ success: false, error: 'Unable to save COA. Please try again.' }, 500)
  }
}
