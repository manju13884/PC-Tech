import { getZohoCustomers } from '../../lib/customers'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'

interface PagesFunctionContext {
  env: ZohoEnv
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Cloudflare Function that returns active customer summaries from Zoho Books contacts.
 */
export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  try {
    return jsonResponse(await getZohoCustomers(context.env), 200)
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : 'Unable to load customers'
    const status = error instanceof ZohoRequestError ? error.status : 502
    const code = error instanceof ZohoRequestError ? error.code : 'customers_request_failed'

    console.error('[customers-api] request failed', {
      status,
      code,
      message: safeMessage,
    })

    return jsonResponse({
      error: safeMessage,
      code,
      status,
    }, 502)
  }
}
