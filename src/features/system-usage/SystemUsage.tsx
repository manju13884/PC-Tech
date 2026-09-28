import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { SystemUsage as UsageResponse, UsageKey } from './systemUsageTypes'
import { formatUsage, formatUsageTime } from './systemUsageFormatting'
import './system-usage.css'

const rows: { key: UsageKey; label: string; storage?: boolean }[] = [
  { key: 'zohoApi', label: 'Zoho Books API – Today' },
  { key: 'd1Database', label: 'PC-Tech D1 Database Size', storage: true },
  { key: 'totalD1', label: 'Total D1 Database Size', storage: true },
  { key: 'd1RowsRead', label: 'D1 Rows Read – Today' },
  { key: 'd1RowsWritten', label: 'D1 Rows Written – Today' },
]

async function fetchUsage(): Promise<UsageResponse> {
  const response = await fetch('/api/system-usage', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('System Usage is unavailable. Please try Refresh again.')
  const payload = await response.json() as UsageResponse
  if (!payload.metrics || !rows.every(row => payload.metrics[row.key]) || !payload.refreshedAt) throw new Error('System Usage is unavailable.')
  return payload
}

export default function SystemUsage() {
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const initialRequest = useRef<Promise<UsageResponse> | null>(null)
  const active = useRef(false)
  const busy = useRef(true)

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
        <span className="system-usage-environment">Environment: {data?.environment === 'UNAVAILABLE' ? 'Unavailable' : data?.environment ?? (loading ? 'Loading…' : 'Unavailable')}</span>
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
              <th scope="row">{row.label}</th>
              <td data-unavailable={metric?.current == null} title={unavailableReason}>{!data && loading ? 'Loading…' : formatUsage(metric?.current, row.storage)}</td>
              <td data-unavailable={metric?.limit == null} title={metric?.limitReason ?? unavailableReason}>{!data && loading ? 'Loading…' : formatUsage(metric?.limit, row.storage)}</td>
              <td data-unavailable={metric?.remaining == null} title={metric?.limitReason ?? unavailableReason}>{!data && loading ? 'Loading…' : formatUsage(metric?.remaining == null ? null : Math.max(0, metric.remaining), row.storage)}</td>
              <td data-unavailable={!metric?.asOf}>{!data && loading ? 'Loading…' : formatUsageTime(metric?.asOf)}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <p className="system-usage-note">D1 daily totals use the UTC day. Total storage and daily row totals cover the configured Cloudflare account. Times shown in IST; analytics may be delayed.</p>
    </section>
  )
}
