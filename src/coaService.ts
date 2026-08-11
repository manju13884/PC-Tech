import type { CoaInvoiceValues } from './lib/coaGenerator'

export interface CoaAuditUser {
  id: number
  name: string
  email: string
}

export interface CoaRecord {
  id: number
  customerId: string
  customerName: string
  invoiceId: string
  invoiceNumber: string
  data: CoaInvoiceValues
  generatedBy: CoaAuditUser
  generatedAt: string
  updatedBy: CoaAuditUser | null
  updatedAt: string | null
}

interface CoaResponse {
  success?: boolean
  exists?: boolean
  coa?: CoaRecord
  error?: string
}

async function readResponse(response: Response): Promise<CoaResponse> {
  const data = await response.json() as CoaResponse
  if (!response.ok) throw new Error(data.error || 'Unable to process COA')
  return data
}

export async function getSavedCoa(customerId: string, invoiceId: string): Promise<CoaRecord | null> {
  const query = new URLSearchParams({ customer_id: customerId, invoice_id: invoiceId })
  const response = await fetch(`/api/coa?${query.toString()}`, { credentials: 'include' })
  const data = await readResponse(response)
  return data.exists && data.coa ? data.coa : null
}

export async function saveCoa(input: {
  customerId: string
  customerName: string
  invoiceId: string
  invoiceNumber: string
  data: CoaInvoiceValues
}): Promise<CoaRecord> {
  const response = await fetch('/api/coa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const result = await readResponse(response)
  if (!result.coa) throw new Error('Unable to save COA. Please try again.')
  return result.coa
}

export async function regenerateCoa(id: number, input: {
  customerId: string
  invoiceId: string
  customerName: string
  invoiceNumber: string
  data: CoaInvoiceValues
}): Promise<CoaRecord> {
  const response = await fetch(`/api/coa/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  const result = await readResponse(response)
  if (!result.coa) throw new Error('Unable to save COA. Please try again.')
  return result.coa
}
