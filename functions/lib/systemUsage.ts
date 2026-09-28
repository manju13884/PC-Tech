import { targets } from '../../lib/deploymentTargets.ts'
import type { SystemUsage, UsageMetric } from '../../src/features/system-usage/systemUsageTypes.ts'

export interface UsageEnv {
  DB?: D1Database
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}
type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const number = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const unavailable = (reason: string): UsageMetric => ({ current: null, limit: null, remaining: null, asOf: null, reason })
const observed = (current: number): UsageMetric => ({
  current, limit: null, remaining: null, asOf: new Date().toISOString(),
  limitReason: 'The applicable plan limit is not available from the configured monitoring sources.',
})

export function usageEnvironment(url: string) {
  const { origin, hostname } = new URL(url)
  if (hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname)
    || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    return { environment: 'LOCAL' as const, target: null }
  }
  for (const [name, target] of Object.entries(targets)) {
    if (target.origins.includes(origin)) return { environment: name === 'production' ? 'PRODUCTION' as const : 'STAGING' as const, target }
  }
  // Unmapped preview/custom hosts must never silently fall back to production.
  return { environment: 'UNAVAILABLE' as const, target: null }
}

async function boundDatabaseSize(db: D1Database | undefined): Promise<UsageMetric> {
  if (!db) return unavailable('Current database metadata unavailable.')
  try {
    // A constant query scans no application table. size_after is D1's own metadata,
    // not an estimate. The binding is the current runtime's database, including local.
    const result = await db.prepare('SELECT 1').all()
    const bytes = number(result.meta?.size_after)
    return result.success && bytes !== null ? observed(bytes) : unavailable('Current database size unavailable.')
  } catch { return unavailable('Current database size unavailable.') }
}

export async function collectSystemUsage(request: Request, env: UsageEnv, fetcher: typeof fetch = fetch): Promise<SystemUsage> {
  const { environment, target } = usageEnvironment(request.url)
  const unavailableRemote = environment === 'LOCAL'
    ? 'Remote account monitoring is not used in the local environment.'
    : 'Cloudflare monitoring configuration or permissions unavailable.'
  const metrics: SystemUsage['metrics'] = {
    zohoApi: unavailable('Zoho Books does not provide a verified usage endpoint through the configured integration.'),
    d1Database: unavailable('Current database size unavailable.'),
    totalD1: unavailable(unavailableRemote),
    d1RowsRead: unavailable(unavailableRemote),
    d1RowsWritten: unavailable(unavailableRemote),
  }
  const sizeTask = boundDatabaseSize(env.DB).then(metric => { metrics.d1Database = metric })
  const account = env.CLOUDFLARE_ACCOUNT_ID
  const token = env.CLOUDFLARE_API_TOKEN
  if (target && account && /^[a-f0-9]{32}$/i.test(account) && token) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const api = async (path: string, body?: unknown) => {
      const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!response.ok) throw new Error('Monitoring unavailable')
      const payload = object(await response.json())
      if (payload.success === false || (Array.isArray(payload.errors) && payload.errors.length && (!body || !payload.data))) throw new Error('Monitoring unavailable')
      return payload
    }
    try {
      // Verify this account owns the existing deployment target before reading any
      // account-wide data. No account/database identity is accepted from the browser.
      const project = object((await api(`/accounts/${account}/pages/projects/${target.project}`)).result)
      const config = object(object(project.deployment_configs).production)
      const binding = object(object(config.d1_databases).DB)
      if (project.production_branch !== target.branch || (binding.id ?? binding.database_id) !== target.database) throw new Error('Target mismatch')

      const totalTask = (async () => {
        try {
          // Bounded metadata work. Never present a partial listing as an account total.
          const listing = await api(`/accounts/${account}/d1/database?per_page=100&page=1`)
          const databases = listing.result
          const total = number(object(listing.result_info).total_count)
          if (!Array.isArray(databases) || total === null || total !== databases.length || total > 40) throw new Error('Incomplete listing')
          const ids = databases.map(value => object(value).uuid)
          if (ids.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) || new Set(ids).size !== total || !ids.includes(target.database)) throw new Error('Invalid listing')
          let index = 0
          let bytes = 0
          await Promise.all(Array.from({ length: Math.min(4, total) }, async () => {
            while (index < databases.length) {
              const database = object(databases[index++])
              let size = number(database.file_size)
              if (size === null) size = number(object((await api(`/accounts/${account}/d1/database/${database.uuid}`)).result).file_size)
              if (size === null) throw new Error('Missing database size')
              bytes += size
            }
          }))
          if (!Number.isSafeInteger(bytes)) throw new Error('Invalid total')
          metrics.totalD1 = observed(bytes)
        } catch { metrics.totalD1 = unavailable('Complete account storage metadata unavailable.') }
      })()
      const analyticsTask = (async () => {
        try {
          const day = new Date().toISOString().slice(0, 10)
          const payload = await api('/graphql', {
            query: `query SystemUsage($accountTag: string!, $day: Date!) {
              viewer { accounts(filter: {accountTag: $accountTag}) {
                d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: $day, date_leq: $day}) {
                  sum { rowsRead rowsWritten }
                }
              } }
            }`,
            variables: { accountTag: account, day },
          })
          const accounts = object(object(payload.data).viewer).accounts
          if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('Missing account')
          const groups = object(accounts[0]).d1AnalyticsAdaptiveGroups
          // Missing/empty analytics is not proof of zero usage.
          if (!Array.isArray(groups) || groups.length !== 1) throw new Error('Missing analytics')
          const sum = object(object(groups[0]).sum)
          const reads = number(sum.rowsRead), writes = number(sum.rowsWritten)
          metrics.d1RowsRead = reads === null ? unavailable('Cloudflare rows-read analytics unavailable.') : observed(reads)
          metrics.d1RowsWritten = writes === null ? unavailable('Cloudflare rows-written analytics unavailable.') : observed(writes)
        } catch {
          metrics.d1RowsRead = unavailable('Cloudflare analytics unavailable.')
          metrics.d1RowsWritten = unavailable('Cloudflare analytics unavailable.')
        }
      })()
      await Promise.allSettled([totalTask, analyticsTask])
    } catch { /* Keep safe, independent unavailable values; never return upstream errors. */ }
    finally { clearTimeout(timeout) }
  }
  await sizeTask
  return { environment, refreshedAt: new Date().toISOString(), metrics }
}
