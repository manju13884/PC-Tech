import { Check, Eye, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SavedPaperRequest } from '../paper-purchase-request/paperPurchaseRequestService'
import {
  approvePaperRequest,
  getPaperRequestDetails,
  getPendingPaperRequests,
  rejectPaperRequest,
  type PendingPaperRequest,
} from './paperRequestApprovalService'
import './paper-purchase-request-approvals.css'

const dateTime = (value: string | null | undefined) => (
  value ? new Date(value).toLocaleString('en-IN') : '—'
)
const number = (value: number | null | undefined, digits = 3) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { maximumFractionDigits: digits })
    : '—'
)

export default function PaperPurchaseRequestApprovals() {
  const [requests, setRequests] = useState<PendingPaperRequest[]>([])
  const [selected, setSelected] = useState<SavedPaperRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [action, setAction] = useState<'approve' | 'reject' | ''>('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const previousRejection = selected?.history
    ?.filter((entry) => entry.actionType === 'REJECTED')
    .slice(-1)[0]

  const loadPending = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRequests(await getPendingPaperRequests())
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load pending Paper Purchase Requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadPending() }, [loadPending])

  const viewDetails = async (requestId: number) => {
    setDetailsLoading(true)
    setError('')
    try {
      setSelected(await getPaperRequestDetails(requestId))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load request details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const approve = async () => {
    if (!selected || action || !window.confirm(`Approve Paper Purchase Request ${selected.requestNumber}?`)) return
    setAction('approve')
    setError('')
    try {
      await approvePaperRequest(selected.id)
      setMessage(`Paper Purchase Request ${selected.requestNumber} has been approved successfully.`)
      setSelected(null)
      await loadPending()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to approve the request')
      await loadPending()
    } finally {
      setAction('')
    }
  }

  const reject = async () => {
    if (!selected || action) return
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 5) {
      setReasonError('Enter a reason of at least 5 characters before rejecting the Paper Purchase Request.')
      return
    }
    setAction('reject')
    setReasonError('')
    setError('')
    try {
      await rejectPaperRequest(selected.id, trimmedReason)
      setMessage(`Paper Purchase Request ${selected.requestNumber} has been rejected and returned for correction.`)
      setRejectOpen(false)
      setReason('')
      setSelected(null)
      await loadPending()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to reject the request')
      await loadPending()
    } finally {
      setAction('')
    }
  }

  return (
    <div className="pc-paper-purchase-request-approvals paper-approvals">
      {message && <p className="paper-approval-notice is-success" role="status">{message}</p>}
      {error && (
        <div className="paper-approval-notice is-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadPending}><RefreshCw size={14} /> Retry</button>
        </div>
      )}

      <section className="paper-approval-list">
        <header>
          <div>
            <h3><ShieldCheck size={16} /> Pending Paper Purchase Requests</h3>
            <p>Newest submitted requests are shown first.</p>
          </div>
          <button type="button" onClick={loadPending} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </header>
        {!loading && requests.length > 0 && (
          <dl className="paper-approval-summary">
            <div><dt>Pending Requests</dt><dd>{requests.length}</dd></div>
            <div><dt>Total Sale Order Items</dt><dd>{requests.reduce((total, request) => total + request.totalItems, 0)}</dd></div>
            <div><dt>Eligible Paper Items</dt><dd>{requests.reduce((total, request) => total + request.eligibleItems, 0)}</dd></div>
            <div><dt>Review Order</dt><dd>Newest First</dd></div>
          </dl>
        )}
        {loading ? (
          <p className="paper-approval-empty">Loading pending Paper Purchase Requests...</p>
        ) : requests.length === 0 ? (
          <p className="paper-approval-empty">No Paper Purchase Requests are pending for approval.</p>
        ) : (
          <div className="paper-approval-table-wrap">
            <table>
              <thead><tr>
                <th>Request Number</th><th>Request Date</th><th>Customer</th>
                <th>Sale Order Number</th><th>Total Items</th><th>Eligible Items</th>
                <th>Requested By</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.requestNumber}</strong></td>
                    <td>{dateTime(request.requestedAt)}</td>
                    <td>{request.customerName}</td>
                    <td>{request.salesOrderNumber}</td>
                    <td>{request.totalItems}</td>
                    <td>{request.eligibleItems}</td>
                    <td>{request.requestedByName || '—'}</td>
                    <td><span className="paper-approval-status">Pending</span></td>
                    <td><button type="button" onClick={() => viewDetails(request.id)} disabled={detailsLoading}><Eye size={14} /> View Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="paper-approval-backdrop" role="presentation">
          <section className="paper-approval-details" role="dialog" aria-modal="true" aria-labelledby="paper-approval-title">
            <header>
              <div><h3 id="paper-approval-title">{selected.requestNumber}</h3><p>Complete submitted database snapshot</p></div>
              <button type="button" className="is-icon" onClick={() => setSelected(null)} aria-label="Close details"><X /></button>
            </header>
            <div className="paper-approval-details-body">
              <dl className="paper-approval-header-grid">
                <div><dt>Status</dt><dd>{selected.status.replace(/_/g, ' ')}</dd></div>
                <div><dt>Customer</dt><dd>{selected.customerName}</dd></div>
                <div><dt>Customer ID</dt><dd>{selected.customerId}</dd></div>
                <div><dt>Sale Order</dt><dd>{selected.salesOrderNumber}</dd></div>
                <div><dt>Sale Order ID</dt><dd>{selected.salesOrderId}</dd></div>
                <div><dt>Requested Date</dt><dd>{dateTime(selected.requestedAt)}</dd></div>
                <div><dt>Resubmissions</dt><dd>{selected.resubmissionCount ?? 0}</dd></div>
                <div><dt>Previous Rejection</dt><dd>{previousRejection?.actionReason || '—'}</dd></div>
              </dl>

              {selected.items.map((item) => (
                <section className="paper-approval-item" key={item.salesOrderItemId}>
                  <header><div><strong>{item.itemName}</strong><span>{item.itemDescription || 'No description'}</span></div><span>{item.isPaperEligible ? 'Paper Eligible' : 'Reference Only'}</span></header>
                  <dl>
                    <div><dt>Ordered Quantity</dt><dd>{number(item.orderedQuantity)}</dd></div>
                    <div><dt>Item Type</dt><dd>{item.itemType}</dd></div>
                    <div><dt>Length</dt><dd>{number(item.result?.lengthMm)} mm</dd></div>
                    <div><dt>Breadth</dt><dd>{number(item.result?.breadthMm)} mm</dd></div>
                    <div><dt>Height</dt><dd>{number(item.result?.heightMm)} mm</dd></div>
                    <div><dt>Ply</dt><dd>{number(item.result?.boxPly, 0)}</dd></div>
                  </dl>
                  {item.result && (
                    <div className="paper-approval-layers">
                      <table>
                        <thead><tr>
                          <th>Layer</th><th>Paper Type</th><th>GSM</th><th>BF</th>
                          <th>Deckle</th><th>Cut Length</th><th>Sheet Qty</th>
                          <th>Paper Weight</th><th>Wastage</th><th>Total Weight</th>
                          <th>Rate</th><th>Total Cost</th>
                        </tr></thead>
                        <tbody>{item.result.layers.map((layer) => (
                          <tr key={layer.key}>
                            <td>{layer.label}</td><td>{layer.paperType}</td><td>{number(layer.gsm)}</td>
                            <td>{number(layer.bf)}</td><td>{number(item.result?.deckleCm)} cm</td>
                            <td>{number(item.result?.sizeCm)} cm</td><td>{number(item.result?.calculationQuantity, 0)}</td>
                            <td>{number(layer.baseWeightKg)} kg</td><td>{number(layer.wastageWeightKg)} kg</td>
                            <td>{number(layer.totalRequirementKg)} kg</td><td>₹{number(layer.paperPricePerKg, 2)}</td>
                            <td>₹{number(layer.totalPaperCost, 2)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}

              {Boolean(selected.history?.length) && (
                <section className="paper-approval-history">
                  <h4>Approval History</h4>
                  <table><thead><tr><th>Date</th><th>Action</th><th>From</th><th>To</th><th>Action By</th><th>Reason</th></tr></thead>
                    <tbody>{selected.history?.map((entry, index) => (
                      <tr key={`${entry.actionAt}-${index}`}>
                        <td>{dateTime(entry.actionAt)}</td><td>{entry.actionType}</td>
                        <td>{entry.previousStatus || '—'}</td><td>{entry.newStatus}</td>
                        <td>{entry.actionByName || '—'}</td><td>{entry.actionReason || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </section>
              )}
            </div>
            <footer>
              <button type="button" className="is-reject" onClick={() => setRejectOpen(true)} disabled={Boolean(action)}><X size={15} />{action === 'reject' ? 'Rejecting...' : 'Reject'}</button>
              <button type="button" className="is-approve" onClick={approve} disabled={Boolean(action)}><Check size={15} />{action === 'approve' ? 'Approving...' : 'Approve'}</button>
            </footer>
          </section>
        </div>
      )}

      {selected && rejectOpen && (
        <div className="paper-rejection-backdrop" role="presentation">
          <section className="paper-rejection-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title">
            <h3 id="reject-title">Reject {selected.requestNumber}</h3>
            <label><span>Reason for Rejection</span><textarea rows={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            {reasonError && <p role="alert">{reasonError}</p>}
            <footer>
              <button type="button" onClick={() => { setRejectOpen(false); setReasonError('') }} disabled={Boolean(action)}>Cancel</button>
              <button type="button" className="is-reject" onClick={reject} disabled={Boolean(action)}>{action === 'reject' ? 'Rejecting...' : 'Reject Request'}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
