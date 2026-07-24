export interface SalesOrder {
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

export interface SalesOrderDetail extends SalesOrder {
  line_items: SalesOrderLineItem[]
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object') {
      const message = (payload as { error?: unknown }).error
      if (typeof message === 'string' && message.trim()) {
        return message
      }
    }
  } catch {
    // Use the status-based fallback when the API does not return JSON.
  }

  return `Unable to load sales orders (${response.status})`
}

function isSalesOrder(value: unknown): value is SalesOrder {
  if (!value || typeof value !== 'object') {
    return false
  }

  const salesOrder = value as Partial<SalesOrder>
  return typeof salesOrder.salesorder_id === 'string'
    && typeof salesOrder.salesorder_number === 'string'
}

export async function getSalesOrdersByCustomer(customerId: string): Promise<SalesOrder[]> {
  const params = new URLSearchParams({ customer_id: customerId })
  const response = await fetch(`/api/sales-orders?${params.toString()}`)

  if (!response.ok) {
    throw new Error(await getResponseError(response))
  }

  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) {
    throw new Error('Sales Order response was not a list')
  }

  return payload.filter(isSalesOrder)
}

function isSalesOrderLineItem(value: unknown): value is SalesOrderLineItem {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as Partial<SalesOrderLineItem>
  return typeof item.line_item_id === 'string'
    && typeof item.item_id === 'string'
    && typeof item.name === 'string'
    && typeof item.description === 'string'
    && typeof item.quantity === 'number'
    && typeof item.unit === 'string'
    && typeof item.rate === 'number'
    && typeof item.amount === 'number'
}

export async function getSalesOrderById(salesOrderId: string): Promise<SalesOrderDetail> {
  const params = new URLSearchParams({ salesorder_id: salesOrderId })
  const response = await fetch(`/api/sales-orders?${params.toString()}`)

  if (!response.ok) {
    throw new Error(await getResponseError(response))
  }

  const payload: unknown = await response.json()
  if (!isSalesOrder(payload)) {
    throw new Error('Sales Order response was invalid')
  }

  const lineItems = (payload as { line_items?: unknown }).line_items
  return {
    ...payload,
    line_items: Array.isArray(lineItems) ? lineItems.filter(isSalesOrderLineItem) : [],
  }
}
