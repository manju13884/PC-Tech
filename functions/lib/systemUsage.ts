import { targets } from '../../lib/deploymentTargets.ts'
import { getZohoUsageHeaders, type ZohoEnv } from '../../lib/zoho'
import type { SystemUsage, UsageKey, UsageMetric } from '../../src/features/system-usage/systemUsageTypes.ts'

export interface UsageEnv {
  DB?: D1Database
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  D1_DATABASE_ID?: string
  D1_PLAN?: string
  D1_DATABASE_LIMIT_BYTES?: string
  D1_ACCOUNT_STORAGE_LIMIT_BYTES?: string
  D1_DAILY_ROWS_READ_LIMIT?: string
  D1_DAILY_ROWS_WRITTEN_LIMIT?: string
  ZOHO_CLIENT_ID?: string
  ZOHO_CLIENT_SECRET?: string
  ZOHO_REFRESH_TOKEN?: string
  ZOHO_ORG_ID?: string
  ZOHO_REGION?: string
}
type ObjectValue = Record<string, unknown>
type Provider = 'Cloudflare' | 'Zoho'
type Source = 'D1 metadata' | 'analytics' | 'Books contacts'
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const number = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const integerString = (value: string | null | undefined): number | null => value && /^\d+$/.test(value.trim()) ? number(Number(value.trim())) : null

class UsageError extends Error {
  code: string
  status?: number
  constructor(code: string, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}
const unavailable = (error: UsageError): UsageMetric => ({
  available: false, current: null, limit: null, remaining: null, asOf: null, code: error.code, reason: error.message,
})
const observed = (current: number): UsageMetric => ({
  available: true, current, limit: null, remaining: null, asOf: new Date().toISOString(),
})

function statusError(provider: Provider, source: Source, status: number): UsageError {
  if (status === 401) return new UsageError('authentication', `${provider} credentials are invalid or expired.`, status)
  if (status === 403) return new UsageError('permission', provider === 'Cloudflare'
    ? source === 'analytics' ? 'Cloudflare Account Analytics Read permission required.' : 'Cloudflare D1 Read permission required.'
    : 'Zoho Books contacts READ permission required.', status)
  if (status === 429) return new UsageError('rate_limit', `${provider} rate limit reached. Try Refresh later.`, status)
  if (status === 408 || status === 504) return new UsageError('timeout', `${provider} monitoring request timed out.`, status)
  if (status === 404) return new UsageError('not_found', `${provider} account or monitoring resource was not found.`, status)
  return new UsageError('provider_error', `${provider} monitoring service is unavailable.`, status)
}

function safeError(error: unknown, provider: Provider, source: Source): UsageError {
  if (error instanceof UsageError) return error
  if (provider === 'Zoho') {
    const code = object(error).code
    if (code === 'invalid_client' || code === 'invalid_client_secret' || code === 'invalid_code' || code === 'invalid_token') {
      return new UsageError('authentication', 'Zoho OAuth credentials or refresh token are invalid or expired.')
    }
    if (code === 'invalid_scope' || code === 'OAUTH_SCOPE_MISMATCH') return new UsageError('permission', 'Zoho Books contacts READ permission required.')
  }
  const status = object(error).status
  if (typeof status === 'number') return statusError(provider, source, status)
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new UsageError('timeout', `${provider} monitoring request timed out.`)
  }
  return new UsageError('network', `${provider} monitoring request could not be completed.`)
}

// Classify external text, but never copy it into logs or responses.
function graphqlError(errors: unknown[]): UsageError {
  const messages = errors.map(error => String(object(error).message ?? '')).join(' ').toLowerCase()
  if (/permission|not authorized|not authorised|access denied|does not have access|not allowed|forbidden/.test(messages)) return new UsageError('permission', 'Cloudflare Account Analytics Read permission required.')
  if (/unauthenticated|authentication|invalid.*token/.test(messages)) return new UsageError('authentication', 'Cloudflare credentials are invalid or expired.')
  if (/rate.?limit|too many/.test(messages)) return new UsageError('rate_limit', 'Cloudflare analytics rate limit reached. Try Refresh later.')
  if (/unknown (field|argument|type)|cannot query|not defined|validation|invalid.*(filter|query)/.test(messages)) return new UsageError('graphql_query', 'Cloudflare analytics query or schema is not supported.')
  return new UsageError('graphql_error', 'Cloudflare analytics returned an error.')
}

