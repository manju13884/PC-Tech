import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { getCustomers, getCustomersError, type Customer } from '../../customerService'
import { getSalesOrderById, getSalesOrdersByCustomer, type SalesOrder, type SalesOrderDetail } from '../../salesOrderService'
import { deriveOverallProductionStatus, getSoProductionStatus, type ProductionActivityStatus, type ProductionJobStatus, type ProcessStatus } from './soProductionStatusService'
import './so-production-status.css'
import './so-production-status-expand.css'
import './so-production-status-process.css'

function labelStatus(status: ProcessStatus): string {
  return status.split('_').map((word) => word[0] + word.slice(1).toLowerCase()).join(' ')
}

function expandButtonStatus(status: ReturnType<typeof deriveOverallProductionStatus>): string {
  if (status === 'Completed') return 'completed'
  if (status === 'In Progress') return 'in_progress'
  return 'created'
}

function ProcessTracker({ job }: { job: ProductionJobStatus }) {
  if (!job.processes.length) return <p className="so-prod-message">No production process information available.</p>
  return <div className="so-prod-process-scroll"><div className="so-prod-process-flow">
    {job.processes.map((process, index) => <div className={`so-prod-process is-${process.status.toLowerCase()}`} key={`${job.id}-${process.name}`} aria-label={`${process.name}: ${labelStatus(process.status)}`}>
      <div className="so-prod-process-rail">
        <span className={`before${index === 0 ? ' is-hidden' : ''}`} />
        <span className="marker" aria-hidden="true">{process.status === 'COMPLETED' ? '✓' : process.status === 'CANCELLED' ? '×' : process.status === 'IN_PROGRESS' ? '●' : '○'}</span>
        <span className={`after${index === job.processes.length - 1 ? ' is-hidden' : ''}`} />
      </div>
      <strong title={process.name}>{process.name}</strong><span>{labelStatus(process.status)}</span>
    </div>)}
  </div></div>
}

export default function SoProductionStatus() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [salesOrderId, setSalesOrderId] = useState('')
  const [detail, setDetail] = useState<SalesOrderDetail | null>(null)
  const [activities, setActivities] = useState<ProductionActivityStatus[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void getCustomers().then((values) => { setCustomers(values); setError(getCustomersError() ?? '') }) }, [])

  useEffect(() => {
    setSalesOrderId(''); setOrders([]); setDetail(null); setActivities([]); setExpanded(new Set()); setError('')
    if (!customerId) return
    let active = true
    setLoadingOrders(true)
    void getSalesOrdersByCustomer(customerId).then((values) => { if (active) setOrders(values) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load Sales Orders.') }).finally(() => { if (active) setLoadingOrders(false) })
    return () => { active = false }
  }, [customerId])

  useEffect(() => {
    setDetail(null); setActivities([]); setExpanded(new Set()); setError('')
    if (!salesOrderId) return
    let active = true
    setLoadingStatus(true)
    void Promise.all([getSalesOrderById(salesOrderId), getSoProductionStatus(salesOrderId)])
      .then(([orderDetail, status]) => { if (active) { setDetail(orderDetail); setActivities(status) } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load production status.') })
      .finally(() => { if (active) setLoadingStatus(false) })
    return () => { active = false }
  }, [salesOrderId])

  const byLine = useMemo(() => {
    const map = new Map<string, ProductionActivityStatus[]>()
    activities.forEach((activity) => map.set(activity.soLineItemId, [...(map.get(activity.soLineItemId) ?? []), activity]))
    return map
  }, [activities])

  const toggle = (lineId: string) => setExpanded((current) => { const next = new Set(current); next.has(lineId) ? next.delete(lineId) : next.add(lineId); return next })

  return <section className="so-prod-page" aria-label="SO Production Status">
    <div className="so-prod-filters">
      <label><span>Customer *</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select Customer</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_name}{customer.gst_number ? ` - ${customer.gst_number}` : ''}</option>)}</select></label>
      <label><span>Sales Order *</span><select value={salesOrderId} disabled={!customerId || loadingOrders} onChange={(event) => setSalesOrderId(event.target.value)}><option value="">{loadingOrders ? 'Loading Sales Orders...' : customerId ? 'Select Sales Order' : 'Select a customer first'}</option>{orders.map((order) => <option key={order.salesorder_id} value={order.salesorder_id}>{order.salesorder_number}</option>)}</select></label>
    </div>
    {error && <p className="so-prod-error" role="alert">{error}</p>}
    {!customerId && <p className="so-prod-empty">Select a customer to continue.</p>}
    {customerId && !salesOrderId && !loadingOrders && <p className="so-prod-empty">Select a Sales Order to view production status.</p>}
    {loadingStatus && <p className="so-prod-empty">Loading Production Status...</p>}
    {detail && !loadingStatus && <section className="so-prod-grid-panel" aria-label="SO Items and Production Status"><header><strong>SO Items / Production Status</strong><span>{detail.salesorder_number}</span></header><div className="so-prod-grid-wrap"><table className="so-prod-grid"><colgroup><col className="expand"/><col className="code"/><col className="description"/><col className="qty"/><col className="planned"/><col className="job"/><col className="status"/></colgroup><thead><tr><th aria-label="Expand"/><th>Item Code</th><th>Item &amp; Description</th><th>Qty</th><th>Planned</th><th>Job Card</th><th>Production Status</th></tr></thead><tbody>
      {detail.line_items.map((item) => { const lineActivities = byLine.get(item.line_item_id) ?? []; const jobs = lineActivities.flatMap((activity) => activity.jobs); const status = deriveOverallProductionStatus(lineActivities); const isExpanded = expanded.has(item.line_item_id); return [
        <tr className={isExpanded ? 'is-expanded' : ''} key={item.line_item_id}><td><button className={`so-prod-expand is-${expandButtonStatus(status)}`} type="button" title={`${isExpanded ? 'Collapse' : 'Expand'} production status`} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`} aria-expanded={isExpanded} onClick={() => toggle(item.line_item_id)}><ChevronRight size={15} strokeWidth={2.4}/></button></td><td>{item.name || item.item_id}</td><td className="so-prod-description" title={[item.name, item.description].filter(Boolean).join(' - ')}>{[item.name, item.description].filter(Boolean).join(' - ') || '—'}</td><td className="numeric">{item.quantity}</td><td><span className={`so-prod-badge ${lineActivities.length ? 'done' : 'not-done'}`}>{lineActivities.length ? 'Done' : 'Not Done'}</span></td><td>{jobs.length ? <div className="so-prod-job-summary">{jobs.map((job) => <span key={job.id}><strong>{job.jobNumber}</strong><small>Created</small></span>)}</div> : <span className="so-prod-badge neutral">Not Created</span>}</td><td><span className={`so-prod-badge status-${status.toLowerCase().replace(/ /g, '-')}`}>{status}</span></td></tr>,
        isExpanded && <tr className="so-prod-detail-row" key={`${item.line_item_id}-detail`}><td colSpan={7}><div className="so-prod-detail">{!lineActivities.length ? <p className="so-prod-message">Production not yet planned.</p> : !jobs.length ? <p className="so-prod-message">Job Card not yet created.</p> : jobs.map((job) => <section key={job.id}><header><strong>Production Process Status</strong></header><ProcessTracker job={job}/></section>)}</div></td></tr>
      ] })}
      {!detail.line_items.length && <tr><td colSpan={7} className="so-prod-empty">No items found in this Sales Order.</td></tr>}
    </tbody></table></div></section>}
  </section>
}
