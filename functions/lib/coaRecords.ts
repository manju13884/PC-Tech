export interface CoaRecordRow {
  id: number
  customer_id: string
  customer_name: string | null
  invoice_id: string
  invoice_number: string | null
  coa_data_json: string
  generated_by_user_id: number
  generated_by_user_name: string
  generated_by_user_email: string
  generated_at: string
  updated_by_user_id: number | null
  updated_by_user_name: string | null
  updated_by_user_email: string | null
  updated_at: string | null
}

interface CoaItemPayload {
  name: string
  description: string
  boardGsm: string
  gsm: string
  burstingStrength: string
  moisture: string
  ply: string
}

export interface CoaPayload {
  invoiceDate: string
  customer: string
  poNumber: string
  invoiceNumber: string
  refNumber: string
  documentType?: 'invoice' | 'delivery-challan'
  items: CoaItemPayload[]
}

const isString = (value: unknown): value is string => typeof value === 'string'

export function parseCoaPayload(value: unknown): CoaPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Partial<CoaPayload>
  if (
    !isString(payload.invoiceDate)
    || !isString(payload.customer)
    || !isString(payload.poNumber)
    || !isString(payload.invoiceNumber)
    || !isString(payload.refNumber)
    || !Array.isArray(payload.items)
    || payload.items.length === 0
  ) return null

  if (payload.documentType !== undefined && !['invoice', 'delivery-challan'].includes(payload.documentType)) return null

  const items = payload.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const candidate = item as Partial<CoaItemPayload>
    if (
      !isString(candidate.name)
      || !isString(candidate.description)
      || !isString(candidate.boardGsm)
      || !isString(candidate.gsm)
      || !isString(candidate.burstingStrength)
      || !isString(candidate.moisture)
      || !isString(candidate.ply)
    ) return null
    return candidate as CoaItemPayload
  })

  if (items.some((item) => item === null)) return null
  return { ...payload, items } as CoaPayload
}

export function mapCoaRecord(row: CoaRecordRow) {
  const data = parseCoaPayload(JSON.parse(row.coa_data_json))
  if (!data) throw new Error('Stored COA payload is invalid')

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number ?? '',
    data,
    generatedBy: {
      id: row.generated_by_user_id,
      name: row.generated_by_user_name,
      email: row.generated_by_user_email,
    },
    generatedAt: row.generated_at,
    updatedBy: row.updated_by_user_id === null ? null : {
      id: row.updated_by_user_id,
      name: row.updated_by_user_name ?? '',
      email: row.updated_by_user_email ?? '',
    },
    updatedAt: row.updated_at,
  }
}

export const COA_SELECT_COLUMNS = `
  id, customer_id, customer_name, invoice_id, invoice_number, coa_data_json,
  generated_by_user_id, generated_by_user_name, generated_by_user_email,
  generated_at, updated_by_user_id, updated_by_user_name,
  updated_by_user_email, updated_at`

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('unique') || message.toLowerCase().includes('constraint')
}
