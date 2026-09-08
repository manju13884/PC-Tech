import {
  AlertCircle,
  ArrowLeft,
  Check,
  Factory,
  Save,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getCustomers,
  getCustomersError,
  type Customer,
} from '../../customerService'
import {
  getSalesOrdersByCustomer,
  type SalesOrder,
} from '../../salesOrderService'
import { calculateTwoPlyQuantity } from './productionPlanningCalculations'
import '../product-specifications/product-specifications.css'
import './production-planning.css'

interface SelectedOrder extends SalesOrder {
  customerId: string
  customerName: string
}
interface PlanLine {
  customerId: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  deliveryDate: string
  lineItemId: string
  itemName: string
  itemDescription: string
  orderedQuantity: number
  invoicedQuantity: number
  remainingQuantity: number
  previouslyPlannedQuantity: number
  balanceQuantity: number
  productionQuantity: number
  twoPlyQuantity: number | null
  deckleSize: string
  productionDate: string
  uom: string
  specificationCode: string
  productType: string
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  ply: number | null
  productionStatus: string
  included: boolean
  specificationAttributes?: {
    paper_layers?: PaperLayer[]
    production_stages?: string[]
    material?: string
    joint_type?: string
    board_type?: string
    finish?: string
  }
}
interface PaperLayer { layer_name?: string; gsm?: string; bf_rct?: string; deckle_size?: string; shade?: string; paper_grade?: string; flute?: string }
const formatPlanDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return match ? `${match[3]}-${months[Number(match[2]) - 1]}-${match[1]}` : value
}
const numberText = (value: number | null) => value == null ? '—' : Number(value).toLocaleString('en-IN')
const layerForFlute = (line: PlanLine, flute: string) => line.specificationAttributes?.paper_layers?.find((layer) => layer.flute === flute)
const linerAfterFlute = (line: PlanLine, flute: string) => {
  const layers = line.specificationAttributes?.paper_layers ?? []
  const index = layers.findIndex((layer) => layer.flute === flute)
  return index >= 0 ? layers.slice(index + 1).find((layer) => !layer.flute) : undefined
}
const topLayer = (line: PlanLine) => line.specificationAttributes?.paper_layers?.find((layer) => !layer.flute)
const calculatedDeckleSize = (line: PlanLine) => line.widthMm != null && line.heightMm != null
  ? String(line.widthMm + line.heightMm + 20)
  : line.widthMm == null ? '' : String(line.widthMm)
const preloadedDeckleSize = (line: PlanLine) => {
  const savedDeckle = line.specificationAttributes?.paper_layers?.find((layer) => layer.deckle_size?.trim())?.deckle_size
  return savedDeckle?.trim() || calculatedDeckleSize(line)
}
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const isProductionSalesOrder = (order: SalesOrder) => {
  const status = (order.status ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return status === 'open' || status === 'partiallyinvoiced' || status === 'overdue'
}
const request = async <T,>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let data: { error?: string } & Partial<T>
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(
      `Production Planning service returned an invalid response (${response.status}).`,
    )
  }
  if (response.status === 401) {
    window.dispatchEvent(new Event('pc-tech-session-expired'))
    throw new Error('Your sign-in session has expired. Please sign in again.')
  }
  if (!response.ok)
    throw new Error(
      data.error || `Production Planning request failed (${response.status}).`,
    )
  return data as T
}

