import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { formatIstDateTime } from './utils/dateTimeFormatting'
import './access-report.css'

interface AccessRecord {
  id: number
  fullName: string
  email: string
  loginAt: string
  logoutAt: string | null
  logoutType: string
}

export default function AccessReport() {
  const [records, setRecords] = useState<AccessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/auth/access-report?page=${page}`, { credentials: 'include', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load access report')
        if (!controller.signal.aborted) {
          setRecords(data.records)
          setHasMore(data.hasMore)
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to load access report')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [page, refresh])

  return (
    <div className="access-report" aria-label="User login history" aria-busy={loading}>
      <div className="admin-panel-toolbar access-report-toolbar">
        <div className="access-report-options" aria-label="Reports">
          <strong>Access Report</strong>
        </div>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={14} aria-hidden="true" />{loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {loading && <p className="access-report-message" role="status">Loading login history...</p>}
      {error && <p className="admin-user-message" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          <div className="admin-users-table-wrap access-report-scroll" tabIndex={0} role="region" aria-label="Login history table">
            <table className="admin-users-table access-report-table" aria-label="User login details">
              <caption><strong>User login history</strong><span>All times in IST</span></caption>
              <thead><tr>
                <th scope="col">User</th><th scope="col">Email</th>
                <th scope="col">Login date &amp; time (IST)</th><th scope="col">Logout date &amp; time (IST)</th>
                <th scope="col">Logout Type</th>
              </tr></thead>
              <tbody>
                {records.map((record) => <tr key={record.id}>
                  <td className="access-report-user">{record.fullName}</td><td className="access-report-email">{record.email}</td>
                  <td className="access-report-datetime">{formatIstDateTime(record.loginAt)}</td>
                  <td className="access-report-datetime">{formatIstDateTime(record.logoutAt, record.logoutType === 'Active' ? 'In progress' : 'Not recorded')}</td>
                  <td><span className={`access-report-status ${record.logoutType === 'Active' ? 'active' : record.logoutType === 'Unknown' ? 'unknown' : 'ended'}`}
                    title={record.logoutType === 'Unknown' ? 'Logout type was not recorded for this older session.' : undefined}>{record.logoutType}</span></td>
                </tr>)}
                {records.length === 0 && <tr><td colSpan={5} className="access-report-empty">No login records found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="admin-panel-toolbar access-report-footer">
            <span>{records.length === 0 ? '0 records' : `${(page - 1) * 50 + 1}–${(page - 1) * 50 + records.length} records`}</span>
            <nav aria-label="Login history pages">
              <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} aria-hidden="true" />Previous</button>
              <span aria-live="polite">Page {page}</span>
              <button type="button" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={14} aria-hidden="true" /></button>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