export function usageEnvironment(url: string) {
  const { origin, hostname } = new URL(url)
  if (hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname)
    || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    return { environment: 'LOCAL' as const, target: null }
  }
  for (const [name, target] of Object.entries(targets)) {
    if (target.origins.includes(origin)) return { environment: name === 'production' ? 'PRODUCTION' as const : 'STAGING' as const, target }
  }
  return { environment: 'UNAVAILABLE' as const, target: null }
}

function applyLimit(metric: UsageMetric, raw: string | undefined): UsageMetric {
  const limit = integerString(raw)
  if (limit === null) return { ...metric, limitReason: raw?.trim()
    ? 'The configured limit is invalid; use a non-negative whole number.'
    : 'The applicable limit has not been configured for this environment.' }
  return { ...metric, limit, remaining: metric.current === null ? null : Math.max(0, limit - metric.current) }
}

export function zohoMetricFromHeaders(headers: Headers): UsageMetric {
  const limit = integerString(headers.get('x-rate-limit-limit'))
  const remaining = integerString(headers.get('x-rate-limit-remaining'))
  const reset = integerString(headers.get('x-rate-limit-reset'))
  // Books documents a separate 100/minute throttle. Do not label a minute
  // quota as today's usage. Daily headers were verified against the live IN API.
  if (limit === null || limit <= 100 || remaining === null || remaining > limit || reset === null || reset > 86400) {
    throw new UsageError('unsupported', 'Zoho daily API usage headers are missing or cannot be verified.')
  }
  return { ...observed(limit - remaining), limit, remaining }
}