const PlanningGridHeader = () => (
  <thead>
    <tr className="production-grid-groups">
      <th rowSpan={2}>Sl. No.</th>
      <th className="group-order" colSpan={2}>Order &amp; Item</th>
      <th className="group-product" colSpan={1}>Customer</th>
      <th className="group-production" colSpan={2}>Schedule</th>
      <th className="group-production" colSpan={3}>Production</th>
      <th className="group-product" colSpan={1}>Product</th>
      <th className="group-construction" colSpan={5}>Outer Dimensions (OD) in mm &amp; Construction</th>
      <th className="group-machine" colSpan={3}>Machine Setup</th>
      <th className="group-paper" colSpan={12}>Paper Composition</th>
    </tr>
    <tr className="production-grid-columns">
      <th>Sales Order</th><th>PC Item Code <span className="production-required-mark" aria-label="required">*</span></th><th>Customer</th>
      <th>Production Date <span className="production-required-mark" aria-label="required">*</span></th><th>Delivery Date <span className="production-required-mark" aria-label="required">*</span></th><th>Box Qty <span className="production-required-mark" aria-label="required">*</span></th><th>Top Sheet</th><th>2 Ply Qty</th>
      <th>Product Description</th>
      <th>L</th><th>W</th><th>H</th><th>Product<br />Type</th><th>Ply</th>
      <th>Flute<br />Run</th><th>Deckle Size</th><th>Cut Length</th><th>Top GSM</th><th>Top BF</th>
      <th>B Flute GSM</th><th>B Flute BF</th><th>B Liner GSM</th><th>B Liner BF</th>
      <th>A Flute GSM</th><th>A Flute BF</th><th>A Liner GSM</th>
      <th>C Flute GSM</th><th>C Flute BF</th><th>C Liner GSM</th>
    </tr>
  </thead>
)

const PlanningGridColumns = () => (
  <colgroup>
    <col className="col-serial" />
    <col className="col-order-number" /><col className="col-code" /><col className="col-customer" />
    <col className="col-date" /><col className="col-date" />
    <col className="col-quantity" /><col className="col-quantity" /><col className="col-quantity" />
    <col className="col-description" />
    <col className="col-dimension" /><col className="col-dimension" /><col className="col-dimension" />
    <col className="col-product-type" /><col className="col-ply" /><col className="col-flute-run" />
    <col className="col-machine" /><col className="col-machine" />
    {Array.from({ length: 12 }, (_, index) => <col className="col-paper" key={index} />)}
  </colgroup>
)

