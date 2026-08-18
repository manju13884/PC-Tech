import { zohoGet, type ZohoEnv } from './zoho'

export interface SalesOrderSummary {
  salesorder_id: string
  salesorder_number: string
}

export interface SalesOrderLineItem {
  line_item_id: string
  item_id: string
  name: string
  description: string
  quantity: number
  unit: string
  rate: number
  amount: number
}

export interface SalesOrderDetail extends SalesOrderSummary {
  total: number
  line_items: SalesOrderLineItem[]
}

interface ZohoSalesOrder {
  salesorder_id?: string | number
  salesorder_number?: string
  customer_id?: string | number
  total?: string | number
  sub_total?: string | number
  tax_total?: string | number
  balance?: string | number
  amount_invoiced?: string | number
  status?: string
  customer_name?: string
  invoices?: unknown[]
  line_items?: unknown[]
}


export interface CustomerOpenSalesOrderSummary {
  customerId: string
  customerName: string
  openSalesOrderCount: number
  totalSalesOrderAmount: number
  openSalesOrderValue: number
}

export interface OpenSalesOrderDashboardSummary {
  customers: CustomerOpenSalesOrderSummary[]
  totals: {
    openSalesOrderCount: number
    totalSalesOrderAmount: number
    openSalesOrderValue: number
  }
  statusCounts: { open: number; partiallyBilled: number }
}

interface ZohoSalesOrderLineItem {
  line_item_id?: string | number
  item_id?: string | number
  name?: string
  item_name?: string
  description?: string
  quantity?: string | number
  unit?: string
  rate?: string | number
  item_total?: string | number
  amount?: string | number
}

interface ZohoSalesOrdersResponse {
  salesorders?: unknown[]
  data?: unknown[]
  salesorder?: unknown
  page_context?: {
    has_more_page?: boolean
  }
}

const SALES_ORDERS_PER_PAGE = 200
const OPEN_SALES_ORDER_STATUSES = new Set(['open', 'confirmed', 'partiallyinvoiced'])

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function mapSalesOrderLineItem(value: unknown, index: number): SalesOrderLineItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as ZohoSalesOrderLineItem
  const name = normalizeText(item.name) || normalizeText(item.item_name)
  const description = normalizeText(item.description)
  const quantity = typeof item.quantity === 'number'
    ? item.quantity
    : Number(item.quantity)

  if (!name && !description) {
    return null
  }

  return {
    line_item_id: String(item.line_item_id ?? item.item_id ?? index),
    item_id: String(item.item_id ?? ''),
    name,
    description,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: normalizeText(item.unit),
    rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : 0,
    amount: Number.isFinite(Number(item.item_total ?? item.amount))
      ? Number(item.item_total ?? item.amount)
      : 0,
  }
}

function mapSalesOrder(value: unknown, customerId: string): SalesOrderSummary | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const salesOrder = value as ZohoSalesOrder
  const salesOrderId = salesOrder.salesorder_id != null ? String(salesOrder.salesorder_id) : ''
  const salesOrderNumber = typeof salesOrder.salesorder_number === 'string'
    ? salesOrder.salesorder_number.trim()
    : ''
  const responseCustomerId = salesOrder.customer_id != null ? String(salesOrder.customer_id) : ''

  if (!salesOrderId || !salesOrderNumber || (responseCustomerId && responseCustomerId !== customerId)) {
    return null
  }

  return {
    salesorder_id: salesOrderId,
    salesorder_number: salesOrderNumber,
  }
}

export async function getZohoSalesOrdersByCustomer(
  customerId: string,
  env?: ZohoEnv,
): Promise<SalesOrderSummary[]> {
  const normalizedCustomerId = customerId.trim()
  if (!normalizedCustomerId) {
    return []
  }

  const salesOrders: unknown[] = []
  let page = 1
  let hasMorePage = true

  while (hasMorePage) {
    const params = new URLSearchParams({
      customer_id: normalizedCustomerId,
      page: String(page),
      per_page: String(SALES_ORDERS_PER_PAGE),
    })
    const payload = await zohoGet(`/salesorders?${params.toString()}`, env)

    if (!payload || typeof payload !== 'object') {
      break
    }

    const response = payload as ZohoSalesOrdersResponse
    const pageSalesOrders = Array.isArray(response.salesorders)
      ? response.salesorders
      : Array.isArray(response.data)
        ? response.data
        : []

    salesOrders.push(...pageSalesOrders)
    hasMorePage = response.page_context?.has_more_page
      ?? pageSalesOrders.length === SALES_ORDERS_PER_PAGE
    page += 1
  }

  return salesOrders
    .map((salesOrder) => mapSalesOrder(salesOrder, normalizedCustomerId))
    .filter((salesOrder): salesOrder is SalesOrderSummary => salesOrder !== null)
}

