import { getZohoInvoiceById, getZohoInvoicesByCustomer } from '../../lib/invoices'
import type { ZohoEnv } from '../../lib/zoho'

interface PagesFunctionContext {
  request: Request
  env: ZohoEnv
}

/**
 * Cloudflare Function that returns invoice summaries for a Zoho Books customer.
 */
export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  try {
    const url = new URL(context.request.url)
    const invoiceId = url.searchParams.get('invoice_id') ?? ''
    const customerId = url.searchParams.get('customer_id') ?? ''

    if (invoiceId) {
      const invoice = await getZohoInvoiceById(invoiceId, context.env)

      return invoice
        ? Response.json(invoice, { status: 200 })
        : Response.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return Response.json(await getZohoInvoicesByCustomer(customerId, context.env), { status: 200 })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load invoices',
      },
      { status: 502 },
    )
  }
}