export default function ProductionPlanning() {
  const [customers, setCustomers] = useState<Customer[]>([]),
    [customerId, setCustomerId] = useState('')
  const [orders, setOrders] = useState<SalesOrder[]>([]),
    [orderId, setOrderId] = useState('')
  const [selected, setSelected] = useState<SelectedOrder[]>([]),
    [lines, setLines] = useState<PlanLine[]>([])
  const [step, setStep] = useState<'select' | 'plan' | 'done'>('select'),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [viewingSpecification, setViewingSpecification] = useState<PlanLine | null>(null)
  useEffect(() => {
    let active = true
    void getCustomers().then((v) => {
      if (active) {
        setCustomers(v)
        setError(getCustomersError() ?? '')
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    let active = true
    setOrders([])
    setOrderId('')
    if (!customerId)
      return () => {
        active = false
      }
    setLoading(true)
    void getSalesOrdersByCustomer(customerId)
      .then((v) => {
        if (active) setOrders(v.filter(isProductionSalesOrder))
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Unable to load Sales Orders.',
          )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [customerId])
  const customer = customers.find((v) => v.customer_id === customerId)
  const add = async () => {
    const order = orders.find((v) => v.salesorder_id === orderId)
    if (
      order &&
      customer &&
      !selected.some((v) => v.salesorder_id === orderId)
    ) {
      const nextSelected = [...selected, { ...order, customerId, customerName: customer.customer_name }]
      setBusy(true)
      setError('')
      try {
        const data = await request<{ lines: PlanLine[] }>('/api/production-planning/prepare', {
          salesOrderIds: nextSelected.map((value) => value.salesorder_id),
        })
        setSelected(nextSelected)
        setLines(data.lines.map((value) => ({
          ...value,
          productionDate: value.productionDate || todayIso(),
          twoPlyQuantity: calculateTwoPlyQuantity(value.productionQuantity, value.ply),
          deckleSize: preloadedDeckleSize(value),
          included: value.productionStatus === 'READY',
        })))
        setOrderId('')
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to add the Sales Order.')
      } finally {
        setBusy(false)
      }
    }
  }
  const removeLine = (line: PlanLine) => {
    setLines((current) => {
      const remaining = current.filter((value) => value.salesOrderId !== line.salesOrderId || value.lineItemId !== line.lineItemId)
      const remainingOrderIds = new Set(remaining.map((value) => value.salesOrderId))
      setSelected((orders) => orders.filter((order) => remainingOrderIds.has(order.salesorder_id)))
      return remaining
    })
  }
  const included = lines.filter(
      (v) => v.included && v.productionStatus === 'READY',
    ),
    invalid = included.some(
      (v) =>
        !Number.isFinite(v.productionQuantity) ||
        v.productionQuantity <= 0 ||
        v.productionQuantity > v.balanceQuantity ||
        !v.productionDate ||
        v.productionDate < todayIso() ||
        !v.deliveryDate,
    )
  const submit = async (action: 'draft' | 'generate') => {
    setBusy(true)
    setError('')
    try {
      const data = await request<{ message: string }>('/api/production-plans', {
        action,
        lines: included.map((v) => ({
          salesOrderId: v.salesOrderId,
          lineItemId: v.lineItemId,
          productionQuantity: v.productionQuantity,
          twoPlyQuantity: v.twoPlyQuantity,
          deckleSize: v.deckleSize,
          productionDate: v.productionDate,
          deliveryDate: v.deliveryDate,
        })),
      })
      setMessage(data.message)
      setStep('done')
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to push the Production Plan.',
      )
    } finally {
      setBusy(false)
    }
  }
  const renderPlanningRow = (v: PlanLine, index: number) => {
    const top = topLayer(v), bFlute = layerForFlute(v, 'B'), bLiner = linerAfterFlute(v, 'B')
    const aFlute = layerForFlute(v, 'A'), aLiner = linerAfterFlute(v, 'A')
    const cFlute = layerForFlute(v, 'C'), cLiner = linerAfterFlute(v, 'C')
    const fluteRun = (v.specificationAttributes?.paper_layers ?? []).filter((layer) => layer.flute).map((layer) => layer.flute).join(' + ') || '—'
    const cutLength = v.lengthMm != null && v.widthMm != null ? (2 * v.lengthMm) + (2 * v.widthMm) + 50 : v.lengthMm
    const cell = (layer: PaperLayer | undefined, key: 'gsm' | 'bf_rct') => layer?.[key] || '—'
    return <tr key={`${v.salesOrderId}-${v.lineItemId}`} className={v.productionStatus === 'SPECIFICATION_MISSING' ? 'is-missing' : ''}>
      <td><span className="production-row-index">{index + 1}<button type="button" className="production-row-remove" aria-label={`Remove ${v.salesOrderNumber} ${v.itemName}`} title="Remove row" onClick={() => removeLine(v)}><X size={12} /></button></span></td><td>{v.salesOrderNumber}</td><td>{v.specificationCode ? <button type="button" className="production-spec-link" onClick={() => setViewingSpecification(v)}>{v.specificationCode}</button> : <span className="production-spec-missing">Specification Missing</span>}</td><td title={v.customerName}>{v.customerName}</td>
      <td><label className="production-date-control" title="Select Production Date"><span>{formatPlanDate(v.productionDate || todayIso())}</span><input className="production-date" aria-label="Production Date" type="date" min={todayIso()} value={v.productionDate || todayIso()} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setLines((all) => all.map((x) => ({ ...x, productionDate: e.target.value })))} /></label></td>
      <td><label className="production-date-control" title="Select Delivery Date"><span>{v.deliveryDate ? formatPlanDate(v.deliveryDate) : 'Select date'}</span><input className="production-date" aria-label="Delivery Date" type="date" value={v.deliveryDate || ''} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setLines((all) => all.map((x) => x.salesOrderId === v.salesOrderId && x.lineItemId === v.lineItemId ? { ...x, deliveryDate: e.target.value } : x))} /></label></td>
      <td><input aria-label="Box Qty" title={`Maximum available quantity: ${v.balanceQuantity}`} className="production-quantity" type="number" min="0.001" max={v.balanceQuantity} step="any" value={v.productionQuantity} disabled={!v.included} onChange={(e) => { const productionQuantity = Number(e.target.value); setLines((all) => all.map((x) => x.salesOrderId === v.salesOrderId && x.lineItemId === v.lineItemId ? { ...x, productionQuantity, twoPlyQuantity: calculateTwoPlyQuantity(productionQuantity, x.ply) } : x)) }} /></td>
      <td className="numeric">{v.productionQuantity}</td>
      <td><input aria-label="2 Ply Qty" className="production-quantity" type="number" min="0" step="any" value={v.twoPlyQuantity ?? calculateTwoPlyQuantity(v.productionQuantity, v.ply) ?? ''} disabled={!v.included} onChange={(e) => { const twoPlyQuantity = e.target.value === '' ? null : Number(e.target.value); setLines((all) => all.map((x) => x.salesOrderId === v.salesOrderId && x.lineItemId === v.lineItemId ? { ...x, twoPlyQuantity } : x)) }} /></td>
      <td className="production-description" title={v.itemDescription}>{v.itemDescription || v.itemName}</td>
      <td className="numeric">{numberText(v.lengthMm)}</td><td className="numeric">{numberText(v.widthMm)}</td><td className="numeric">{numberText(v.heightMm)}</td>
      <td>{v.productType || '—'}</td><td>{v.ply ? `${v.ply} Ply` : '—'}</td><td>{fluteRun}</td><td><input aria-label="Deckle Size" className="production-quantity" type="text" value={v.deckleSize ?? preloadedDeckleSize(v)} disabled={!v.included} onChange={(e) => { const deckleSize = e.target.value; setLines((all) => all.map((x) => x.salesOrderId === v.salesOrderId && x.lineItemId === v.lineItemId ? { ...x, deckleSize } : x)) }} /></td><td className="numeric">{numberText(cutLength)}</td>
      <td className="numeric">{cell(top, 'gsm')}</td><td className="numeric">{cell(top, 'bf_rct')}</td>
      <td className="numeric">{cell(bFlute, 'gsm')}</td><td className="numeric">{cell(bFlute, 'bf_rct')}</td><td className="numeric">{cell(bLiner, 'gsm')}</td><td className="numeric">{cell(bLiner, 'bf_rct')}</td>
      <td className="numeric">{cell(aFlute, 'gsm')}</td><td className="numeric">{cell(aFlute, 'bf_rct')}</td><td className="numeric">{cell(aLiner, 'gsm')}</td>
      <td className="numeric">{cell(cFlute, 'gsm')}</td><td className="numeric">{cell(cFlute, 'bf_rct')}</td><td className="numeric">{cell(cLiner, 'gsm')}</td>
    </tr>
  }
  return (
    <div className="coc-form product-spec-form production-planning-workspace">
      <div className="product-spec-toolbar">
        <div>
          <strong>Production Planning</strong>
          <span>
            {step === 'select'
              ? `${selected.length} Sales Orders selected`
              : `${included.length} production lines`}
          </span>
        </div>
      </div>
      {error && (
        <p className="production-planning-message is-error" role="alert">
          <AlertCircle size={14} />
          {error}
        </p>
      )}
      {step === 'select' && (
        <>
          <section className="product-spec-filterbar production-planning-filterbar">
            <label>
              <span>Customer</span>
              <select
                value={customerId}
                disabled={loading}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map((v) => (
                  <option key={v.customer_id} value={v.customer_id}>
                    {v.customer_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sales Order</span>
              <select
                value={orderId}
                disabled={!customerId || loading}
                onChange={(e) => setOrderId(e.target.value)}
              >
                <option value="">Select Sales Order</option>
                {orders
                  .filter(
                    (v) =>
                      !selected.some(
                        (s) => s.salesorder_id === v.salesorder_id,
                      ),
                  )
                  .map((v) => (
                    <option key={v.salesorder_id} value={v.salesorder_id}>
                      {v.salesorder_number}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" disabled={!orderId || busy} onClick={() => void add()}>
              <Factory size={14} />
              Take for Production
            </button>
          </section>
          <section className="product-spec-panel production-selection-panel">
            <header>
              <div>
                <h3>
                  <Factory size={16} />
                  Sales Orders for Production
                </h3>
                <p>Add orders from one or more customers.</p>
              </div>
            </header>
            <div className="production-order-table-wrap production-lines-scroll">
              <table className="production-planning-grid">
                <PlanningGridColumns />
                <PlanningGridHeader />
                <tbody>
                  {lines.map(renderPlanningRow)}
                  {!lines.length && (
                    <tr>
                      <td colSpan={30} className="production-planning-empty">
                        No Sales Orders selected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer>
              <div className="production-selection-meta">
                <span>{selected.length} selected</span>
                <span className="production-required-note"><b>*</b> Mandatory to push</span>
              </div>
              <button
                disabled={!included.length || invalid || busy}
                onClick={() => void submit('generate')}
              >
                <Factory size={14} />
                {busy ? 'Pushing…' : 'Push to Production'}
              </button>
            </footer>
          </section>
        </>
      )}
      {step === 'plan' && (
        <>
          <section className="product-spec-panel production-lines-panel">
            <header>
              <div>
                <h3>Selected Sales Orders</h3>
                <p>
                  Missing specifications remain visible and cannot be submitted.
                </p>
              </div>
            </header>
            <div className="production-order-table-wrap production-lines-scroll">
              <table className="production-planning-grid">
                <PlanningGridColumns />
                <PlanningGridHeader />
                <tbody>
                  {lines.map(renderPlanningRow)}
                  {false && lines.map((v) => (
                    <tr
                      key={`${v.salesOrderId}-${v.lineItemId}`}
                      className={
                        v.productionStatus === 'SPECIFICATION_MISSING'
                          ? 'is-missing'
                          : v.included &&
                              (v.productionQuantity <= 0 ||
                                v.productionQuantity > v.balanceQuantity)
                            ? 'is-invalid'
                          : ''
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={v.included}
                          disabled={v.productionStatus !== 'READY'}
                          onChange={(e) =>
                            setLines((all) =>
                              all.map((x) =>
                                x.lineItemId === v.lineItemId
                                  ? { ...x, included: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>{v.customerName}</td>
                      <td>{v.salesOrderNumber}</td>
                      <td>
                        <strong>{v.itemName}</strong>
                        <small>{v.itemDescription}</small>
                      </td>
                      <td className="numeric">{v.orderedQuantity}</td>
                      <td className="numeric">{v.previouslyPlannedQuantity}</td>
                      <td className="numeric">{v.balanceQuantity}</td>
                      <td>
                        <input
                          className="production-quantity"
                          type="number"
                          min="0.001"
                          max={v.balanceQuantity}
                          step="any"
                          value={v.productionQuantity}
                          disabled={!v.included}
                          onChange={(e) =>
                            setLines((all) =>
                              all.map((x) =>
                                x.salesOrderId === v.salesOrderId && x.lineItemId === v.lineItemId
                                  ? {
                                      ...x,
                                      productionQuantity: Number(
                                        e.target.value,
                                      ),
                                      twoPlyQuantity: calculateTwoPlyQuantity(
                                        Number(e.target.value),
                                        x.ply,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>{v.uom || '—'}</td>
                      <td>{v.specificationCode || '—'}</td>
                      <td>{v.productType || '—'}</td>
                      <td>{v.ply ? `${v.ply} Ply` : '—'}</td>
                      <td>
                        <span
                          className={`production-status is-${v.productionStatus.toLowerCase()}`}
                        >
                          {v.productionStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="production-actions">
              <button className="secondary" onClick={() => setStep('select')}>
                <ArrowLeft size={14} />
                Back
              </button>
              <div>
                <button
                  disabled={busy}
                  className="secondary"
                  onClick={() => setStep('select')}
                >
                  Cancel
                </button>
                <button
                  disabled={!included.length || invalid || busy}
                  onClick={() => void submit('draft')}
                >
                  <Save size={14} />
                  Save as Draft
                </button>
                <button
                  disabled={!included.length || invalid || busy}
                  onClick={() => void submit('generate')}
                >
                  <Check size={14} />
                  Generate Production Plan
                </button>
              </div>
            </footer>
          </section>
        </>
      )}
      {step === 'done' && (
        <section className="product-spec-panel production-summary">
          <Check size={28} />
          <h3>{message}</h3>
          <button
            onClick={() => {
              setSelected([])
              setLines([])
              setStep('select')
            }}
          >
            Plan Another Order
          </button>
        </section>
      )}
      {viewingSpecification && createPortal(
        <div className="production-spec-modal-backdrop" role="presentation" onMouseDown={() => setViewingSpecification(null)}>
          <section className="production-spec-modal" role="dialog" aria-modal="true" aria-labelledby="production-spec-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><small>PRODUCT SPECIFICATION</small><h3 id="production-spec-title">{viewingSpecification.specificationCode}</h3></div>
              <button type="button" aria-label="Close Product Specification" onClick={() => setViewingSpecification(null)}><X size={17} /></button>
            </header>
            <div className="production-spec-summary">
              <span><small>Customer</small><strong>{viewingSpecification.customerName}</strong></span>
              <span><small>Product</small><strong>{viewingSpecification.itemDescription || viewingSpecification.itemName}</strong></span>
              <span><small>Type</small><strong>{viewingSpecification.productType || '—'}</strong></span>
              <span><small>Ply</small><strong>{viewingSpecification.ply ? `${viewingSpecification.ply} Ply` : '—'}</strong></span>
            </div>
            <section className="production-spec-modal-section">
              <h4>Technical Specification</h4>
              <div className="production-spec-technical">
                <span><small>Length (OD)</small><strong>{numberText(viewingSpecification.lengthMm)} mm</strong></span>
                <span><small>Width (OD)</small><strong>{numberText(viewingSpecification.widthMm)} mm</strong></span>
                <span><small>Height (OD)</small><strong>{numberText(viewingSpecification.heightMm)} mm</strong></span>
                <span><small>Material</small><strong>{viewingSpecification.specificationAttributes?.material || '—'}</strong></span>
                <span><small>Board Type</small><strong>{viewingSpecification.specificationAttributes?.board_type || '—'}</strong></span>
                <span><small>Joint Type</small><strong>{viewingSpecification.specificationAttributes?.joint_type || '—'}</strong></span>
                <span><small>Finish</small><strong>{viewingSpecification.specificationAttributes?.finish || '—'}</strong></span>
              </div>
            </section>
            <section className="production-spec-modal-section">
              <h4>Paper Composition</h4>
              <div className="production-spec-paper"><table><thead><tr><th>#</th><th>Layer</th><th>GSM</th><th>BF/RCT</th><th>Shade</th><th>Grade</th><th>Flute</th></tr></thead><tbody>
                {(viewingSpecification.specificationAttributes?.paper_layers ?? []).map((layer, index) => <tr key={`${layer.layer_name}-${index}`}><td>{index + 1}</td><td>{layer.layer_name || '—'}</td><td>{layer.gsm || '—'}</td><td>{layer.bf_rct || '—'}</td><td>{layer.shade || '—'}</td><td>{layer.paper_grade || '—'}</td><td>{layer.flute || '—'}</td></tr>)}
                {!viewingSpecification.specificationAttributes?.paper_layers?.length && <tr><td colSpan={7}>Paper composition is not available.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="production-spec-modal-section">
              <h4>Production Stages</h4>
              <div className="production-spec-stages">{(viewingSpecification.specificationAttributes?.production_stages ?? []).map((stage, index) => <span key={stage}><b>{index + 1}</b>{stage}</span>)}{!viewingSpecification.specificationAttributes?.production_stages?.length && <em>Production stages are not available.</em>}</div>
            </section>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}