function getListedSalesOrderFinancials(order: ZohoSalesOrder): { totalAmount: number; openValue: number } {
  const subTotal = normalizeNumber(order.sub_total)
  const total = normalizeNumber(order.total)
  const taxTotal = normalizeNumber(order.tax_total)
  const amountInvoiced = normalizeNumber(order.amount_invoiced)
  const balance = normalizeNumber(order.balance)

  // Zoho normally includes sub_total and balance in the list response. Avoid a
  // detail request per order: a large open-order set can exceed a Worker's
  // outbound request allowance and make the whole dashboard fail.
  const totalAmount = subTotal !== null
    ? subTotal
    : total !== null
      ? Math.max(0, total - (taxTotal ?? 0))
      : 0
  const openValue = balance !== null
    ? Math.max(0, balance)
    : total !== null
      ? Math.max(0, total - (amountInvoiced ?? 0))
      : 0

  return { totalAmount, openValue }
}

export async function getZohoOpenSalesOrderSummary(env?: ZohoEnv): Promise<OpenSalesOrderDashboardSummary> {
  const salesOrders: unknown[] = []
  let page = 1
  let hasMorePage = true

  while (hasMorePage) {
    const params = new URLSearchParams({
      filter_by: 'Status.Open',
      page: String(page),
      per_page: String(SALES_ORDERS_PER_PAGE),
    })
    const payload = await zohoGet(`/salesorders?${params.toString()}`, env)
    if (!payload || typeof payload !== 'object') break

    const response = payload as ZohoSalesOrdersResponse
    const pageSalesOrders = Array.isArray(response.salesorders)
      ? response.salesorders
      : Array.isArray(response.data) ? response.data : []
    salesOrders.push(...pageSalesOrders)
    hasMorePage = response.page_context?.has_more_page
      ?? pageSalesOrders.length === SALES_ORDERS_PER_PAGE
    page += 1
  }

  const eligibleOrders = salesOrders.filter((value): value is ZohoSalesOrder => {
    if (!value || typeof value !== 'object') return false
    const order = value as ZohoSalesOrder
    const status = normalizeText(order.status).toLowerCase().replace(/[^a-z]/g, '')
    return OPEN_SALES_ORDER_STATUSES.has(status)
      && Boolean(String(order.salesorder_id ?? '').trim())
      && Boolean(String(order.customer_id ?? '').trim())
      && Boolean(normalizeText(order.customer_name))
  })

  const byCustomer = new Map<string, CustomerOpenSalesOrderSummary>()
  for (const order of eligibleOrders) {
    const financials = getListedSalesOrderFinancials(order)
    const customerId = String(order.customer_id ?? '').trim()
    const customerName = normalizeText(order.customer_name)
    const current = byCustomer.get(customerId) ?? {
      customerId,
      customerName,
      openSalesOrderCount: 0,
      totalSalesOrderAmount: 0,
      openSalesOrderValue: 0,
    }
    current.openSalesOrderCount += 1
    current.totalSalesOrderAmount += financials.totalAmount
    current.openSalesOrderValue += financials.openValue
    byCustomer.set(customerId, current)
  }

  const customers = [...byCustomer.values()]
    .sort((left, right) => (
      right.openSalesOrderValue - left.openSalesOrderValue
      || right.totalSalesOrderAmount - left.totalSalesOrderAmount
      || left.customerName.localeCompare(right.customerName)
    ))
  return {
    customers: customers.slice(0, 5),
    totals: customers.reduce((totals, customer) => ({
      openSalesOrderCount: totals.openSalesOrderCount + customer.openSalesOrderCount,
      totalSalesOrderAmount: totals.totalSalesOrderAmount + customer.totalSalesOrderAmount,
      openSalesOrderValue: totals.openSalesOrderValue + customer.openSalesOrderValue,
    }), { openSalesOrderCount: 0, totalSalesOrderAmount: 0, openSalesOrderValue: 0 }),
    statusCounts: eligibleOrders.reduce((counts, order) => {
      const status = normalizeText(order.status).toLowerCase().replace(/[^a-z]/g, '')
      if (status === 'partiallyinvoiced') counts.partiallyBilled += 1
      else counts.open += 1
      return counts
    }, { open: 0, partiallyBilled: 0 }),
  }
}

export async function getZohoSalesOrderById(
  salesOrderId: string,
  env?: ZohoEnv,
): Promise<SalesOrderDetail | null> {
  const normalizedSalesOrderId = salesOrderId.trim()
  if (!normalizedSalesOrderId) {
    return null
  }

  const payload = await zohoGet(`/salesorders/${encodeURIComponent(normalizedSalesOrderId)}`, env)
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const salesOrder = (payload as ZohoSalesOrdersResponse).salesorder
  if (!salesOrder || typeof salesOrder !== 'object') {
    return null
  }

  const value = salesOrder as ZohoSalesOrder
  const id = value.salesorder_id != null ? String(value.salesorder_id) : ''
  if (!id) {
    return null
  }

  return {
    salesorder_id: id,
    salesorder_number: normalizeText(value.salesorder_number),
    total: Number.isFinite(Number(value.total)) ? Number(value.total) : 0,
    line_items: Array.isArray(value.line_items)
      ? value.line_items
        .map(mapSalesOrderLineItem)
        .filter((item): item is SalesOrderLineItem => item !== null)
      : [],
  }
}
