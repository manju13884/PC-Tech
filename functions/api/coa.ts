import { getAuthenticatedUser } from '../lib/authenticatedUser'
import {
  COA_SELECT_COLUMNS,
  isUniqueConstraintError,
  mapCoaRecord,
  parseCoaPayload,
  type CoaRecordRow,
} from '../lib/coaRecords'

interface Env { DB?: D1Database }
interface FunctionContext { request: Request; env: Env }
interface CoaRequestBody {
  customerId?: unknown
  customerName?: unknown
  invoiceId?: unknown
  invoiceNumber?: unknown
  data?: unknown
}

const json = (payload: unknown, status = 200) => Response.json(payload, { status })
const readText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function onRequestGet(context: FunctionContext): Promise<Response> {
  if (!context.env.DB) return json({ success: false, error: 'COA database is unavailable' }, 500)

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return json({ success: false, error: 'Authentication required' }, 401)

    const url = new URL(context.request.url)
    const customerId = url.searchParams.get('customer_id')?.trim() ?? ''
    const invoiceId = url.searchParams.get('invoice_id')?.trim() ?? ''
    if (!customerId || !invoiceId) {
      return json({ success: false, error: 'Customer ID and Invoice ID are required' }, 400)
    }

    const row = await context.env.DB.prepare(
      `SELECT ${COA_SELECT_COLUMNS} FROM coa_records
       WHERE customer_id = ? AND invoice_id = ? LIMIT 1`,
    ).bind(customerId, invoiceId).first<CoaRecordRow>()

    return row
      ? json({ success: true, exists: true, coa: mapCoaRecord(row) })
      : json({ success: true, exists: false })
  } catch {
    console.error('[coa-get] Unable to load saved COA')
    return json({ success: false, error: 'Unable to load previously generated COA.' }, 500)
  }
}

export async function onRequestPost(context: FunctionContext): Promise<Response> {
  if (!context.env.DB) return json({ success: false, error: 'COA database is unavailable' }, 500)

  try {
    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return json({ success: false, error: 'Authentication required' }, 401)

    let body: CoaRequestBody
    try { body = await context.request.json() as CoaRequestBody } catch {
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
      'SELECT id FROM coa_records WHERE customer_id = ? AND invoice_id = ? LIMIT 1',
    ).bind(customerId, invoiceId).first<{ id: number }>()
    if (existing) return json({ success: false, error: 'COA already exists for this invoice.' }, 409)

    try {
      const row = await context.env.DB.prepare(
        `INSERT INTO coa_records (
          customer_id, customer_name, invoice_id, invoice_number, coa_data_json,
          generated_by_user_id, generated_by_user_name, generated_by_user_email,
          generated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING ${COA_SELECT_COLUMNS}`,
      ).bind(
        customerId, customerName, invoiceId, invoiceNumber, JSON.stringify(data),
        user.id, user.fullName, user.email,
      ).first<CoaRecordRow>()
      if (!row) throw new Error('COA insert did not return a record')
      return json({ success: true, exists: true, coa: mapCoaRecord(row) }, 201)
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return json({ success: false, error: 'COA already exists for this invoice.' }, 409)
      }
      throw error
    }
  } catch {
    console.error('[coa-post] Unable to save COA')
    return json({ success: false, error: 'Unable to save COA. Please try again.' }, 500)
  }
}