export async function collectSystemUsage(
  request: Request,
  env: UsageEnv,
  fetcher: typeof fetch = fetch,
  zohoHeaders: (env: ZohoEnv) => Promise<Headers> = getZohoUsageHeaders,
): Promise<SystemUsage> {
  const { environment } = usageEnvironment(request.url)
  const blank = () => unavailable(new UsageError('pending', 'Monitoring is unavailable.'))
  const metrics: SystemUsage['metrics'] = { zohoApi: blank(), d1Database: blank(), totalD1: blank(), d1RowsRead: blank(), d1RowsWritten: blank() }
  // Explicitly configured remote identity only; never infer it from the hostname.
  let remoteDatabaseSize: UsageMetric | undefined
  function fail(key: UsageKey, error: UsageError) {
    metrics[key] = unavailable(error)
    console.warn('[system-usage]', { metric: key, code: error.code, ...(error.status ? { status: error.status } : {}) })
  }

  const sizeTask = (async () => {
    try {
      if (!env.DB) throw new UsageError('configuration', 'Current database binding is not configured.')
      const result = await env.DB.prepare('SELECT 1').all()
      const bytes = number(result.meta?.size_after)
      if (!result.success || bytes === null) throw new UsageError('invalid_metadata', 'Current database size metadata unavailable.')
      metrics.d1Database = observed(bytes)
    } catch (error) { fail('d1Database', error instanceof UsageError ? error : new UsageError('database', 'Current database metadata could not be read.')) }
  })()

  const zohoTask = (async () => {
    try {
      const configured: ZohoEnv = {
        ZOHO_CLIENT_ID: env.ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET: env.ZOHO_CLIENT_SECRET,
        ZOHO_REFRESH_TOKEN: env.ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID: env.ZOHO_ORG_ID, ZOHO_REGION: env.ZOHO_REGION,
      }
      if (!configured.ZOHO_ORG_ID?.trim()) throw new UsageError('configuration', 'Zoho organization ID is not configured.')
      if (!/^\d+$/.test(configured.ZOHO_ORG_ID.trim())) throw new UsageError('configuration', 'Zoho organization ID is invalid.')
      if (![configured.ZOHO_CLIENT_ID, configured.ZOHO_CLIENT_SECRET, configured.ZOHO_REFRESH_TOKEN].every(value => value?.trim())) throw new UsageError('configuration', 'Zoho OAuth credentials are not configured.')
      if (configured.ZOHO_REGION && configured.ZOHO_REGION.trim().toLowerCase() !== 'in') throw new UsageError('configuration', 'The existing Zoho integration supports the IN region only.')
      metrics.zohoApi = zohoMetricFromHeaders(await zohoHeaders(configured))
    } catch (error) { fail('zohoApi', safeError(error, 'Zoho', 'Books contacts')) }
  })()

  const cloudflareTask = (async () => {
    const account = env.CLOUDFLARE_ACCOUNT_ID?.trim()
    const token = env.CLOUDFLARE_API_TOKEN?.trim()
    let configError: UsageError | undefined
    if (!account && !token) configError = new UsageError('configuration', 'Cloudflare Account ID and API token are not configured.')
    else if (!account) configError = new UsageError('configuration', 'Cloudflare Account ID not configured.')
    else if (!/^[a-f0-9]{32}$/i.test(account)) configError = new UsageError('configuration', 'Cloudflare Account ID is invalid.')
    else if (!token) configError = new UsageError('configuration', 'Cloudflare API token not configured.')
    if (configError) {
      for (const key of ['totalD1', 'd1RowsRead', 'd1RowsWritten'] as const) fail(key, configError)
      return
    }
    // Account metrics use ONLY credentials explicitly supplied by this runtime,
    // also in LOCAL. They are independent of the current D1 binding and hostname.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const api = async (path: string, source: Source, body?: unknown) => {
      const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!response.ok) { await response.body?.cancel(); throw statusError('Cloudflare', source, response.status) }
      let payload: ObjectValue
      try { payload = object(await response.json()) }
      catch { throw new UsageError('invalid_response', `Cloudflare ${source} returned an invalid response.`) }
      if (!body && (payload.success !== true || (Array.isArray(payload.errors) && payload.errors.length))) {
        throw new UsageError('provider_error', 'Cloudflare D1 metadata request failed.')
      }
      return payload
    }
    const storageTask = (async () => {
      try {
        const databases = new Map<string, ObjectValue>()
        let total: number | null = null
        const perPage = 100
        for (let page = 1; ; page++) {
          const listing = await api(`/accounts/${account}/d1/database?per_page=${perPage}&page=${page}`, 'D1 metadata')
          if (!Array.isArray(listing.result)) throw new UsageError('invalid_response', 'Cloudflare database inventory is invalid.')
          const info = object(listing.result_info)
          const declaredTotal = number(info.total_count)
          if (total !== null && declaredTotal !== null && total !== declaredTotal) throw new UsageError('incomplete', 'Cloudflare database inventory changed during refresh. Try again.')
          total ??= declaredTotal
          const before = databases.size
          for (const value of listing.result) {
            const database = object(value)
            if (typeof database.uuid !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(database.uuid)) throw new UsageError('invalid_response', 'Cloudflare database identifiers are invalid.')
            const id = database.uuid.toLowerCase()
            const prior = databases.get(id)
            if (prior && number(prior.file_size) !== null && number(database.file_size) !== null && prior.file_size !== database.file_size) throw new UsageError('incomplete', 'Cloudflare storage metadata changed during refresh. Try again.')
            if (!prior || number(database.file_size) !== null) databases.set(id, { ...database, uuid: id })
          }
          if (total !== null && databases.size === total) break
          if (total !== null && databases.size > total) throw new UsageError('incomplete', 'Cloudflare database inventory is inconsistent.')
          const pageSize = number(info.per_page) ?? perPage
          if (total === null && listing.result.length < pageSize) break
          if (databases.size === before) throw new UsageError('incomplete', 'Cloudflare database inventory is incomplete.')
        }
        const entries = [...databases.values()]
        let index = 0
        let bytes = 0
        await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
          while (index < entries.length) {
            const database = entries[index++]
            let size = number(database.file_size)
            if (size === null) size = number(object((await api(`/accounts/${account}/d1/database/${database.uuid}`, 'D1 metadata')).result).file_size)
            if (size === null) throw new UsageError('invalid_metadata', 'Cloudflare did not return a size for every database.')
            if (env.D1_DATABASE_ID?.trim().toLowerCase() === database.uuid) remoteDatabaseSize = observed(size)
            bytes += size
          }
        }))
        if (!Number.isSafeInteger(bytes)) throw new UsageError('invalid_metadata', 'Cloudflare storage total is outside the supported numeric range.')
        metrics.totalD1 = observed(bytes)
      } catch (error) { fail('totalD1', safeError(error, 'Cloudflare', 'D1 metadata')) }
    })()
    const analyticsTask = (async () => {
      try {
        const end = new Date().toISOString()
        const start = `${end.slice(0, 10)}T00:00:00.000Z`
        const payload = await api('/graphql', 'analytics', {
          // datetimeHour bounds are used by Wrangler's own D1 metrics query.
          // No dimensions: one aggregate across the explicitly configured account.
          query: `query SystemUsage($accountTag: string!, $start: Time!, $end: Time!) {
            viewer { accounts(filter: {accountTag: $accountTag}) {
              d1AnalyticsAdaptiveGroups(limit: 1, filter: {datetimeHour_geq: $start, datetimeHour_leq: $end}) {
                sum { rowsRead rowsWritten }
              }
            } }
          }`,
          variables: { accountTag: account, start, end },
        })
        const errors = Array.isArray(payload.errors) ? payload.errors : []
        const accounts = object(object(payload.data).viewer).accounts
        if (!Array.isArray(accounts) || accounts.length !== 1) throw errors.length ? graphqlError(errors) : new UsageError('invalid_response', 'Cloudflare analytics did not return the configured account.')
        const groups = object(accounts[0]).d1AnalyticsAdaptiveGroups
        if (!Array.isArray(groups) || groups.length !== 1) throw errors.length ? graphqlError(errors) : new UsageError('no_data', 'Cloudflare has not returned analytics for the current UTC day.')
        const sum = object(object(groups[0]).sum)
        for (const [key, field] of [['d1RowsRead', 'rowsRead'], ['d1RowsWritten', 'rowsWritten']] as const) {
          const relevantErrors = errors.filter(error => {
            const path = object(error).path
            return !Array.isArray(path) || (!path.includes('rowsRead') && !path.includes('rowsWritten')) || path.includes(field)
          })
          const value = number(sum[field])
          if (relevantErrors.length) fail(key, graphqlError(relevantErrors))
          else if (value === null) fail(key, new UsageError('invalid_response', `Cloudflare ${field === 'rowsRead' ? 'rows-read' : 'rows-written'} analytics is missing or invalid.`))
          else metrics[key] = observed(value)
        }
      } catch (error) {
        const safe = safeError(error, 'Cloudflare', 'analytics')
        fail('d1RowsRead', safe)
        fail('d1RowsWritten', safe)
      }
    })()
    try { await Promise.allSettled([storageTask, analyticsTask]) }
    finally { clearTimeout(timeout) }
  })()

  await Promise.allSettled([sizeTask, zohoTask, cloudflareTask])
  // Reuse REST file_size when explicitly mapped; metadata remains the independent
  // fallback if credentials/permissions/inventory fail. No extra REST request.
  if (remoteDatabaseSize) metrics.d1Database = remoteDatabaseSize
  // Opt-in server-side plan preset; never infer a plan from missing credentials.
  const freePlan = env.D1_PLAN?.trim().toLowerCase() === 'free'
  metrics.d1Database = applyLimit(metrics.d1Database, env.D1_DATABASE_LIMIT_BYTES ?? (freePlan ? '500000000' : undefined))
  metrics.totalD1 = applyLimit(metrics.totalD1, env.D1_ACCOUNT_STORAGE_LIMIT_BYTES ?? (freePlan ? '5000000000' : undefined))
  metrics.d1RowsRead = applyLimit(metrics.d1RowsRead, env.D1_DAILY_ROWS_READ_LIMIT ?? (freePlan ? '5000000' : undefined))
  metrics.d1RowsWritten = applyLimit(metrics.d1RowsWritten, env.D1_DAILY_ROWS_WRITTEN_LIMIT ?? (freePlan ? '100000' : undefined))
  return { environment, refreshedAt: new Date().toISOString(), metrics }
}
