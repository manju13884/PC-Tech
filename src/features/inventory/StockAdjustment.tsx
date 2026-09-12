import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, Plus, RotateCcw, Save, Send, X } from 'lucide-react'
import { formatIstDateTime } from '../../utils/dateTimeFormatting'
import { getMaterialStocks, getStockAdjustments, saveStockAdjustment, type MaterialStock, type StockAdjustmentRecord } from './stockAdjustmentService'
import './stock-adjustment.css'

const reasons = ['Physical Stock Verification', 'Excess Stock Found', 'Shortage', 'Damaged Material', 'Production Wastage', 'Wrong Previous Entry', 'Reel Weight Correction', 'Other']
const statuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const displayDate = (value: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T00:00:00+05:30`)).replace(/ /g, '-') : '—'
const number = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
const materialLabel = (v: MaterialStock) => [v.material_no, v.reel_number, v.paper_type, `${v.gsm} GSM`, v.bf ? `${v.bf} BF` : '', `${v.reel_size_cm} cm`, v.color, v.vendor_name, v.purchase_order_number].filter(Boolean).join(' | ')

interface Props { userRole?: string }
interface FormState { id: number | null; adjustmentDate: string; materialType: string; stockId: string; adjustmentType: string; quantity: string; reason: string; otherReason: string; remarks: string; attachment: File | null }
const emptyForm = (): FormState => ({ id: null, adjustmentDate: today(), materialType: 'Paper', stockId: '', adjustmentType: '', quantity: '', reason: '', otherReason: '', remarks: '', attachment: null })

export default function StockAdjustment({ userRole = '' }: Props) {
  const [stocks, setStocks] = useState<MaterialStock[]>([])
  const [records, setRecords] = useState<StockAdjustmentRecord[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const selectedStock = stocks.find((stock) => String(stock.id) === form.stockId)
  const current = Number(selectedStock?.current_stock ?? 0)
  const qty = Number(form.quantity || 0)
  const revised = form.adjustmentType === 'INCREASE' ? current + qty : form.adjustmentType === 'DECREASE' ? current - qty : current

  const load = async (nextFilters = filters) => {
    setBusy(true); setError('')
    try {
      const [materialStocks, adjustments] = await Promise.all([getMaterialStocks(), getStockAdjustments(nextFilters)])
      setStocks(materialStocks); setRecords(adjustments)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load Stock Adjustments.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load({}) }, [])

  const creators = useMemo(() => [...new Set(records.map((record) => record.created_by_name))].sort(), [records])
  const openNew = () => { setForm(emptyForm()); setViewOnly(false); setShowForm(true); setError(''); setMessage('') }
  const openRecord = (record: StockAdjustmentRecord, readOnly = false) => {
    setForm({ id: record.id, adjustmentDate: record.adjustment_date, materialType: record.material_type, stockId: String(record.inventory_stock_id), adjustmentType: record.adjustment_type, quantity: String(record.adjustment_qty), reason: record.reason, otherReason: record.other_reason ?? '', remarks: record.remarks, attachment: null })
    setViewOnly(readOnly || record.can_edit !== 1); setShowForm(true); setError(''); setMessage('')
  }
  const submit = async (action: 'save_draft' | 'submit') => {
    setError(''); setMessage('')
    if (!form.adjustmentDate || !form.materialType || !form.stockId || !form.adjustmentType || !(qty > 0) || !form.reason || !form.remarks.trim() || (form.reason === 'Other' && !form.otherReason.trim())) { setError('Complete all mandatory Stock Adjustment fields.'); return }
    if (revised < 0) { setError('Revised Stock cannot be negative.'); return }
    setBusy(true)
    try {
      await saveStockAdjustment({ action, id: form.id, adjustment_date: form.adjustmentDate, material_type: form.materialType, inventory_stock_id: Number(form.stockId), adjustment_type: form.adjustmentType, adjustment_qty: qty, reason: form.reason, other_reason: form.otherReason, remarks: form.remarks, attachment: form.attachment ? { name: form.attachment.name, type: form.attachment.type, size: form.attachment.size } : null })
      setMessage(action === 'submit' ? 'Stock Adjustment submitted for SUPERADMIN approval. Stock has not changed.' : 'Stock Adjustment saved as Draft. Stock has not changed.')
      setShowForm(false); setForm(emptyForm()); await load(filters)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save Stock Adjustment.') }
    finally { setBusy(false) }
  }
  const approve = async (record: StockAdjustmentRecord) => {
    setBusy(true); setError('')
    try {
      const preview = await saveStockAdjustment<{ currentStock: number; adjustmentQty: number; revisedStock: number; uom: string }>({ action: 'preview_approval', id: record.id })
      const sign = record.adjustment_type === 'INCREASE' ? '+' : '-'
      if (!window.confirm(`Are you sure you want to approve Stock Adjustment ${record.adjustment_number}?\n\nCurrent Stock: ${number(preview.currentStock)} ${preview.uom}\nAdjustment: ${sign}${number(preview.adjustmentQty)} ${preview.uom}\nRevised Stock: ${number(preview.revisedStock)} ${preview.uom}\n\nStock will be updated after approval.`)) return
      await saveStockAdjustment({ action: 'approve', id: record.id, expected_current_stock: preview.currentStock })
      setMessage(`${record.adjustment_number} approved and stock ledger updated.`); await load(filters)
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to approve Stock Adjustment.') }
    finally { setBusy(false) }
  }
  const reject = async (record: StockAdjustmentRecord) => {
    const rejectionReason = window.prompt(`Enter mandatory rejection reason for ${record.adjustment_number}:`)?.trim()
    if (!rejectionReason) return
    setBusy(true); setError('')
    try { await saveStockAdjustment({ action: 'reject', id: record.id, rejection_reason: rejectionReason }); setMessage(`${record.adjustment_number} rejected. Stock was not changed.`); await load(filters) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to reject Stock Adjustment.') }
    finally { setBusy(false) }
  }

  return <div className="stock-adjustment-page">
    <div className="stock-adjustment-toolbar"><div><strong>Stock Adjustments</strong><span>{records.length} record{records.length === 1 ? '' : 's'}</span></div><button type="button" onClick={openNew}><Plus size={14}/> New Stock Adjustment</button></div>
    {error && <p className="stock-adjustment-message is-error" role="alert">{error}</p>}
    {message && <p className="stock-adjustment-message" role="status">{message}</p>}
    {!showForm && <>
      <section className="stock-adjustment-filters">
        <label><span>Adjustment No.</span><input value={filters.adjustment_number ?? ''} onChange={(e) => setFilters({ ...filters, adjustment_number: e.target.value })}/></label>
        <label><span>Date From</span><input type="date" value={filters.date_from ?? ''} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}/></label>
        <label><span>Date To</span><input type="date" value={filters.date_to ?? ''} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}/></label>
        <label><span>Material Type</span><select value={filters.material_type ?? ''} onChange={(e) => setFilters({ ...filters, material_type: e.target.value })}><option value="">All</option><option>Paper</option></select></label>
        <label><span>Material</span><select value={filters.material ?? ''} onChange={(e) => setFilters({ ...filters, material: e.target.value })}><option value="">All</option>{stocks.map((v) => <option key={v.id} value={v.id}>{v.material_no} | {v.reel_number}</option>)}</select></label>
        <label><span>Reason</span><select value={filters.reason ?? ''} onChange={(e) => setFilters({ ...filters, reason: e.target.value })}><option value="">All</option>{reasons.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label><span>Status</span><select value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option>{statuses.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}</select></label>
        <label><span>Created By</span><select value={filters.created_by ?? ''} onChange={(e) => setFilters({ ...filters, created_by: e.target.value })}><option value="">All</option>{creators.map((v) => <option key={v}>{v}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={() => void load(filters)}>Apply Filters</button><button className="secondary" type="button" onClick={() => { setFilters({}); void load({}) }}><RotateCcw size={13}/> Reset</button>
      </section>
      <section className="stock-adjustment-list"><div className="stock-adjustment-table-wrap"><table><thead><tr>{['Adjustment No.','Adjustment Date','Material Type','Material / Reel','Current Stock','Adjustment Type','Adjustment Qty','Revised Stock','UOM','Reason','Created By','Created Date','Status','Approved / Rejected By','Approval Date','Actions'].map((v) => <th key={v}>{v}</th>)}</tr></thead><tbody>
        {records.map((v) => <tr key={v.id}><td>{v.adjustment_number}</td><td>{displayDate(v.adjustment_date)}</td><td>{v.material_type}</td><td title={`${v.item_name} ${v.paper_type}`}>{v.material_no}<br/><small>{v.reel_number}</small></td><td>{number(v.current_stock_snapshot)}</td><td>{v.adjustment_type === 'INCREASE' ? 'Increase' : 'Decrease'}</td><td>{number(v.adjustment_qty)}</td><td>{number(v.revised_stock_snapshot)}</td><td>{v.uom}</td><td>{v.reason}</td><td>{v.created_by_name}</td><td>{formatIstDateTime(new Date(v.created_at))}</td><td><span className={`stock-status ${v.status.toLowerCase()}`}>{v.status.replace('_', ' ')}</span></td><td>{v.approved_by_name || v.rejected_by_name || '—'}</td><td>{v.approved_at ? formatIstDateTime(new Date(v.approved_at)) : v.rejected_at ? formatIstDateTime(new Date(v.rejected_at)) : '—'}</td><td><div className="stock-row-actions"><button title="View" onClick={() => openRecord(v, true)}><Eye size={13}/></button>{v.can_edit === 1 && <button title="Edit" onClick={() => openRecord(v)}><Save size={13}/></button>}{v.status === 'PENDING_APPROVAL' && userRole === 'SUPERADMIN' && <><button className="approve" title="Approve" onClick={() => void approve(v)}><Check size={13}/></button><button className="reject" title="Reject" onClick={() => void reject(v)}><X size={13}/></button></>}</div></td></tr>)}
        {!records.length && <tr><td className="empty" colSpan={16}>No Stock Adjustments found.</td></tr>}
      </tbody></table></div></section>
    </>}
    {showForm && <form className="stock-adjustment-form" onSubmit={(e) => { e.preventDefault(); void submit('save_draft') }}>
      <header><div><h3>{viewOnly ? 'View' : form.id ? 'Edit' : 'New'} Stock Adjustment</h3><p>Stock changes only after explicit SUPERADMIN approval.</p></div><button type="button" className="icon" onClick={() => setShowForm(false)}><X size={15}/></button></header>
      <div className="stock-form-grid">
        <label><span>Adjustment No.</span><input readOnly className="readonly" value={form.id ? records.find((v) => v.id === form.id)?.adjustment_number ?? '' : ''} placeholder="Auto-generated on save"/></label>
        <label><span>Adjustment Date *</span><input type="date" required disabled={viewOnly} value={form.adjustmentDate} onChange={(e) => setForm({ ...form, adjustmentDate: e.target.value })}/></label>
        <label><span>Material Type *</span><select disabled={viewOnly} value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value, stockId: '' })}><option>Paper</option></select></label>
        <label className="wide"><span>Material / Reel *</span><select disabled={viewOnly} value={form.stockId} onChange={(e) => setForm({ ...form, stockId: e.target.value })}><option value="">Select Material / Reel</option>{stocks.filter((v) => v.material_type === form.materialType).map((v) => <option key={v.id} value={v.id}>{materialLabel(v)}</option>)}</select></label>
        <label><span>Location / Warehouse</span><input readOnly className="readonly" value={selectedStock?.location_name || 'Not configured'}/></label>
        <label><span>Current Stock</span><input readOnly className="readonly" value={selectedStock ? number(current) : ''}/></label>
        <label><span>UOM</span><input readOnly className="readonly" value={selectedStock?.uom ?? ''}/></label>
        <label><span>Adjustment Type *</span><select disabled={viewOnly} value={form.adjustmentType} onChange={(e) => setForm({ ...form, adjustmentType: e.target.value })}><option value="">Select Type</option><option value="INCREASE">Increase</option><option value="DECREASE">Decrease</option></select></label>
        <label><span>Adjustment Quantity *</span><input className="no-spinner" type="number" min="0.001" step="any" disabled={viewOnly} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}/></label>
        <label><span>Revised Stock</span><input readOnly className={`readonly${revised < 0 ? ' invalid' : ''}`} value={selectedStock ? number(revised) : ''}/></label>
        <label><span>Reason *</span><select disabled={viewOnly} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value, otherReason: '' })}><option value="">Select Reason</option>{reasons.map((v) => <option key={v}>{v}</option>)}</select></label>
        {form.reason === 'Other' && <label><span>Other Reason *</span><input disabled={viewOnly} value={form.otherReason} onChange={(e) => setForm({ ...form, otherReason: e.target.value })}/></label>}
        <label className="full"><span>Remarks *</span><textarea disabled={viewOnly} rows={3} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}/></label>
        <label className="full"><span>Supporting Document / Photo</span><input type="file" disabled={viewOnly} accept="image/*,.pdf" onChange={(e) => setForm({ ...form, attachment: e.target.files?.[0] ?? null })}/><small>Metadata only; file content is not uploaded until persistent file storage is configured.</small></label>
      </div>
      <footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>{!viewOnly && <><button type="submit" disabled={busy}><Save size={13}/> Save Draft</button><button type="button" disabled={busy} onClick={() => void submit('submit')}><Send size={13}/> Submit for Approval</button></>}</footer>
    </form>}
  </div>
}
