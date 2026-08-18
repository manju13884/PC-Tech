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

export interface InvoiceDashboardSummary {
  overdueInvoiceCount: number
  overdueInvoiceAmount: number
  draftInvoiceCount: number
  totalReceivables: number
  ageing: Array<{ label: string; amount: number }>
  salesTrend: Array<{ month: string; amount: number }>
  topCustomers: Array<{ customerId: string; customerName: string; amount: number }>
}

export interface HomeDashboardSummary {
  salesOrders: OpenSalesOrderDashboardSummary | null
  invoices: InvoiceDashboardSummary | null
  errors: { sales: string | null; finance: string | null }
  cached?: boolean
  refreshedAt?: string
}

export async function getCustomerOpenSalesOrderSummary(): Promise<HomeDashboardSummary> {
  const response = await fetch('/api/home-sales-orders', { credentials: 'include' })
  if (!response.ok) throw new Error('Unable to load sales order summary')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') throw new Error('Invalid sales order summary response')
  const value = payload as Partial<HomeDashboardSummary>
  if (!value.errors || (value.salesOrders && (!Array.isArray(value.salesOrders.customers) || !value.salesOrders.totals))) throw new Error('Invalid sales order summary response')
  const customers = (value.salesOrders?.customers ?? []).filter((row): row is CustomerOpenSalesOrderSummary => {
    if (!row || typeof row !== 'object') return false
    const value = row as Partial<CustomerOpenSalesOrderSummary>
    return typeof value.customerId === 'string'
      && typeof value.customerName === 'string'
      && typeof value.openSalesOrderCount === 'number'
      && typeof value.totalSalesOrderAmount === 'number'
      && typeof value.openSalesOrderValue === 'number'
  })
  return {
    salesOrders: value.salesOrders ? { customers, totals: value.salesOrders.totals, statusCounts: value.salesOrders.statusCounts } : null,
    invoices: value.invoices ?? null,
    errors: value.errors,
    cached: value.cached,
    refreshedAt: value.refreshedAt,
  }
}
