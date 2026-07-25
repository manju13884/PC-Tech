import { Calculator, Eye, FilterX, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SavedPaperRequest } from '../paper-purchase-request/paperPurchaseRequestService'
import {
  calculateConsolidatedPaperRequirement,
  getApprovedPaperRequestDetails,
  getApprovedPaperRequests,
  type ApprovedPaperRequest,
  type ConsolidatedPaperRow,
  type ConsolidationResult,
} from './paperPoCalculationService'
import './paper-po-calculation.css'

const displayDate = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString('en-IN')
  : '—'
const displayNumber = (value: number | null | undefined, digits = 3) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-IN', { maximumFractionDigits: digits })
    : '—'
)

export default function PaperPoCalculation() {
  const [requests, setRequests] = useState<ApprovedPaperRequest[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ConsolidationResult | null>(null)
  const [details, setDetails] = useState<SavedPaperRequest | null>(null)
  const [sourceRow, setSourceRow] = useState<ConsolidatedPaperRow | null>(null)
  const [requestFilter, setRequestFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [salesOrderFilter, setSalesOrderFilter] = useState('')
  const [approvedDateFilter, setApprovedDateFilter] = useState('')
  const [sortBy, setSortBy] = useState<'approvedAt' | 'requestDate' | 'customer' | 'salesOrder'>('approvedAt')
  const selectAllRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setRequests(await getApprovedPaperRequests())
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load approved Paper Purchase Requests.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const normalizedRequest = requestFilter.trim().toLowerCase()
    const normalizedCustomer = customerFilter.trim().toLowerCase()
    const normalizedSalesOrder = salesOrderFilter.trim().toLowerCase()
    return requests
      .filter((request) => (
        (!normalizedRequest || request.requestNumber.toLowerCase().includes(normalizedRequest))
        && (!normalizedCustomer || request.customerName.toLowerCase().includes(normalizedCustomer))
        && (!normalizedSalesOrder || request.salesOrderNumber.toLowerCase().includes(normalizedSalesOrder))
        && (!approvedDateFilter || request.approvedAt?.slice(0, 10) === approvedDateFilter)
      ))
      .sort((left, right) => {
        if (sortBy === 'customer') return left.customerName.localeCompare(right.customerName)
        if (sortBy === 'salesOrder') return left.salesOrderNumber.localeCompare(right.salesOrderNumber)
        return Date.parse(sortBy === 'requestDate' ? left.requestDate : left.approvedAt ?? '')
          - Date.parse(sortBy === 'requestDate' ? right.requestDate : right.approvedAt ?? '')
      })
  }, [approvedDateFilter, customerFilter, requestFilter, requests, salesOrderFilter, sortBy])

  const displayedSelectedCount = filtered.filter((request) => selectedIds.has(request.id)).length
  const allDisplayedSelected = filtered.length > 0 && displayedSelectedCount === filtered.length
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = displayedSelectedCount > 0 && !allDisplayedSelected
    }
  }, [allDisplayedSelected, displayedSelectedCount])

  const selectedRequests = requests.filter((request) => selectedIds.has(request.id))
  const toggleRequest = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setResult(null)
  }
  const toggleDisplayed = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allDisplayedSelected) filtered.forEach((request) => next.delete(request.id))
      else filtered.forEach((request) => next.add(request.id))
      return next
    })
    setResult(null)
  }
  const clearFilters = () => {
    setRequestFilter('')
    setCustomerFilter('')
    setSalesOrderFilter('')
    setApprovedDateFilter('')
  }
  const calculate = async () => {
    if (selectedIds.size === 0 || calculating) return
    setCalculating(true)
    setError('')
    try {
      setResult(await calculateConsolidatedPaperRequirement([...selectedIds]))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to calculate the consolidated paper requirement.')
      await load()
    } finally {
      setCalculating(false)
    }
  }
  const viewDetails = async (id: number) => {
    setError('')
    try {
      setDetails(await getApprovedPaperRequestDetails(id))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load request details')
    }
  }

  return (
    <div className="pc-paper-po-calculation">
      {error && <div className="paper-po-notice is-error" role="alert"><span>{error}</span><button type="button" onClick={load}><RefreshCw size={13} /> Retry</button></div>}

      <section className="paper-po-card">
        <header><div><h3><Calculator size={16} /> Approved Paper Purchase Requests</h3><p>Select approved requests for consolidated paper calculation.</p></div><button type="button" onClick={load} disabled={loading}><RefreshCw size={13} /> Refresh</button></header>
        <div className="paper-po-filters">
          <label><span>Request Number</span><input value={requestFilter} onChange={(event) => setRequestFilter(event.target.value)} placeholder="Search request" /></label>
          <label><span>Customer</span><input value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} placeholder="Search customer" /></label>
          <label><span>Sale Order Number</span><input value={salesOrderFilter} onChange={(event) => setSalesOrderFilter(event.target.value)} placeholder="Search Sale Order" /></label>
          <label><span>Approved Date</span><input type="date" value={approvedDateFilter} onChange={(event) => setApprovedDateFilter(event.target.value)} /></label>
          <label><span>Sort By</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="approvedAt">Approved Date</option><option value="requestDate">Request Date</option><option value="customer">Customer</option><option value="salesOrder">Sale Order</option></select></label>
          <button type="button" onClick={clearFilters}><FilterX size={13} /> Clear</button>
        </div>

        <dl className="paper-po-selection-summary">
          <div><dt>Selected Paper Requests</dt><dd>{selectedIds.size}</dd></div>
          <div><dt>Selected Sale Orders</dt><dd>{new Set(selectedRequests.map((request) => request.salesOrderId)).size}</dd></div>
          <div><dt>Selected Customers</dt><dd>{new Set(selectedRequests.map((request) => request.customerId)).size}</dd></div>
          <div><dt>Selected Eligible Items</dt><dd>{selectedRequests.reduce((total, request) => total + request.eligibleItemCount, 0)}</dd></div>
        </dl>

        {loading ? <p className="paper-po-empty">Loading approved Paper Purchase Requests...</p>
          : filtered.length === 0 ? <p className="paper-po-empty">No approved Paper Purchase Requests are available for Paper PO calculation.</p>
            : <div className="paper-po-table-wrap"><table><thead><tr>
              <th><input ref={selectAllRef} type="checkbox" checked={allDisplayedSelected} onChange={toggleDisplayed} aria-label="Select all displayed requests" /></th>
              <th>Request Number</th><th>Request Date</th><th>Customer</th><th>Sale Order</th>
              <th>Approved Date</th><th>Approved By</th><th>Eligible Items</th>
              <th>Paper Requirement</th><th>Status</th><th>Action</th>
            </tr></thead><tbody>{filtered.map((request) => <tr key={request.id} className={selectedIds.has(request.id) ? 'is-selected' : ''}>
              <td><input type="checkbox" checked={selectedIds.has(request.id)} onChange={() => toggleRequest(request.id)} aria-label={`Select ${request.requestNumber}`} /></td>
              <td><strong>{request.requestNumber}</strong></td><td>{displayDate(request.requestDate)}</td>
              <td>{request.customerName}</td><td>{request.salesOrderNumber}</td><td>{displayDate(request.approvedAt)}</td>
              <td>{request.approvedByName || '—'}</td><td>{request.eligibleItemCount}</td>
              <td>{displayNumber(request.paperRequirementKg)} kg</td><td><span className="paper-po-status">Approved</span></td>
              <td><button type="button" onClick={() => viewDetails(request.id)}><Eye size={13} /> View</button></td>
            </tr>)}</tbody></table></div>}
        <div className="paper-po-action"><button type="button" disabled={selectedIds.size === 0 || loading || calculating} onClick={calculate}>{calculating ? 'Calculating...' : result ? 'Recalculate Consolidated Paper Requirement' : 'Calculate Consolidated Paper Requirement'}</button></div>
      </section>

      {result && <section className="paper-po-card paper-po-results">
        <header><div><h3>Consolidated Paper Requirement</h3><p>Approved final quantities are summed without applying wastage again.</p></div></header>
        <dl className="paper-po-selection-summary">
          <div><dt>Source Paper Rows</dt><dd>{result.sourcePaperRowCount}</dd></div><div><dt>Consolidated Groups</dt><dd>{result.consolidatedGroupCount}</dd></div>
          <div><dt>Rows Requiring Review</dt><dd>{result.rowsRequiringReview}</dd></div>
          {Object.entries(result.totalsByUnit).map(([unit, total]) => <div key={unit}><dt>Total {unit}</dt><dd>{displayNumber(total)} {unit}</dd></div>)}
        </dl>
        <div className="paper-po-table-wrap"><table><thead><tr><th>#</th><th>Paper Type</th><th>GSM</th><th>BF</th><th>Deckle</th><th>Cut Length</th><th>Source Layers</th><th>Consolidated Quantity</th><th>Action</th></tr></thead>
          <tbody>{result.consolidatedRows.map((row, index) => <tr key={row.groupKey}><td>{index + 1}</td><td>{row.paperType}</td><td>{displayNumber(row.gsm)}</td><td>{displayNumber(row.bf)}</td><td>{displayNumber(row.deckleCm)} cm</td><td>{displayNumber(row.cutLengthCm)} cm</td><td>{row.sourceLayers.join(', ')}</td><td><strong>{displayNumber(row.consolidatedQuantity)} {row.unit}</strong></td><td><button type="button" onClick={() => setSourceRow(row)}><Eye size={13} /> Sources</button></td></tr>)}</tbody>
        </table></div>
        {result.incompleteSpecificationRows.length > 0 && <div className="paper-po-review"><h4>Items Requiring Review</h4><table><thead><tr><th>Request</th><th>Sale Order</th><th>Customer</th><th>Item</th><th>Layer</th><th>GSM</th><th>BF</th><th>Deckle</th><th>Quantity</th><th>Missing Specifications</th></tr></thead><tbody>{result.incompleteSpecificationRows.map((row, index) => <tr key={`${row.source.paperRequestId}-${row.source.layerKey}-${index}`}><td>{row.source.requestNumber}</td><td>{row.source.salesOrderNumber}</td><td>{row.source.customerName}</td><td>{row.source.itemName}</td><td>{row.source.layerName}</td><td>{displayNumber(row.source.gsm)}</td><td>{displayNumber(row.source.bf)}</td><td>{displayNumber(row.source.deckleCm)}</td><td>{displayNumber(row.source.quantity)} KG</td><td>{row.missingSpecifications.join(', ')}</td></tr>)}</tbody></table></div>}
      </section>}

      {(details || sourceRow) && <div className="paper-po-backdrop" role="presentation"><section className="paper-po-dialog" role="dialog" aria-modal="true"><header><div><h3>{details ? details.requestNumber : `Sources: ${sourceRow?.paperType}`}</h3><p>{details ? 'Read-only approved database snapshot' : `${sourceRow?.gsm} GSM / ${sourceRow?.bf} BF`}</p></div><button type="button" onClick={() => { setDetails(null); setSourceRow(null) }} aria-label="Close"><X /></button></header><div className="paper-po-dialog-body">
        {details && details.items.filter((item) => item.isPaperEligible).map((item) => <section key={item.salesOrderItemId} className="paper-po-detail-item"><h4>{item.itemName}</h4>{item.result?.layers.map((layer) => <div key={layer.key}><span>{layer.label} · {layer.paperType} · {layer.gsm} GSM · {layer.bf} BF</span><strong>{displayNumber(layer.totalRequirementKg)} KG</strong></div>)}</section>)}
        {sourceRow?.sources.map((source, index) => <div className="paper-po-source" key={`${source.paperRequestId}-${source.layerKey}-${index}`}><strong>{source.requestNumber} · {source.salesOrderNumber}</strong><span>{source.customerName} · {source.itemName} · {source.layerName}</span><span>{source.gsm} GSM · {source.bf} BF · {displayNumber(source.deckleCm)} cm</span><b>{displayNumber(source.quantity)} {source.unit}</b></div>)}
      </div></section></div>}
    </div>
  )
}
