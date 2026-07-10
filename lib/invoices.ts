import { zohoGet, type ZohoEnv } from './zoho'

export interface ZohoInvoice {
  invoice_id?: string | number
  invoice_number?: string
  customer_id?: string | number
  customer_name?: string
  reference_number?: string
  purchaseorder?: string
  po_number?: string
  salesorders?: ZohoSalesOrder | ZohoSalesOrder[]
  custom_fields?: ZohoCustomField[]
  custom_field_hash?: Record<string, unknown>
  line_items?: ZohoLineItem[]
  status?: string
  date?: string
}

interface ZohoSalesOrder {
  reference_number?: string
}

interface ZohoCustomField {
  label?: string
  api_name?: string
  value?: unknown
}

interface ZohoLineItem {
  name?: string
  description?: string
  quantity?: string | number
}

export interface InvoiceSummary {
  invoice_id: string
  invoice_number: string
}

export interface InvoiceDetail extends InvoiceSummary {
  date: string
  customer_name: string
  po_number: string
  line_items: InvoiceLineItem[]
}

export interface InvoiceLineItem {
  name: string
  description: string
  quantity: string
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

function normalizeFieldName(value: unknown): string {
  return normalizeText(value)
    .replace(/^cf_/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function normalizeCustomFieldValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  return typeof value === 'number' ? String(value) : ''
}

function getCustomPoNumber(invoice: ZohoInvoice): string {
  const poFieldNames = new Set(['po', 'ponumber', 'purchaseorder', 'purchaseordernumber', 'customerpo'])
  const customField = invoice.custom_fields?.find((field) => (
    poFieldNames.has(normalizeFieldName(field.label)) ||
    poFieldNames.has(normalizeFieldName(field.api_name))
  ))
  const customFieldValue = normalizeCustomFieldValue(customField?.value)

  if (customFieldValue) {
    return customFieldValue
  }

  for (const [fieldName, value] of Object.entries(invoice.custom_field_hash ?? {})) {
    if (poFieldNames.has(normalizeFieldName(fieldName))) {
      return normalizeCustomFieldValue(value)
    }
  }

  return ''
}

function mapLineItem(lineItem: ZohoLineItem): InvoiceLineItem {
  return {
    name: normalizeText(lineItem.name),
    description: normalizeText(lineItem.description),
    quantity: normalizeCustomFieldValue(lineItem.quantity),
  }
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

function mapInvoiceDetail(invoice: ZohoInvoice): InvoiceDetail | null {
  const summary = mapInvoice(invoice)

  if (!summary) {
    return null
  }

  const salesOrders = Array.isArray(invoice.salesorders)
    ? invoice.salesorders
    : invoice.salesorders
      ? [invoice.salesorders]
      : []
  const salesOrderPoNumbers = salesOrders
    .map((salesOrder) => normalizeText(salesOrder.reference_number))
    .filter(Boolean)

  return {
    ...summary,
    date: normalizeText(invoice.date),
    customer_name: normalizeText(invoice.customer_name),
    po_number:
      getCustomPoNumber(invoice) ||
      salesOrderPoNumbers.join(',') ||
      normalizeText(invoice.reference_number) ||
      normalizeText(invoice.purchaseorder) ||
      normalizeText(invoice.po_number),
    line_items: Array.isArray(invoice.line_items) ? invoice.line_items.map(mapLineItem) : [],
  }
}

export async function getZohoInvoiceById(invoiceId: string, env?: ZohoEnv): Promise<InvoiceDetail | null> {
  if (!invoiceId) {
    return null
  }

  const payload = await zohoGet(`/invoices/${encodeURIComponent(invoiceId)}`, env)

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const responsePayload = payload as { invoice?: unknown; data?: unknown }
  const invoice = responsePayload.invoice ?? responsePayload.data

  if (!invoice || typeof invoice !== 'object') {
    return null
  }

  return mapInvoiceDetail(invoice as ZohoInvoice)
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
