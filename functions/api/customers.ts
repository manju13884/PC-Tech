import { getZohoCustomers, type CustomerSummary } from '../../lib/customers'
import { isCurrentDailyCustomerCache } from '../../lib/customerCacheSchedule'
import { ZohoRequestError, type ZohoEnv } from '../../lib/zoho'
import { getAuthenticatedUser } from '../lib/authenticatedUser'

interface Env extends ZohoEnv {
  DB?: D1Database
}

interface PagesFunctionContext {
  request: Request
  env: Env
}

interface CustomerCacheRow {
  payload_json: string
  refreshed_at: string
}

const CUSTOMER_CACHE_KEY = 'active-customers'

function jsonResponse(payload: unknown, status: number, headers: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

function parseCustomers(payloadJson: string): CustomerSummary[] | null {
  try {
    const payload: unknown = JSON.parse(payloadJson)
    return Array.isArray(payload) ? payload as CustomerSummary[] : null
  } catch {
    return null
  }
}

async function readCustomerCache(db: D1Database): Promise<CustomerCacheRow | null> {
  return db.prepare(
    `SELECT payload_json, refreshed_at
     FROM customer_cache
     WHERE cache_key = ?`,
  ).bind(CUSTOMER_CACHE_KEY).first<CustomerCacheRow>()
}

async function refreshCustomerCache(env: Env): Promise<{ customers: CustomerSummary[]; refreshedAt: string }> {
  if (!env.DB) throw new Error('Customer cache database is unavailable')

  const customers = await getZohoCustomers(env)
  const refreshedAt = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO customer_cache (cache_key, payload_json, refreshed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       refreshed_at = excluded.refreshed_at`,
  ).bind(CUSTOMER_CACHE_KEY, JSON.stringify(customers), refreshedAt).run()

  return { customers, refreshedAt }
}

function customerErrorResponse(error: unknown, action: 'load' | 'refresh'): Response {
  const safeMessage = error instanceof Error ? error.message : `Unable to ${action} customers`
  const status = error instanceof ZohoRequestError ? error.status : 502
  const code = error instanceof ZohoRequestError ? error.code : `customers_${action}_failed`

  console.error(`[customers-api] ${action} failed`, { status, code, message: safeMessage })
  return jsonResponse({ error: safeMessage, code, status }, 502)
}

function isMissingCustomerCache(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('no such table: customer_cache')
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  try {
    if (!context.env.DB) throw new Error('Customer cache database is unavailable')

    const cached = await readCustomerCache(context.env.DB)
    const customers = cached ? parseCustomers(cached.payload_json) : null
    if (customers && isCurrentDailyCustomerCache(cached!.refreshed_at)) {
      return jsonResponse(customers, 200, {
        'X-Customer-Cache': 'HIT',
        'X-Customer-Refreshed-At': cached.refreshed_at,
      })
    }

    const refreshed = await refreshCustomerCache(context.env)
    return jsonResponse(refreshed.customers, 200, {
      'X-Customer-Cache': customers ? 'STALE' : 'MISS',
      'X-Customer-Refreshed-At': refreshed.refreshedAt,
    })
  } catch (error) {
    if (isMissingCustomerCache(error)) {
      try {
        return jsonResponse(await getZohoCustomers(context.env), 200, {
          'X-Customer-Cache': 'BYPASS',
        })
      } catch (zohoError) {
        return customerErrorResponse(zohoError, 'load')
      }
    }
    return customerErrorResponse(error, 'load')
  }
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  try {
    if (!context.env.DB) throw new Error('Customer cache database is unavailable')

    const user = await getAuthenticatedUser(context.request, context.env.DB)
    if (!user) return jsonResponse({ error: 'Authentication required.' }, 401)
    if (user.roleName !== 'SUPERADMIN') {
      return jsonResponse({ error: 'SUPERADMIN access required.' }, 403)
    }

    return jsonResponse(await refreshCustomerCache(context.env), 200)
  } catch (error) {
    return customerErrorResponse(error, 'refresh')
  }
}
