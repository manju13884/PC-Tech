import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { SystemUsage as UsageResponse, UsageKey } from './systemUsageTypes'
import { formatUsage, formatUsageTime } from './systemUsageFormatting'
import './system-usage.css'

const rows: { key: UsageKey; label: string; storage?: boolean }[] = [
  { key: 'zohoApi', label: 'Zoho Books API – Today' },
  { key: 'd1Database', label: 'PC-Tech D1 Database Size', storage: true },
  { key: 'totalD1', label: 'Cloudflare Account D1 Storage (All Databases)', storage: true },
  { key: 'd1RowsRead', label: 'D1 Rows Read – Today' },
  { key: 'd1RowsWritten', label: 'D1 Rows Written – Today' },
]

async function fetchUsage(): Promise<UsageResponse> {
  const response = await fetch('/api/system-usage', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(35000) })
  if (!response.ok) throw new Error('System Usage is unavailable. Please try Refresh again.')
  const payload = await response.json() as UsageResponse
  if (!payload.metrics || !rows.every(row => payload.metrics[row.key]) || !payload.refreshedAt) throw new Error('System Usage is unavailable.')
  return payload
}

function UsageValue({ text, reason }: { text: string; reason?: string }) {
  if (text !== 'Unavailable' || !reason) return <>{text}</>
  return <details className="system-usage-reason">
    <summary title={reason}>Unavailable <span aria-hidden="true">ⓘ</span></summary>
    <span>{reason}</span>
  </details>
}

export default function SystemUsage() {
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const initialRequest = useRef<Promise<UsageResponse> | null>(null)
  const active = useRef(false)
  const busy = useRef(true)
  const environmentLabel = data?.environment === 'LOCAL' ? 'Local'
    : data?.environment === 'STAGING' ? 'Dev'
    : data?.environment === 'PRODUCTION' ? 'Production'
    : null
  const databaseLabel = environmentLabel
    ? `PC-Tech ${environmentLabel} Database Size`
    : 'PC-Tech Database Size (Environment Unknown)'

  useEffect(() => {
    active.current = true
    let subscribed = true
    // React StrictMode replays effects; reuse only this mount's initial request.
    initialRequest.current ??= fetchUsage()
    initialRequest.current.then(result => { if (subscribed) setData(result) }, () => { if (subscribed) setError(true) })
      .finally(() => { if (subscribed) { setLoading(false); busy.current = false } })
    return () => { subscribed = false; active.current = false }
  }, [])

  async function refresh() {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError(false)
    try { const result = await fetchUsage(); if (active.current) setData(result) }
    catch { if (active.current) setError(true) }
    finally { busy.current = false; if (active.current) setLoading(false) }
  }

  return (
    <section className="system-usage" aria-labelledby="system-usage-title" aria-busy={loading}>
      <div className="system-usage-header">
        <h3 id="system-usage-title">System Usage</h3>
        <span className="system-usage-environment">Environment: {environmentLabel ?? (loading ? 'Loading…' : 'Unavailable')}</span>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh System Usage">
          <RefreshCw size={14} className={loading ? 'is-spinning' : ''} /> {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <p className="system-usage-meta" aria-live="polite">Last refreshed: {data ? `${formatUsageTime(data.refreshedAt)} IST` : loading ? 'Loading…' : 'Unavailable'}</p>
      {error && <p className="system-usage-error" role="alert">System Usage is unavailable. Please try Refresh again.</p>}
      <div className="system-usage-scroll" tabIndex={0} role="region" aria-label="System usage metrics">
        <table>
          <thead><tr><th scope="col">Resource</th><th scope="col">Current Usage</th><th scope="col">Limit</th><th scope="col">Remaining</th><th scope="col">As of</th></tr></thead>
          <tbody>{rows.map(row => {
            const metric = !error ? data?.metrics[row.key] : undefined
            const unavailableReason = error ? 'Monitoring request failed.' : metric?.reason
            return <tr key={row.key}>
              <th scope="row">{row.key === 'd1Database' ? databaseLabel : row.label}</th>
              <td data-unavailable={metric?.current == null}><UsageValue text={!data && loading ? 'Loading…' : formatUsage(metric?.current, row.storage)} reason={unavailableReason} /></td>
              <td data-unavailable={metric?.limit == null}><UsageValue text={!data && loading ? 'Loading…' : formatUsage(metric?.limit, row.storage)} reason={metric?.limitReason ?? unavailableReason} /></td>
              <td data-unavailable={metric?.remaining == null} title={metric?.limitReason ?? unavailableReason}>{!data && loading ? 'Loading…' : formatUsage(metric?.remaining == null ? null : Math.max(0, metric.remaining), row.storage)}</td>
              <td data-unavailable={!metric?.asOf}>{!data && loading ? 'Loading…' : formatUsageTime(metric?.asOf)}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <p className="system-usage-note">PC-Tech database size is for the environment shown above. Cloudflare account storage includes all hosted D1 databases, including Dev and Production when in that account; it excludes Local. Daily row totals also cover that account and use the UTC day. Times shown in IST; analytics may be delayed.</p>
    </section>
  )
}
