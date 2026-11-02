import { getDashboardResponse } from '../home-sales-orders'
import { onRequestGet as getCustomers } from '../customers'
import { isCacheRefreshAuthorized } from '../../lib/cacheRefreshAuth'
import type { ZohoEnv } from '../../../lib/zoho'

interface Context {
  request: Request
  env: ZohoEnv & { DB: D1Database; CACHE_REFRESH_TOKEN?: string }
}

export async function onRequestPost(context: Context): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' }
  if (!await isCacheRefreshAuthorized(context.request, context.env.CACHE_REFRESH_TOKEN)) {
    return Response.json({ error: 'Authentication required.' }, { status: 401, headers })
  }
  const cache = new URL(context.request.url).searchParams.get('cache')
  if (cache !== 'dashboard' && cache !== 'customers') {
    return Response.json({ error: 'Unknown cache.' }, { status: 400, headers })
  }
  try {
    const result = await (cache === 'dashboard' ? getDashboardResponse(context) : getCustomers(context))
    if (!result.ok) return Response.json({ cache, ok: false }, { status: 502, headers })
    if (cache === 'dashboard') {
      const payload = await result.json() as { errors?: { sales?: string | null; finance?: string | null } }
      if (payload.errors?.sales || payload.errors?.finance) {
        return Response.json({ cache, ok: false }, { status: 502, headers })
      }
    }
    // Scheduled callers receive no customer or financial data.
    return Response.json({ cache, ok: true }, { headers })
  } catch {
    return Response.json({ cache, ok: false }, { status: 502, headers })
  }
}
