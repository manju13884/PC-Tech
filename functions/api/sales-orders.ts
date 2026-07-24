import { getZohoSalesOrderById, getZohoSalesOrdersByCustomer } from '../../lib/salesOrders'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'

interface PagesFunctionContext {
  request: Request
  env: ZohoEnv
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const searchParams = new URL(context.request.url).searchParams
  const salesOrderId = searchParams.get('salesorder_id')?.trim() ?? ''
  const customerId = searchParams.get('customer_id')?.trim() ?? ''

  if (!salesOrderId && !customerId) {
    return Response.json({ error: 'salesorder_id or customer_id is required' }, { status: 400 })
  }

  try {
    if (salesOrderId) {
      const salesOrder = await getZohoSalesOrderById(salesOrderId, context.env)
      return salesOrder
        ? Response.json(salesOrder, { status: 200 })
        : Response.json({ error: 'Sales Order not found' }, { status: 404 })
    }

    return Response.json(await getZohoSalesOrdersByCustomer(customerId, context.env), { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load sales orders'
    const status = error instanceof ZohoRequestError ? error.status : 502
    const code = error instanceof ZohoRequestError ? error.code : 'sales_orders_request_failed'

    console.error('[sales-orders-api] request failed', { status, code, message })

    return Response.json({ error: message, code, status }, { status: 502 })
  }
}
