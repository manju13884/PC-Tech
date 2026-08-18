import { getZohoDeliveryChallanById, getZohoDeliveryChallansByCustomer } from '../../lib/deliveryChallans'
import type { ZohoEnv } from '../../lib/zoho'

interface Context { request: Request; env: ZohoEnv }

export async function onRequestGet(context: Context): Promise<Response> {
  try {
    const url = new URL(context.request.url)
    const id = url.searchParams.get('delivery_challan_id')?.trim() ?? ''
    const customerId = url.searchParams.get('customer_id')?.trim() ?? ''
    if (!id && !customerId) return Response.json({ error: 'Delivery Challan ID or Customer ID is required' }, { status: 400 })
    if (id) {
      const challan = await getZohoDeliveryChallanById(id, context.env)
      return challan
        ? Response.json(challan)
        : Response.json({ error: 'Delivery Challan not found' }, { status: 404 })
    }
    return Response.json(await getZohoDeliveryChallansByCustomer(customerId, context.env))
  } catch (error) {
    console.error('[delivery-challans-api] request failed', { message: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load Delivery Challans' }, { status: 502 })
  }
}
