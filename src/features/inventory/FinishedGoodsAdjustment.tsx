import { useEffect, useState, type FormEvent } from 'react'
import type { FinishedGoodsRow } from './finishedGoodsStockService'
import { fgAdjustmentReasons } from './fgAdjustmentReasons'

const qty = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

export default function FinishedGoodsAdjustment({ row, onClose, onSaved }: {
  row: FinishedGoodsRow; onClose: () => void; onSaved: () => void
}) {
  const [type, setType] = useState<'INCREASE' | 'DECREASE'>('INCREASE')
  const [quantity, setQuantity] = useState(''), [reason, setReason] = useState(''), [remarks, setRemarks] = useState('')
  const [balance, setBalance] = useState({ manufactured_quantity: row.manufactured_quantity, dispatched_quantity: row.dispatched_quantity, closing_stock: row.closing_stock })
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setReady(false); setError('')
    fetch(`/api/finished-goods-adjustments?job_card_id=${row.job_card_id}`, { credentials: 'include' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load current FG stock.')
        if (active) { setBalance(data); setReady(true) }
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load current FG stock.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [row.job_card_id, retry])
  const changed = () => setRequestId(crypto.randomUUID())
  const amount = Number(quantity)
  const projected = balance.closing_stock + (type === 'INCREASE' ? amount : -amount)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !ready) return
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter Adjustment Qty greater than 0.'); return }
    if (!reason) { setError('Select a Reason.'); return }
    if (reason === 'Other' && !remarks.trim()) { setError('Remarks are required when Reason is Other.'); return }
    if (type === 'DECREASE' && amount > balance.closing_stock) { setError(`Adjustment Qty cannot exceed available FG stock of ${qty(balance.closing_stock)} ${row.uom || 'Nos'}.`); return }
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/finished-goods-adjustments', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        request_id: requestId, job_card_id: row.job_card_id, adjustment_type: type, adjustment_quantity: amount,
        reason, remarks: remarks.trim(), previous_closing_stock: balance.closing_stock,
      }) })
      const data = await response.json()
      if (!response.ok) {
        if (typeof data.closing_stock === 'number') { setBalance(data); changed() }
        throw new Error(data.error || 'Unable to confirm adjustment.')
      }
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to confirm adjustment. Please retry.') }
    finally { setSaving(false) }
  }
  return <div className="fg-dispatch-overlay"><section role="dialog" aria-modal="true" aria-labelledby="fg-adjustment-title" className="fg-dispatch-modal">
    <header><strong id="fg-adjustment-title">Adjust Finished Goods Stock</strong><button type="button" aria-label="Close" disabled={saving} onClick={onClose}>×</button></header>
    <div className="fg-dispatch-context"><div><span>Customer</span><strong>{row.customer_name}</strong></div><div><span>Sales Order / Job Card</span><strong>{row.sales_order_number} / {row.job_number}</strong></div><div className="wide"><span>Item & Description</span><strong>{row.item_name}</strong><small>{row.item_description}</small></div><div><span>Manufactured Qty / Dispatched Qty</span><strong>{qty(balance.manufactured_quantity)} / {qty(balance.dispatched_quantity)} {row.uom || 'Nos'}</strong></div><div><span>Current Closing Stock</span><strong>{qty(balance.closing_stock)} {row.uom || 'Nos'}</strong></div></div>
    {error && <p className="fg-stock-message" role="alert">{error}</p>}
    {loading ? <p className="fg-dispatch-note">Loading…</p> : !ready ? <p className="fg-dispatch-note"><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : <form className="fg-adjustment-form" onSubmit={submit}>
      <label><span>Adjustment Type *</span><select autoFocus required disabled={saving} value={type} onChange={event => { setType(event.target.value as 'INCREASE' | 'DECREASE'); changed() }}><option value="INCREASE">Increase</option><option value="DECREASE">Decrease</option></select></label>
      <label><span>Adjustment Qty ({row.uom || 'Nos'}) *</span><input required type="number" min="0" step="any" max={type === 'DECREASE' ? balance.closing_stock : undefined} disabled={saving} value={quantity} onChange={event => { setQuantity(event.target.value); changed() }}/></label>
      <label className="wide"><span>Reason *</span><select required disabled={saving} value={reason} onChange={event => { setReason(event.target.value); changed() }}><option value="">Select reason</option>{fgAdjustmentReasons.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="wide"><span>Remarks {reason === 'Other' ? '*' : '(optional)'}</span><textarea required={reason === 'Other'} maxLength={1000} rows={2} disabled={saving} value={remarks} onChange={event => { setRemarks(event.target.value); changed() }}/></label>
      <p className="fg-dispatch-note">New Closing Stock: <strong>{quantity && Number.isFinite(projected) && amount > 0 ? `${qty(projected)} ${row.uom || 'Nos'}` : '—'}</strong></p>
      <footer><button type="button" className="secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Confirm Adjustment'}</button></footer>
    </form>}
  </section></div>
}
