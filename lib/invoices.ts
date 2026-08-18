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
  salesorder_number?: string
  custom_fields?: ZohoCustomField[]
  custom_field_hash?: Record<string, unknown>
  line_items?: ZohoLineItem[]
  status?: string
  date?: string
  total?: string | number
  balance?: string | number
  due_date?: string
}

interface ZohoSalesOrder {
  reference_number?: string
  salesorder_number?: string
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
  sales_order_number: string
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

export interface InvoiceDashboardSummary {
  overdueInvoiceCount: number
  overdueInvoiceAmount: number
  draftInvoiceCount: number
  totalReceivables: number
  ageing: Array<{ label: string; amount: number }>
  salesTrend: Array<{ month: string; amount: number }>
  topCustomers: Array<{ customerId: string; customerName: string; amount: number }>
}

async function getAllInvoices(env?: ZohoEnv): Promise<ZohoInvoice[]> {
  const invoices: ZohoInvoice[] = []
  let page = 1
  let hasMorePage = true
  while (hasMorePage) {
    const params = new URLSearchParams({ page: String(page), per_page: String(INVOICES_PER_PAGE) })
    const payload = await zohoGet(`/invoices?${params.toString()}`, env)
    if (!payload || typeof payload !== 'object') break
    const response = payload as ZohoInvoicesResponse
    const rows = Array.isArray(response.invoices) ? response.invoices : Array.isArray(response.data) ? response.data : []
    invoices.push(...rows.filter((row): row is ZohoInvoice => Boolean(row) && typeof row === 'object'))
    hasMorePage = response.page_context?.has_more_page ?? rows.length === INVOICES_PER_PAGE
    page += 1
  }
  return invoices
}

export async function getZohoInvoiceDashboardSummary(env?: ZohoEnv): Promise<InvoiceDashboardSummary> {
  const invoices = await getAllInvoices(env)
  const today = new Date()
  const overdueInvoices = invoices.filter((invoice) => normalizeText(invoice.status).toLowerCase() === 'overdue')
  const draftInvoices = invoices.filter((invoice) => normalizeText(invoice.status).toLowerCase() === 'draft')
  const outstandingInvoices = invoices.filter((invoice) => {
    const status = normalizeText(invoice.status).toLowerCase()
    return !['paid', 'void', 'draft'].includes(status) && Number(invoice.balance) > 0
  })
  const ageingLabels = ['0–30 Days', '31–60 Days', '61–90 Days', '>90 Days']
  const ageing = ageingLabels.map((label) => ({ label, amount: 0 }))
  for (const invoice of outstandingInvoices) {
    const dueDate = new Date(normalizeText(invoice.due_date) || normalizeText(invoice.date))
    const ageDays = Number.isFinite(dueDate.getTime())
      ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000))
      : 0
    const bucketIndex = ageDays <= 30 ? 0 : ageDays <= 60 ? 1 : ageDays <= 90 ? 2 : 3
    ageing[bucketIndex].amount += Number(invoice.balance) || 0
  }

  const trendMonths = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - offset), 1)
    return { key: `${date.getFullYear()}-${date.getMonth()}`, month: date.toLocaleString('en-IN', { month: 'short' }), amount: 0 }
  })
  const customerTotals = new Map<string, { customerId: string; customerName: string; amount: number }>()
  const financialYearStart = new Date(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1, 3, 1)
  for (const invoice of invoices) {
    const status = normalizeText(invoice.status).toLowerCase()
    if (status === 'void' || status === 'draft') continue
    const invoiceDate = new Date(normalizeText(invoice.date))
    const total = Number(invoice.total) || 0
    if (Number.isFinite(invoiceDate.getTime())) {
      const trend = trendMonths.find((month) => month.key === `${invoiceDate.getFullYear()}-${invoiceDate.getMonth()}`)
      if (trend) trend.amount += total
      if (invoiceDate >= financialYearStart) {
        const customerId = String(invoice.customer_id ?? '').trim()
        const customerName = normalizeText(invoice.customer_name)
        if (customerId && customerName) {
          const current = customerTotals.get(customerId) ?? { customerId, customerName, amount: 0 }
          current.amount += total
          customerTotals.set(customerId, current)
        }
      }
    }
  }
  return {
    overdueInvoiceCount: overdueInvoices.length,
    overdueInvoiceAmount: overdueInvoices.reduce((sum, invoice) => {
      const balance = Number(invoice.balance)
      return sum + (Number.isFinite(balance) ? balance : 0)
    }, 0),
    draftInvoiceCount: draftInvoices.length,
    totalReceivables: outstandingInvoices.reduce((sum, invoice) => sum + (Number(invoice.balance) || 0), 0),
    ageing,
    salesTrend: trendMonths.map(({ month, amount }) => ({ month, amount })),
    topCustomers: [...customerTotals.values()].sort((left, right) => right.amount - left.amount).slice(0, 5),
  }
}

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
  const salesOrderNumbers = salesOrders
    .map((salesOrder) => normalizeText(salesOrder.salesorder_number))
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
    sales_order_number:
      salesOrderNumbers.join(', ') ||
      normalizeText(invoice.salesorder_number) ||
      salesOrderPoNumbers.join(', '),
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
