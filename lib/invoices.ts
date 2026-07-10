import { zohoGet, type ZohoEnv } from './zoho'

export interface ZohoInvoice {
  invoice_id?: string | number
  invoice_number?: string
  customer_id?: string | number
  status?: string
  date?: string
}

export interface InvoiceSummary {
  invoice_id: string
  invoice_number: string
}

interface ZohoInvoicesResponse {
  invoices?: unknown[]
  data?: unknown[]
  page_context?: {
    has_more_page?: boolean
  }
}

const INVOICES_PER_PAGE = 200

function buildInvoicesEndpoint(customerId: string, page: number): string {
  const params = new URLSearchParams({
    customer_id: customerId,
    page: String(page),
    per_page: String(INVOICES_PER_PAGE),
  })

  return `/invoices?${params.toString()}`
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function mapInvoice(invoice: ZohoInvoice): InvoiceSummary | null {
  const invoiceId = invoice.invoice_id != null ? String(invoice.invoice_id) : ''
  const invoiceNumber = normalizeText(invoice.invoice_number)

  if (!invoiceId || !invoiceNumber) {
    return null
  }

  return {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
  }
}

export async function getZohoInvoicesByCustomer(customerId: string, env?: ZohoEnv): Promise<InvoiceSummary[]> {
  if (!customerId) {
    return []
  }

  const invoices: unknown[] = []
  let page = 1
  let hasMorePage = true

  while (hasMorePage) {
    const payload = await zohoGet(buildInvoicesEndpoint(customerId, page), env)

    if (!payload || typeof payload !== 'object') {
      break
    }

    const responsePayload = payload as ZohoInvoicesResponse
    const pageInvoices = Array.isArray(responsePayload.invoices)
      ? responsePayload.invoices
      : Array.isArray(responsePayload.data)
        ? responsePayload.data
        : []

    invoices.push(...pageInvoices)

    hasMorePage = responsePayload.page_context?.has_more_page ?? pageInvoices.length === INVOICES_PER_PAGE
    page += 1
  }

  return invoices
    .filter((item): item is ZohoInvoice => Boolean(item) && typeof item === 'object')
    .map(mapInvoice)
    .filter((item): item is InvoiceSummary => item !== null)
}
