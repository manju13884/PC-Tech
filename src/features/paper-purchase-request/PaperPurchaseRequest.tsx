import { AlertCircle, BadgeIndianRupee, FileText } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCustomers, getCustomersError, type Customer } from '../../customerService'
import { formatIstDateTime } from '../../utils/dateTimeFormatting'
import {
  getSalesOrderById,
  getSalesOrdersByCustomer,
  type SalesOrder,
  type SalesOrderDetail,
} from '../../salesOrderService'
import PaperCostEstimation from './components/PaperCostEstimation'
import { getPaperItemEligibility } from './config/eligiblePaperItems'
import {
  getPaperRequestBySalesOrder,
  resubmitPaperRequest,
  submitPaperRequest,
  type SavedPaperRequest,
} from './paperPurchaseRequestService'
import type { PaperCostResult } from './types/paperPurchaseRequest'
import SearchableDropdown from './SearchableDropdown'
import './paper-purchase-request.css'

export default function PaperPurchaseRequest() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([])
  const [salesOrderId, setSalesOrderId] = useState('')
  const [salesOrderDetail, setSalesOrderDetail] = useState<SalesOrderDetail | null>(null)
  const [expandedLineItems, setExpandedLineItems] = useState<Record<string, boolean>>({})
  const [lineItemResults, setLineItemResults] = useState<Record<string, PaperCostResult | null>>({})
  const [customersLoading, setCustomersLoading] = useState(true)
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false)
  const [customerError, setCustomerError] = useState('')
  const [salesOrderError, setSalesOrderError] = useState('')
  const [savedRequest, setSavedRequest] = useState<SavedPaperRequest | null>(null)
  const [submissionMessage, setSubmissionMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [existingRequestLoading, setExistingRequestLoading] = useState(false)
  const [invalidLineItemId, setInvalidLineItemId] = useState('')
  const salesOrderRequest = useRef(0)
  const salesOrderDetailRequest = useRef(0)

  useEffect(() => {
    let active = true
    setCustomersLoading(true)
    void getCustomers().then((loadedCustomers) => {
      if (!active) return
      setCustomers(loadedCustomers)
      setCustomerError(getCustomersError() ?? '')
      setCustomersLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const requestId = ++salesOrderRequest.current
    setSalesOrderId('')
    setSalesOrders([])
    setSalesOrderDetail(null)
    setExpandedLineItems({})
    setLineItemResults({})
    setSavedRequest(null)
    setSubmissionMessage('')
    setInvalidLineItemId('')
    setSalesOrderError('')

    if (!customerId) {
      setSalesOrdersLoading(false)
      return
    }

    setSalesOrdersLoading(true)
    void getSalesOrdersByCustomer(customerId)
      .then((loadedSalesOrders) => {
        if (requestId === salesOrderRequest.current) setSalesOrders(loadedSalesOrders)
      })
      .catch((error: unknown) => {
        if (requestId === salesOrderRequest.current) {
          setSalesOrderError(error instanceof Error ? error.message : 'Unable to load sales orders')
        }
      })
      .finally(() => {
        if (requestId === salesOrderRequest.current) setSalesOrdersLoading(false)
      })
  }, [customerId])

  useEffect(() => {
    const requestId = ++salesOrderDetailRequest.current
    setSalesOrderDetail(null)
    setExpandedLineItems({})
    setLineItemResults({})
    setSavedRequest(null)
    setSubmissionMessage('')
    setInvalidLineItemId('')
    setSalesOrderError('')
    if (!salesOrderId) return

    setSalesOrdersLoading(true)
    setExistingRequestLoading(true)
    void getPaperRequestBySalesOrder(salesOrderId)
      .then(async (existingRequest) => {
        if (requestId !== salesOrderDetailRequest.current) return
        if (existingRequest) {
          setSavedRequest(existingRequest)
          setSalesOrderDetail({
            salesorder_id: existingRequest.salesOrderId,
            salesorder_number: existingRequest.salesOrderNumber,
            total: 0,
            line_items: existingRequest.items.map((item) => ({
              line_item_id: item.salesOrderItemId,
              item_id: item.itemId,
              name: item.itemName,
              description: item.itemDescription,
              quantity: item.orderedQuantity,
              unit: '',
              rate: 0,
              amount: 0,
            })),
          })
          setLineItemResults(Object.fromEntries(
            existingRequest.items
              .filter((item) => item.isPaperEligible)
              .map((item) => [item.salesOrderItemId, item.result]),
          ))
          setSubmissionMessage(existingRequest.status === 'REJECTED'
            ? 'This Paper Purchase Request was rejected. Review the rejection reason, correct the required details and resubmit it for approval.'
            : existingRequest.status === 'APPROVED'
              ? 'This Paper Purchase Request has been approved and cannot be edited.'
              : 'This Paper Purchase Request is pending for approval and cannot be edited.')
          return
        }

        const detail = await getSalesOrderById(salesOrderId)
        if (requestId === salesOrderDetailRequest.current) setSalesOrderDetail(detail)
      })
      .catch((error: unknown) => {
        if (requestId === salesOrderDetailRequest.current) {
          setSalesOrderError(error instanceof Error ? error.message : 'Unable to load Sales Order details')
        }
      })
      .finally(() => {
        if (requestId === salesOrderDetailRequest.current) {
          setSalesOrdersLoading(false)
          setExistingRequestLoading(false)
        }
      })
  }, [salesOrderId])

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ id: customer.customer_id, label: customer.customer_name })),
    [customers],
  )
  const salesOrderOptions = useMemo(
    () => salesOrders.map((salesOrder) => ({
      id: salesOrder.salesorder_id,
      label: salesOrder.salesorder_number,
    })),
    [salesOrders],
  )
  const toggleCalculator = (lineItemId: string) => {
    setExpandedLineItems((current) => ({ ...current, [lineItemId]: !current[lineItemId] }))
  }
  const handleResultChange = useCallback((lineItemId: string, result: PaperCostResult | null) => {
    setLineItemResults((current) => ({ ...current, [lineItemId]: result }))
    if (result) setInvalidLineItemId((current) => current === lineItemId ? '' : current)
  }, [])
  const formatSummaryNumber = (value: number, digits = 3) => value.toLocaleString('en-IN', {
    maximumFractionDigits: digits,
  })
  const paperRequirementSummary = useMemo(() => {
    const results = Object.values(lineItemResults).filter(
      (result): result is PaperCostResult => result !== null,
    )
    if (results.length === 0) return null

    return results.reduce((summary, result) => ({
      calculationQuantity: summary.calculationQuantity + result.calculationQuantity,
      totalBaseWeightKg: summary.totalBaseWeightKg + result.totalBaseWeightKg,
      totalWastageWeightKg: summary.totalWastageWeightKg + result.totalWastageWeightKg,
      totalPaperRequirementKg: summary.totalPaperRequirementKg + result.totalPaperRequirementKg,
      totalPaperCost: summary.totalPaperCost + result.totalPaperCost,
    }), {
      calculationQuantity: 0,
      totalBaseWeightKg: 0,
      totalWastageWeightKg: 0,
      totalPaperRequirementKg: 0,
      totalPaperCost: 0,
    })
  }, [lineItemResults])
  const eligibleItems = useMemo(
    () => salesOrderDetail?.line_items.filter((item) => getPaperItemEligibility(item.item_id).eligible) ?? [],
    [salesOrderDetail],
  )
  const completedEligibleItems = useMemo(
    () => eligibleItems.filter((item) => {
      const result = lineItemResults[item.line_item_id]
      return Boolean(result
        && Number.isFinite(result.totalPaperRequirementKg)
        && result.totalPaperRequirementKg > 0
        && result.layers.length > 0
        && result.layers.every((layer) => (
          Boolean(layer.paperType.trim())
          && Number.isFinite(layer.gsm) && layer.gsm > 0
          && Number.isFinite(layer.bf) && layer.bf > 0
          && Number.isFinite(layer.drawRatio) && layer.drawRatio > 0
          && Number.isFinite(layer.totalRequirementKg) && layer.totalRequirementKg > 0
        )))
    }),
    [eligibleItems, lineItemResults],
  )
  const firstIncompleteItem = eligibleItems.find((item) => !completedEligibleItems.includes(item))
  const submissionReady = Boolean(
    customerId
    && salesOrderId
    && salesOrderDetail
    && eligibleItems.length > 0
    && completedEligibleItems.length === eligibleItems.length
    && !salesOrdersLoading
    && !existingRequestLoading
    && !submitting
    && (!savedRequest || savedRequest.status === 'REJECTED'),
  )
  const customerName = customers.find((customer) => customer.customer_id === customerId)?.customer_name
    ?? savedRequest?.customerName
    ?? '—'

  const handleSubmitPaperRequest = async () => {
    if (
      !salesOrderDetail
      || !customerId
      || !salesOrderId
      || submitting
      || (savedRequest && savedRequest.status !== 'REJECTED')
    ) return
    const firstIncomplete = firstIncompleteItem
    if (firstIncomplete) {
      setInvalidLineItemId(firstIncomplete.line_item_id)
      setExpandedLineItems((current) => ({ ...current, [firstIncomplete.line_item_id]: true }))
      setSubmissionMessage(`Complete the paper requirement for Sale Order item "${firstIncomplete.name}" before submitting the request.`)
      requestAnimationFrame(() => {
        document.getElementById(`paper-item-${firstIncomplete.line_item_id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
      return
    }

    setSubmitting(true)
    setSubmissionMessage('')
    setInvalidLineItemId('')
    try {
      const payload = {
        customerId,
        salesOrderId,
        items: salesOrderDetail.line_items.map((item) => ({
          salesOrderItemId: item.line_item_id,
          itemId: item.item_id,
          result: lineItemResults[item.line_item_id] ?? null,
        })),
      }
      if (savedRequest?.status === 'REJECTED') {
        await resubmitPaperRequest(savedRequest.id, payload)
        setSavedRequest({
          ...savedRequest,
          status: 'PENDING_APPROVAL',
          rejectionReason: null,
          rejectedByName: null,
          rejectedAt: null,
          resubmissionCount: (savedRequest.resubmissionCount ?? 0) + 1,
        })
        setSubmissionMessage(`Paper Request ${savedRequest.requestNumber} resubmitted successfully. Status: Pending for Approval.`)
      } else {
        const request = await submitPaperRequest(payload)
        setSavedRequest(request)
        setSubmissionMessage(`Paper Request ${request.requestNumber} submitted successfully. Status: Pending for Approval.`)
      }
    } catch (error) {
      const submissionError = error as Error & { request?: SavedPaperRequest }
      if (submissionError.request) setSavedRequest(submissionError.request)
      setSubmissionMessage(submissionError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pc-paper-purchase-request">
      <section className="paper-request-section">
        <header>
          <h3><FileText size={16} /> Purchase Information</h3>
          <p>Select a customer to load their available Zoho Books Sales Orders.</p>
        </header>
        <div className="paper-request-fields">
          <div>
            <SearchableDropdown
              label="Select Customer"
              placeholder="Search customers"
              options={customerOptions}
              value={customerId}
              disabled={Boolean(savedRequest)}
              loading={customersLoading}
              emptyMessage="No customers found."
              onChange={setCustomerId}
            />
            {customerError && <p className="paper-request-error" role="alert"><AlertCircle size={15} />{customerError}</p>}
          </div>
          <div>
            <SearchableDropdown
              label="Select Sales Order Number"
              placeholder={customerId ? 'Search Sales Orders' : 'Select a customer first'}
              options={salesOrderOptions}
              value={salesOrderId}
              disabled={!customerId || Boolean(savedRequest)}
              loading={salesOrdersLoading}
              emptyMessage="No Sales Orders are available for this customer."
              onChange={setSalesOrderId}
            />
            {salesOrderError && <p className="paper-request-error" role="alert"><AlertCircle size={15} />{salesOrderError}</p>}
            {!salesOrdersLoading && customerId && !salesOrderError && salesOrders.length === 0 && (
              <p className="paper-request-empty">No Sales Orders are available for this customer.</p>
            )}
          </div>
          <div className="paper-sales-order-amount-field">
            <div className={`paper-sales-order-amount${salesOrderDetail ? '' : ' is-empty'}`} aria-live="polite">
              <span>
                <BadgeIndianRupee size={20} aria-hidden="true" />
                <span>Total Sales Order Amount</span>
              </span>
              <strong>
                {salesOrderDetail ? `₹${salesOrderDetail.total.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}` : '—'}
              </strong>
            </div>
          </div>
        </div>

        {salesOrderDetail && (
          <section className="paper-requirement-summary" aria-live="polite">
            <div className="paper-requirement-summary-header">
              <h4>Paper Requirement Summary for the Given Calculation Quantity</h4>
              <button
                type="button"
                className="paper-request-submit-button"
                disabled={!submissionReady}
                onClick={handleSubmitPaperRequest}
              >
                {submitting
                  ? savedRequest?.status === 'REJECTED' ? 'Resubmitting...' : 'Submitting...'
                  : savedRequest?.status === 'REJECTED'
                    ? 'Resubmit Paper Request'
                    : savedRequest
                      ? 'Submitted'
                      : 'Submit Paper Request'}
              </button>
            </div>
            <dl className="paper-request-overview">
              <div><dt>Customer Name</dt><dd>{customerName}</dd></div>
              <div><dt>Sale Order Number</dt><dd>{salesOrderDetail.salesorder_number}</dd></div>
              <div><dt>Sale Order Items</dt><dd>{salesOrderDetail.line_items.length}</dd></div>
              <div><dt>Eligible Items</dt><dd>{eligibleItems.length}</dd></div>
              <div><dt>Completed</dt><dd>{completedEligibleItems.length} / {eligibleItems.length}</dd></div>
              <div><dt>Request Status</dt><dd>{savedRequest ? savedRequest.status.replace(/_/g, ' ') : 'Not Submitted'}</dd></div>
            </dl>
            {paperRequirementSummary && <dl>
              <div><dt>Calculation Quantity</dt><dd>{formatSummaryNumber(paperRequirementSummary.calculationQuantity, 0)} pcs</dd></div>
              <div><dt>Total Base Weight</dt><dd>{formatSummaryNumber(paperRequirementSummary.totalBaseWeightKg)} kg</dd></div>
              <div><dt>Total Wastage Weight</dt><dd>{formatSummaryNumber(paperRequirementSummary.totalWastageWeightKg)} kg</dd></div>
              <div><dt>Total Paper Required</dt><dd>{formatSummaryNumber(paperRequirementSummary.totalPaperRequirementKg)} kg</dd></div>
              <div><dt>Total Paper Cost</dt><dd>₹{formatSummaryNumber(paperRequirementSummary.totalPaperCost, 2)}</dd></div>
            </dl>}
            {savedRequest && (
              <p className="paper-request-number">
                Paper Request <strong>{savedRequest.requestNumber}</strong> · Status: <strong>{savedRequest.status === 'PENDING_APPROVAL' ? 'Pending for Approval' : savedRequest.status}</strong>
              </p>
            )}
            {savedRequest?.status === 'REJECTED' && (
              <div className="paper-rejection-summary" role="alert">
                <strong>Rejected: {savedRequest.rejectionReason || 'No reason was recorded.'}</strong>
                <span>Rejected by {savedRequest.rejectedByName || 'Unknown'} on {formatIstDateTime(savedRequest.rejectedAt)}</span>
                <button type="button" onClick={() => setSalesOrderId('')}>Back to Sale Order Selection</button>
              </div>
            )}
            {submissionMessage && (
              <p className={`paper-submission-message${savedRequest ? ' is-success' : ''}`} role="status">
                {submissionMessage}
              </p>
            )}
            {(!savedRequest || savedRequest.status === 'REJECTED') && firstIncompleteItem && !submissionMessage && (
              <p className="paper-submission-message" role="status">
                Complete the paper requirement for Sale Order item &quot;{firstIncompleteItem.name}&quot; before submitting the request.
              </p>
            )}
          </section>
        )}

        {salesOrderDetail && (
          <div className="paper-order-items">
            <div className="paper-order-items-heading">
              <div>
                <h4>Sales Order Items</h4>
                <p>Expand the paper requirement calculator and enter composition.</p>
              </div>
              <span>{salesOrderDetail.line_items.length} item{salesOrderDetail.line_items.length === 1 ? '' : 's'}.</span>
            </div>
            <div className="paper-order-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Item &amp; Description</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Type</th>
                    <th scope="col">Rate</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrderDetail.line_items.map((item, index) => {
                    const eligibility = getPaperItemEligibility(item.item_id)
                    const configuration = eligibility.configuration
                    const isExpanded = Boolean(expandedLineItems[item.line_item_id])
                    const result = lineItemResults[item.line_item_id]
                    return (
                      <Fragment key={item.line_item_id}>
                        <tr
                          id={`paper-item-${item.line_item_id}`}
                          className={`paper-item-row${isExpanded ? ' is-selected' : ''}${(invalidLineItemId || firstIncompleteItem?.line_item_id) === item.line_item_id ? ' is-incomplete' : ''}`}
                        >
                          <td>{index + 1}</td>
                          <td>
                            {item.name && <strong>{item.name}</strong>}
                            {item.description && <span>{item.description}</span>}
                          </td>
                          <td>{item.quantity}</td>
                          <td>{item.unit || '—'}</td>
                          <td>{configuration?.productType ?? '—'}</td>
                          <td>₹{item.rate.toLocaleString('en-IN')}</td>
                          <td>₹{item.amount.toLocaleString('en-IN')}</td>
                        </tr>
                        <tr className={`paper-item-tools-row ${isExpanded ? 'is-expanded' : ''}`}>
                              <td colSpan={7}>
                                <div className="paper-item-calculator-bar">
                                  <button
                                    type="button"
                                    className="paper-calculator-toggle"
                                    aria-expanded={configuration ? isExpanded : undefined}
                                    disabled={!configuration}
                                    title={configuration ? undefined : eligibility.message}
                                    onClick={() => configuration && toggleCalculator(item.line_item_id)}
                                  >
                                    <span>Paper Requirement Calculator</span>
                                    <span>{configuration ? (isExpanded ? 'Hide' : 'Show') : 'Unavailable'}</span>
                                  </button>
                                  {result && (
                                    <dl className="paper-inline-summary">
                                      <div><dt>Total Base Weight</dt><dd>{formatSummaryNumber(result.totalBaseWeightKg)} kg</dd></div>
                                      <div><dt>Total Wastage Weight</dt><dd>{formatSummaryNumber(result.totalWastageWeightKg)} kg</dd></div>
                                      <div><dt>Total Paper Required</dt><dd>{formatSummaryNumber(result.totalPaperRequirementKg)} kg</dd></div>
                                      <div><dt>Paper Cost per Unit</dt><dd>₹{formatSummaryNumber(result.paperCostPerUnit, 2)}/pcs</dd></div>
                                      <div><dt>Total Paper Cost</dt><dd>₹{formatSummaryNumber(result.totalPaperCost, 2)}</dd></div>
                                    </dl>
                                  )}
                                </div>
                              </td>
                        </tr>
                        {configuration && (
                          <>
                            <tr className="paper-calculator-row" hidden={!isExpanded}>
                              <td colSpan={7}>
                                <PaperCostEstimation
                                  item={item}
                                  configuration={configuration}
                                  onResultChange={handleResultChange}
                                  readOnly={Boolean(savedRequest && savedRequest.status !== 'REJECTED')}
                                  savedResult={savedRequest ? result ?? null : null}
                                />
                              </td>
                            </tr>
                          </>
                        )}
                      </Fragment>
                    )
                  })}
                  {salesOrderDetail.line_items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="paper-order-table-empty">No items found in this Sales Order.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
