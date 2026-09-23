import { useEffect, useState, type FormEvent } from 'react'
import { formatIstDate } from '../../utils/dateTimeFormatting'
import type { FinishedGoodsRow } from './finishedGoodsStockService'

type Invoice = { invoice_id: string; invoice_number: string }
type History = { type: string; reference: string; quantity: number; occurred_at: string; created_by_name: string; reason: string; remarks: string }
const historyTypeLabels: Record<string,string> = { PRODUCTION:'Production', DISPATCH:'Dispatch', ADJUSTMENT_INCREASE:'Adjustment Increase', ADJUSTMENT_DECREASE:'Adjustment Decrease' }
const qty = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function FinishedGoodsDispatch({ row, historyOnly, onClose, onSaved }: {
  row: FinishedGoodsRow; historyOnly: boolean; onClose: () => void; onSaved: () => void
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [invoice, setInvoice] = useState(''), [quantity, setQuantity] = useState(''), [date, setDate] = useState(today)
  const [dispatched, setDispatched] = useState(row.dispatched_quantity), [closing, setClosing] = useState(row.closing_stock)
  const [manufactured, setManufactured] = useState(row.manufactured_quantity), [adjustment, setAdjustment] = useState(row.stock_adjustment)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    fetch(`/api/finished-goods-dispatches?job_card_id=${row.job_card_id}&action=${historyOnly ? 'history' : 'invoices'}`, { credentials: 'include' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load dispatch details.')
        if (active) { setInvoices(data.invoices ?? []); setHistory(data.transactions ?? []); setDispatched(Number(data.dispatched_quantity)); setClosing(Number(data.closing_stock)); setManufactured(Number(data.manufactured_quantity)); setAdjustment(Number(data.stock_adjustment)) }
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load dispatch details.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [row.job_card_id, historyOnly, retry])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const amount = Number(quantity)
    if (!invoice || !Number.isFinite(amount) || amount <= 0) { setError('Select Invoice No. and enter Dispatch Qty greater than 0.'); return }
    if (amount > closing) { setError(`Dispatch Qty cannot exceed available FG stock of ${qty(closing)} ${row.uom || 'Nos'}.`); return }
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/finished-goods-dispatches', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, job_card_id: row.job_card_id, zoho_invoice_id: invoice, dispatch_quantity: amount, previous_dispatched_quantity: dispatched, previous_closing_stock: closing, dispatch_date: date }) })
      const data = await response.json()
      if (!response.ok) {
        if (typeof data.closing_stock === 'number') setClosing(data.closing_stock)
        if (typeof data.stock_adjustment === 'number') setAdjustment(data.stock_adjustment)
        if (typeof data.manufactured_quantity === 'number') setManufactured(data.manufactured_quantity)
        if (typeof data.dispatched_quantity === 'number') { setDispatched(data.dispatched_quantity); setRequestId(crypto.randomUUID()) }
        throw new Error(data.error || 'Unable to confirm dispatch.')
      }
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to confirm dispatch. Please retry.') }
    finally { setSaving(false) }
  }
  return <div className="fg-dispatch-overlay"><section role="dialog" aria-modal="true" aria-labelledby="fg-dispatch-title" className={`fg-dispatch-modal${historyOnly ? ' fg-stock-history-modal' : ''}`}>
    <header><strong id="fg-dispatch-title">{historyOnly ? 'Finished Goods Stock History' : 'Dispatch Finished Goods'}</strong><button type="button" aria-label="Close" disabled={saving} onClick={onClose}>×</button></header>
    <div className="fg-dispatch-context"><div><span>Customer</span><strong>{row.customer_name}</strong></div><div><span>Sales Order / Job Card</span><strong>{row.sales_order_number} / {row.job_number}</strong></div><div className="wide"><span>Item & Description</span><strong>{row.item_name}</strong><small>{row.item_description}</small></div><div><span>Manufactured Qty</span><strong>{qty(manufactured)} {row.uom || 'Nos'}</strong></div><div><span>Already Dispatched / Available FG Qty</span><strong>{qty(dispatched)} / {qty(closing)} {row.uom || 'Nos'}</strong></div><div><span>Net Stock Adjustment</span><strong>{adjustment > 0 ? '+' : ''}{qty(adjustment)} {row.uom || 'Nos'}</strong></div></div>
    {error && <p className="fg-stock-message" role="alert">{error}</p>}
    {loading ? <p className="fg-dispatch-note">Loading…</p> : historyOnly ? <div className="fg-dispatch-history"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Qty</th><th>User</th><th>Reason / Remarks</th></tr></thead><tbody>{history.map((entry, index) => <tr key={index}><td>{formatIstDate(entry.occurred_at)}</td><td>{historyTypeLabels[entry.type] || entry.type}</td><td>{entry.reference}</td><td>{entry.quantity > 0 ? '+' : ''}{qty(entry.quantity)} {row.uom || 'Nos'}</td><td>{entry.created_by_name || '?'}</td><td>{[entry.reason,entry.remarks].filter(Boolean).join(' ? ') || '?'}</td></tr>)}{!history.length && <tr><td colSpan={6}>No stock transactions recorded.</td></tr>}</tbody><tfoot><tr><th colSpan={3}>Closing Stock</th><td>{qty(closing)} {row.uom || 'Nos'}</td><td colSpan={2}/></tr></tfoot></table>{error && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}</div> : <form onSubmit={submit}>
      <label><span>Invoice No.</span><select autoFocus required value={invoice} disabled={saving} onChange={event => { setInvoice(event.target.value); setRequestId(crypto.randomUUID()) }}><option value="">Select invoice</option>{invoices.map(value => <option key={value.invoice_id} value={value.invoice_id}>{value.invoice_number}</option>)}</select></label>
      <label><span>Dispatch Qty ({row.uom || 'Nos'})</span><input required type="number" min="0.001" step="any" max={closing} value={quantity} disabled={saving} onChange={event => { setQuantity(event.target.value); setRequestId(crypto.randomUUID()) }}/></label>
      <label><span>Dispatch Date</span><input required type="date" value={date} disabled={saving} onChange={event => { setDate(event.target.value); setRequestId(crypto.randomUUID()) }}/></label>
      {!invoices.length && <p className="fg-dispatch-note">No eligible invoices loaded for this customer. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
      <footer><button type="button" className="secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving || !invoices.length || closing <= 0}>{saving ? 'Saving…' : 'Confirm Dispatch'}</button></footer>
    </form>}
  </section></div>
}
