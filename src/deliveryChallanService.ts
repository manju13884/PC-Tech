export interface DeliveryChallan {
  delivery_challan_id: string
  delivery_challan_number: string
}

export interface DeliveryChallanDetail extends DeliveryChallan {
  date: string
  customer_name: string
  po_number: string
  sales_order_number: string
  line_items: Array<{ name: string; description: string; quantity: string }>
}

async function request(params: URLSearchParams): Promise<unknown> {
  const response = await fetch(`/api/delivery-challans?${params.toString()}`)
  const payload: unknown = await response.json()
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : `Unable to load Delivery Challans (${response.status})`
    throw new Error(message)
  }
  return payload
}

export async function getDeliveryChallansByCustomer(customerId: string): Promise<DeliveryChallan[]> {
  const payload = await request(new URLSearchParams({ customer_id: customerId }))
  if (!Array.isArray(payload)) throw new Error('Delivery Challan response was not a list')
  return payload.filter((row): row is DeliveryChallan => Boolean(row)
    && typeof row === 'object'
    && typeof (row as DeliveryChallan).delivery_challan_id === 'string'
    && typeof (row as DeliveryChallan).delivery_challan_number === 'string')
}

export async function getDeliveryChallanById(id: string): Promise<DeliveryChallanDetail> {
  const payload = await request(new URLSearchParams({ delivery_challan_id: id }))
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as DeliveryChallanDetail).line_items)) {
    throw new Error('Delivery Challan response was invalid')
  }
  return payload as DeliveryChallanDetail
}
