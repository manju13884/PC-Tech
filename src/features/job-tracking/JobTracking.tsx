import { Activity, ChevronRight, FilterX, RefreshCw } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatIstDate, formatIstDateTime } from '../../utils/dateTimeFormatting'
import { JobCard, type JobCardLine } from '../job-cards/JobCards'
import '../job-cards/job-cards.css'
import './job-tracking.css'

type JobStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
type TrackedJob = Omit<JobCardLine, 'job_status'> & { job_card_id: number; job_number: string; job_status: JobStatus; job_updated_at: string }

const statusLabel = (status: JobStatus) => status === 'IN_PROGRESS' ? 'IN PROGRESS' : status
const numberText = (value: number) => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 })

export default function JobTracking() {
  const [jobs, setJobs] = useState<TrackedJob[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | JobStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [savingProcessKey, setSavingProcessKey] = useState('')
  const [savingFooterKey, setSavingFooterKey] = useState('')
  const [expanded, setExpanded] = useState<number[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/job-tracking', { credentials: 'include' })
      const data = await response.json().catch(() => ({})) as { jobs?: TrackedJob[]; error?: string }
      if (response.status === 401) window.dispatchEvent(new Event('pc-tech-session-expired'))
      if (!response.ok) throw new Error(data.error || 'Unable to load Job Tracking.')
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load Job Tracking.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return jobs.filter((job) => (status === 'ALL' || job.job_status === status) && (!term ||
      `${job.job_number} ${job.plan_number} ${job.sales_order_number} ${job.specification_code} ${job.customer_name} ${job.product_name} ${job.item_description}`.toLowerCase().includes(term)))
  }, [jobs, search, status])

  const updateStatus = async (jobCardId: number, nextStatus: JobStatus) => {
    setUpdatingId(jobCardId); setError('')
    try {
      const response = await fetch('/api/job-tracking', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCardId, status: nextStatus }),
      })
      const data = await response.json().catch(() => ({})) as { jobs?: TrackedJob[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to update Job Card status.')
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update Job Card status.') }
    finally { setUpdatingId(null) }
  }
  const toggleExpanded = (jobCardId: number) => setExpanded((current) => current.includes(jobCardId)
    ? current.filter((id) => id !== jobCardId)
    : [...current, jobCardId])
  const updateProcessValue = async (jobCardId: number, processName: string, field: 'start_datetime' | 'end_datetime' | 'in_quantity' | 'out_quantity' | 'employee_name' | 'in_quantity_2' | 'out_quantity_2' | 'employee_name_2' | 'reel_number' | 'in_reel_weight' | 'out_reel_weight' | 'remaining_reel_weight' | 'reel_number_2' | 'in_reel_weight_2' | 'out_reel_weight_2' | 'remaining_reel_weight_2', value: string) => {
    const key = `${jobCardId}:${processName}:${field}`
    setSavingProcessKey(key); setError('')
    try {
      const response = await fetch('/api/job-tracking', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCardId, processName, field, value }),
      })
      const data = await response.json().catch(() => ({})) as { jobs?: TrackedJob[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to save process details.')
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save process details.') }
    finally { setSavingProcessKey('') }
  }
  const updateFooterValue = async (jobCardId: number, footerField: 'supervisor_name' | 'quality_name' | 'dispatch_name' | 'box_weight_kg' | 'manufactured_quantity', value: string) => {
    setSavingFooterKey(`${jobCardId}:${footerField}`); setError('')
    try {
      const response = await fetch('/api/job-tracking', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobCardId, footerField, value }),
      })
      const data = await response.json().catch(() => ({})) as { jobs?: TrackedJob[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to save Job Card completion details.')
      setJobs(Array.isArray(data.jobs) ? data.jobs : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save Job Card completion details.') }
    finally { setSavingFooterKey('') }
  }

  return <div className="production-planning-workspace production-planned-workspace job-cards-workspace job-tracking-workspace">
    {error && <p className="production-planning-message is-error job-cards-message" role="alert">{error}<button type="button" onClick={load}><RefreshCw size={13} /> Retry</button></p>}
    <div className="production-planned-toolbar job-cards-toolbar job-tracking-toolbar">
      <div className="production-planned-title"><Activity size={15} /><strong>Production Job Tracking</strong><span>{filtered.length} job cards</span></div>
      <div className="production-planned-controls job-cards-actions">
        <input aria-label="Search Job Tracking" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, plan, SO, customer, product" />
        <select aria-label="Job status filter" value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | JobStatus)}><option value="ALL">All Statuses</option><option value="CREATED">Created</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>
        <button type="button" aria-label="Clear Job Tracking filters" title="Clear filters" onClick={() => { setSearch(''); setStatus('ALL') }}><FilterX size={14} /></button>
        <button type="button" aria-label="Refresh Job Tracking" title="Refresh" disabled={loading} onClick={load}><RefreshCw size={14} /></button>
      </div>
    </div>
    <section className="production-selection-panel production-planned-grid-panel job-cards-list job-tracking-list"><div className="job-cards-table-scroll"><table><colgroup><col className="tracking-col-expand" /><col className="tracking-col-job" /><col className="tracking-col-status" /><col className="tracking-col-date" /><col className="tracking-col-plan" /><col className="tracking-col-order" /><col className="tracking-col-item" /><col className="tracking-col-customer" /><col className="tracking-col-product" /><col className="tracking-col-description" /><col className="tracking-col-qty" /><col className="tracking-col-ply" /><col className="tracking-col-updated" /></colgroup><thead><tr className="job-cards-groups"><th rowSpan={2}></th><th className="group-job" colSpan={2}>Job Card</th><th className="group-schedule" colSpan={2}>Schedule</th><th className="group-order" colSpan={2}>Order &amp; Item</th><th className="group-customer">Customer</th><th className="group-product" colSpan={2}>Product</th><th className="group-production" colSpan={3}>Production Tracking</th></tr><tr><th>Job ID</th><th>Status</th><th>Production Date</th><th>Plan</th><th>Sales Order</th><th>PC Item Code</th><th>Customer</th><th>Product Name</th><th>Product Description</th><th>Box Qty</th><th>Ply</th><th>Updated</th></tr></thead><tbody>
      {filtered.map((job) => <Fragment key={job.job_card_id}><tr className={expanded.includes(job.job_card_id) ? 'is-expanded' : ''}><td><button className="job-tracking-expand" type="button" title={`${expanded.includes(job.job_card_id) ? 'Collapse' : 'Expand'} Job Card`} aria-label={`${expanded.includes(job.job_card_id) ? 'Collapse' : 'Expand'} ${job.job_number}`} aria-expanded={expanded.includes(job.job_card_id)} onClick={() => toggleExpanded(job.job_card_id)}><ChevronRight size={15} strokeWidth={2.4} /></button></td><td><strong>{job.job_number}</strong></td><td><select className={`job-tracking-status is-${job.job_status.toLowerCase()}`} aria-label={`Status for ${job.job_number}`} value={job.job_status} disabled={updatingId === job.job_card_id} onChange={(event) => void updateStatus(job.job_card_id, event.target.value as JobStatus)}><option value="CREATED">Created</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></td><td>{formatIstDate(job.plan_date)}</td><td>{job.plan_number}</td><td><strong>{job.sales_order_number}</strong></td><td>{job.specification_code}</td><td>{job.customer_name}</td><td className="job-cards-product">{job.product_name}</td><td className="job-cards-product">{job.item_description || job.item_name}</td><td className="numeric job-cards-box-qty">{numberText(job.production_quantity)}</td><td className="job-tracking-centered">{job.ply ? `${job.ply} Ply` : ''}</td><td title={formatIstDateTime(job.job_updated_at)}>{formatIstDate(job.job_updated_at)}</td></tr>{expanded.includes(job.job_card_id) && <tr className="job-tracking-detail-row"><td colSpan={13}><div className="job-tracking-expanded-card"><JobCard line={job} processEditable savingProcessKey={savingProcessKey.replace(`${job.job_card_id}:`, '')} savingFooterKey={savingFooterKey.replace(`${job.job_card_id}:`, '')} onProcessValueChange={(processName, field, value) => void updateProcessValue(job.job_card_id, processName, field, value)} onFooterValueChange={(field, value) => void updateFooterValue(job.job_card_id, field, value)} /></div></td></tr>}</Fragment>)}
      {!loading && !filtered.length && <tr><td colSpan={13} className="job-cards-empty">No Job Cards match the selected tracking view.</td></tr>}
      {loading && <tr><td colSpan={13} className="job-cards-empty">Loading Job Tracking...</td></tr>}
    </tbody></table></div><footer><span>{filtered.length} job cards</span><span>{status === 'ALL' ? 'All Statuses' : statusLabel(status)}</span></footer></section>
  </div>
}
