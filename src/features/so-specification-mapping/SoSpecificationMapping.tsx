import { AlertCircle, BadgeIndianRupee, CircleCheck, FileText, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getCustomers, getCustomersError, type Customer } from '../../customerService'
import {
  getSalesOrderById,
  getSalesOrdersByCustomer,
  type SalesOrder,
  type SalesOrderDetail,
} from '../../salesOrderService'
import '../product-specifications/product-specifications.css'
import './so-specification-mapping.css'

interface ProductSpecificationOption {
  id: number
  polar_canvas_item_code: string
  item_id: string
  item_name: string
  specification_type: string
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
}

const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

export default function SoSpecificationMapping() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([])
  const [salesOrderId, setSalesOrderId] = useState('')
  const [detail, setDetail] = useState<SalesOrderDetail | null>(null)
  const [specifications, setSpecifications] = useState<ProductSpecificationOption[]>([])
  const [lineSpecifications, setLineSpecifications] = useState<Record<string, string>>({})
  const [customersLoading, setCustomersLoading] = useState(true)
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [specificationsLoading, setSpecificationsLoading] = useState(false)
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [customerError, setCustomerError] = useState('')
  const [salesOrderError, setSalesOrderError] = useState('')
  const [specificationError, setSpecificationError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const salesOrderRequest = useRef(0)
  const detailRequest = useRef(0)

  useEffect(() => {
    let active = true
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
    setDetail(null)
    setSalesOrderError('')
    if (!customerId) {
      setSalesOrdersLoading(false)
      return
    }

    setSalesOrdersLoading(true)
    void getSalesOrdersByCustomer(customerId)
      .then((orders) => {
        if (requestId === salesOrderRequest.current) setSalesOrders(orders)
      })
      .catch((error: unknown) => {
        if (requestId === salesOrderRequest.current) {
          setSalesOrderError(error instanceof Error ? error.message : 'Unable to load sales orders.')
        }
      })
      .finally(() => {
        if (requestId === salesOrderRequest.current) setSalesOrdersLoading(false)
      })
  }, [customerId])

  useEffect(() => {
    let active = true
    setSpecifications([])
    setLineSpecifications({})
    setSpecificationError('')
    if (!customerId) {
      setSpecificationsLoading(false)
      return () => { active = false }
    }

    setSpecificationsLoading(true)
    const params = new URLSearchParams({ customer_id: customerId })
    void fetch(`/api/product-specifications?${params.toString()}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json() as { specifications?: ProductSpecificationOption[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load Product Specifications.')
        if (active) setSpecifications(Array.isArray(payload.specifications) ? payload.specifications : [])
      })
      .catch((error: unknown) => {
        if (active) setSpecificationError(error instanceof Error ? error.message : 'Unable to load Product Specifications.')
      })
      .finally(() => {
        if (active) setSpecificationsLoading(false)
      })
    return () => { active = false }
  }, [customerId])

  useEffect(() => {
    const requestId = ++detailRequest.current
    setDetail(null)
    setLineSpecifications({})
    setSaveMessage('')
    setSalesOrderError('')
    if (!salesOrderId) {
      setDetailLoading(false)
      return
    }

    setDetailLoading(true)
    void getSalesOrderById(salesOrderId)
      .then((salesOrder) => {
        if (requestId === detailRequest.current) setDetail(salesOrder)
      })
      .catch((error: unknown) => {
        if (requestId === detailRequest.current) {
          setSalesOrderError(error instanceof Error ? error.message : 'Unable to load Sales Order details.')
        }
      })
      .finally(() => {
        if (requestId === detailRequest.current) setDetailLoading(false)
      })
  }, [salesOrderId])

  useEffect(() => {
    let active = true
    if (!salesOrderId) {
      setMappingsLoading(false)
      return () => { active = false }
    }
    setMappingsLoading(true)
    const params = new URLSearchParams({ sales_order_id: salesOrderId })
    void fetch(`/api/so-specification-mappings?${params.toString()}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json() as { mappings?: Array<{ sales_order_line_item_id: string; product_specification_id: number }>; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load saved mappings.')
        if (active) setLineSpecifications(Object.fromEntries((payload.mappings ?? []).map((mapping) => [mapping.sales_order_line_item_id, String(mapping.product_specification_id)])))
      })
      .catch((error: unknown) => {
        if (active) setSpecificationError(error instanceof Error ? error.message : 'Unable to load saved mappings.')
      })
      .finally(() => {
        if (active) setMappingsLoading(false)
      })
    return () => { active = false }
  }, [salesOrderId])

  const customerName = customers.find((customer) => customer.customer_id === customerId)?.customer_name ?? '—'
  const specificationLabel = (specification: ProductSpecificationOption) => {
    const dimensions = [specification.length_mm, specification.width_mm, specification.height_mm]
      .filter((value) => value != null)
      .join(' × ')
    return [specification.polar_canvas_item_code, specification.item_name, dimensions ? `${dimensions} mm` : '']
      .filter(Boolean)
      .join(' · ')
  }
  const allItemsMapped = Boolean(detail?.line_items.length)
    && detail!.line_items.every((line) => Boolean(lineSpecifications[line.line_item_id]))

  const saveMappings = async () => {
    if (!detail || !allItemsMapped) return
    setSaving(true)
    setSaveMessage('')
    setSpecificationError('')
    try {
      const response = await fetch('/api/so-specification-mappings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          salesOrderId: detail.salesorder_id,
          mappings: detail.line_items.map((line) => ({
            lineItemId: line.line_item_id,
            specificationId: Number(lineSpecifications[line.line_item_id]),
          })),
        }),
      })
      const responseText = await response.text()
      let payload: { error?: string }
      try {
        payload = JSON.parse(responseText) as { error?: string }
      } catch {
        throw new Error(`Unable to save mappings (${response.status}). Please retry.`)
      }
      if (!response.ok) throw new Error(payload.error || 'Unable to save mappings.')
      setSaveMessage('Product Specifications mapped successfully for all Sales Order items.')
    } catch (error) {
      setSpecificationError(error instanceof Error ? error.message : 'Unable to save mappings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="coc-form product-spec-form so-mapping-workspace">
      <div className="product-spec-toolbar"><div><strong>SO Specification Mapping</strong>{detail && <span>{detail.line_items.length} item{detail.line_items.length === 1 ? '' : 's'}</span>}</div></div>
      <section className="product-spec-filterbar so-mapping-filterbar">
        <label><span>Customer</span><select value={customerId} disabled={customersLoading} onChange={(event) => setCustomerId(event.target.value)}><option value="">{customersLoading ? 'Loading customers…' : 'Select customer'}</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_name}</option>)}</select></label>
        <label><span>Sales Order</span><select value={salesOrderId} disabled={!customerId || salesOrdersLoading} onChange={(event) => setSalesOrderId(event.target.value)}><option value="">{!customerId ? 'Select a customer first' : salesOrdersLoading ? 'Loading Sales Orders…' : 'Select Sales Order'}</option>{salesOrders.map((order) => <option key={order.salesorder_id} value={order.salesorder_id}>{order.salesorder_number}</option>)}</select></label>
        {customerError && <p className="so-mapping-error" role="alert"><AlertCircle size={14} />{customerError}</p>}
        {salesOrderError && <p className="so-mapping-error" role="alert"><AlertCircle size={14} />{salesOrderError}</p>}
        {specificationError && <p className="so-mapping-error" role="alert"><AlertCircle size={14} />{specificationError}</p>}
        {!salesOrdersLoading && customerId && !salesOrderError && salesOrders.length === 0 && <p className="so-mapping-empty">No Sales Orders are available for this customer.</p>}
      </section>

      {detailLoading && <section className="product-spec-panel so-mapping-empty">Loading Sales Order details…</section>}
      {detail && !detailLoading && <section className="product-spec-panel so-order-display" aria-live="polite">
        <header><div><h3><FileText size={16} /> Sales Order</h3><p>Zoho Books Sales Order details.</p></div><strong>{detail.salesorder_number}</strong></header>
        <dl className="so-order-summary">
          <div><dt>Customer</dt><dd>{customerName}</dd></div>
          <div><dt>Sales Order Number</dt><dd>{detail.salesorder_number}</dd></div>
          <div><dt>Items</dt><dd>{detail.line_items.length}</dd></div>
          <div><dt><BadgeIndianRupee size={13} /> Total Amount</dt><dd>{formatCurrency(detail.total)}</dd></div>
        </dl>
        <div className="so-order-table-wrap"><table>
          <thead><tr><th>#</th><th>Item &amp; Description</th><th>Product Specification</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            {detail.line_items.map((line, index) => <tr key={line.line_item_id}><td>{index + 1}</td><td><strong>{line.name || '—'}</strong>{line.description && <small>{line.description}</small>}</td><td><select className="so-line-specification" value={lineSpecifications[line.line_item_id] ?? ''} disabled={specificationsLoading || mappingsLoading || specifications.length === 0} onChange={(event) => { setLineSpecifications((current) => ({ ...current, [line.line_item_id]: event.target.value })); setSaveMessage('') }}><option value="">{specificationsLoading || mappingsLoading ? 'Loading specifications…' : specifications.length ? 'Select specification' : 'No specifications available'}</option>{specifications.map((specification) => <option key={specification.id} value={specification.id}>{specificationLabel(specification)}</option>)}</select></td><td>{line.quantity.toLocaleString('en-IN')}</td><td>{line.unit || '—'}</td><td>{formatCurrency(line.rate)}</td><td>{formatCurrency(line.amount)}</td></tr>)}
            {detail.line_items.length === 0 && <tr><td colSpan={7} className="so-mapping-empty">No items found in this Sales Order.</td></tr>}
          </tbody>
        </table></div>
        <footer className="so-mapping-footer"><div>{!allItemsMapped && <span className="so-mapping-required">Map a Product Specification to every Sales Order item.</span>}{saveMessage && <span className="spec-success"><CircleCheck size={14} />{saveMessage}</span>}</div><button type="button" disabled={!allItemsMapped || saving || mappingsLoading} onClick={() => void saveMappings()}><Save size={14} />{saving ? 'Saving…' : 'Save Mapping'}</button></footer>
      </section>}
    </div>
  )
}
