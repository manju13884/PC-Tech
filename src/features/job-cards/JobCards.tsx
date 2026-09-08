import { ClipboardPlus, FilterX, Printer, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatIstDate } from '../../utils/dateTimeFormatting'
import './job-cards.css'

interface PaperLayer {
  layer_name?: string; paper_grade?: string; gsm?: string; bf_rct?: string
  deckle_size?: string; shade?: string; flute?: string
}
interface JobCardLine {
  production_plan_line_id: number; job_card_id: number | null; job_number: string | null
  job_status: string | null; job_created_at: string | null; plan_number: string; plan_date: string
  plan_status: string; plan_remarks: string; customer_name: string; sales_order_number: string
  delivery_date: string; item_name: string; item_description: string; customer_po_number: string
  production_quantity: number; two_ply_quantity: number | null; deckle_size: string; uom: string
  product_type: string; ply: number | null; specification_code: string; product_name: string
  length_mm: number | null; width_mm: number | null; height_mm: number | null
  print_required: number; print_colors: string; specification_notes: string; attributes_json: string
}

const numberText = (value: number | null | undefined) => value == null ? '' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const readAttributes = (line: JobCardLine): { paper_layers?: PaperLayer[]; production_stages?: string[]; board_type?: string } => {
  try { return JSON.parse(line.attributes_json || '{}') as { paper_layers?: PaperLayer[]; production_stages?: string[]; board_type?: string } }
  catch { return {} }
}
const calculated = (line: JobCardLine) => {
  const layers = readAttributes(line).paper_layers ?? []
  const deckle = Number(line.deckle_size || layers.find((layer) => layer.deckle_size)?.deckle_size || ((line.width_mm ?? 0) + (line.height_mm ?? 0) + 20))
  const rotary = line.length_mm != null && line.width_mm != null ? (2 * line.length_mm) + (2 * line.width_mm) + 50 : 0
  const boardGsm = layers.every((layer) => Number(layer.gsm) > 0)
    ? layers.reduce((sum, layer) => sum + Number(layer.gsm), 0) : 0
  const boxWeight = deckle > 0 && rotary > 0 && boardGsm > 0 ? (deckle * rotary * boardGsm * 1.05) / 1_000_000 : 0
  const bs = layers.every((layer) => Number(layer.gsm) > 0 && Number(layer.bf_rct) > 0)
    ? layers.reduce((sum, layer) => sum + (Number(layer.gsm) * Number(layer.bf_rct) / 1000), 0) : 0
  return { layers, deckle, rotary, boxWeight, bs }
}

export default function JobCards() {
  const [lines, setLines] = useState<JobCardLine[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'ready' | 'created'>('ready')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/job-cards', { credentials: 'include' })
      const data = await response.json().catch(() => ({})) as { lines?: JobCardLine[]; error?: string }
      if (response.status === 401) window.dispatchEvent(new Event('pc-tech-session-expired'))
      if (!response.ok) throw new Error(data.error || 'Unable to load Job Cards.')
      setLines(Array.isArray(data.lines) ? data.lines : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load Job Cards.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return lines.filter((line) => Boolean(line.job_card_id) === (view === 'created') && (!term ||
      `${line.job_number} ${line.plan_number} ${line.sales_order_number} ${line.customer_name} ${line.product_name} ${line.item_description}`.toLowerCase().includes(term)))
  }, [lines, search, view])
  const selectedLines = lines.filter((line) => selected.includes(line.production_plan_line_id))
  const createCards = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/job-cards', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineIds: selected }) })
      const data = await response.json().catch(() => ({})) as { lines?: JobCardLine[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to create Job Cards.')
      setLines(Array.isArray(data.lines) ? data.lines : []); setView('created')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create Job Cards.') }
    finally { setBusy(false) }
  }
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const printSelected = () => {
    const previousTitle = document.title
    document.title = selectedLines.length === 1 && selectedLines[0].job_number
      ? selectedLines[0].job_number
      : `Production-Job-Cards-${selectedLines.length}`
    window.addEventListener('afterprint', () => { document.title = previousTitle }, { once: true })
    window.print()
  }

  return <div className="production-planning-workspace production-planned-workspace job-cards-workspace">
    {error && <p className="production-planning-message is-error job-cards-message" role="alert">{error}<button type="button" onClick={load}><RefreshCw size={13} /> Retry</button></p>}
    <div className="production-planned-toolbar job-cards-toolbar">
      <div className="production-planned-title"><ClipboardPlus size={15} /><strong>Production Job Cards</strong><span>{filtered.length} production items</span></div>
      <div className="production-planned-controls job-cards-actions">
        <input aria-label="Search Job Cards" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, plan, SO, customer, product" />
        <select aria-label="Job Card view" value={view} onChange={(event) => { setView(event.target.value as 'ready' | 'created'); setSelected([]) }}><option value="ready">Ready to Create</option><option value="created">Created Job Cards</option></select>
        <button type="button" aria-label="Clear filters" title="Clear filters" onClick={() => { setSearch(''); setView('ready'); setSelected([]) }}><FilterX size={14} /></button>
        <button type="button" aria-label="Refresh Job Cards" title="Refresh" disabled={loading} onClick={load}><RefreshCw size={14} /></button>
        {view === 'ready' ? <button className="job-cards-primary" type="button" disabled={!selected.length || busy} onClick={createCards}><ClipboardPlus size={14} />{busy ? 'Creating...' : `Create Job Cards (${selected.length})`}</button>
          : <button className="job-cards-primary" type="button" disabled={!selectedLines.length} onClick={printSelected}><Printer size={14} /> Print Selected ({selectedLines.length})</button>}
      </div>
    </div>
    <section className="production-selection-panel production-planned-grid-panel job-cards-list"><div className="job-cards-table-scroll"><table><colgroup><col className="job-grid-select" /><col className="job-grid-id" /><col className="job-grid-status" /><col className="job-grid-date" /><col className="job-grid-plan" /><col className="job-grid-order" /><col className="job-grid-item" /><col className="job-grid-customer" /><col className="job-grid-product-name" /><col className="job-grid-product-description" /><col className="job-grid-qty" /></colgroup><thead><tr className="job-cards-groups"><th rowSpan={2}><input aria-label="Select all" type="checkbox" checked={filtered.length > 0 && filtered.every((line) => selected.includes(line.production_plan_line_id))} onChange={() => setSelected(filtered.every((line) => selected.includes(line.production_plan_line_id)) ? [] : filtered.map((line) => line.production_plan_line_id))} /></th><th className="group-job" colSpan={2}>Job Card</th><th className="group-schedule" colSpan={2}>Schedule</th><th className="group-order" colSpan={2}>Order &amp; Item</th><th className="group-customer">Customer</th><th className="group-product" colSpan={2}>Product</th><th className="group-production">Production</th></tr><tr><th>Job ID</th><th>Status</th><th>Production Date</th><th>Plan</th><th>Sales Order</th><th>PC Item Code</th><th>Customer</th><th>Product Name</th><th>Product Description</th><th>Box Qty</th></tr></thead><tbody>
      {filtered.map((line) => <tr key={line.production_plan_line_id} className={selected.includes(line.production_plan_line_id) ? 'is-selected' : ''}><td><input aria-label={`Select ${line.job_number || line.sales_order_number}`} type="checkbox" checked={selected.includes(line.production_plan_line_id)} onChange={() => toggle(line.production_plan_line_id)} /></td><td><strong>{line.job_number || 'Not created'}</strong></td><td><span className={line.job_card_id ? 'created' : 'ready'}>{line.job_status || 'READY'}</span></td><td>{formatIstDate(line.plan_date)}</td><td>{line.plan_number}</td><td><strong>{line.sales_order_number}</strong></td><td>{line.specification_code}</td><td>{line.customer_name}</td><td className="job-cards-product">{line.product_name}</td><td className="job-cards-product">{line.item_description || line.item_name}</td><td className="numeric job-cards-box-qty">{numberText(line.production_quantity)}</td></tr>)}
      {!loading && !filtered.length && <tr><td colSpan={11} className="job-cards-empty">{view === 'ready' ? 'No Production Planned items are waiting for Job Cards.' : 'No Job Cards have been created.'}</td></tr>}
      {loading && <tr><td colSpan={11} className="job-cards-empty">Loading Production Planned items...</td></tr>}
    </tbody></table></div><footer><span>{selected.length} selected</span><span>{filtered.length} production items</span></footer></section>
    <div className="job-card-print-area">{selectedLines.filter((line) => line.job_card_id).map((line) => <JobCard key={line.production_plan_line_id} line={line} />)}</div>
  </div>
}

function JobCard({ line }: { line: JobCardLine }) {
  const { layers, deckle, rotary, boxWeight, bs } = calculated(line)
  const stages = readAttributes(line).production_stages ?? []
  const size = [line.length_mm, line.width_mm, line.height_mm].filter((value) => value != null).join(' X ')
  const sizeCm = [line.length_mm, line.width_mm, line.height_mm].filter((value) => value != null).map((value) => numberText(Number(value) / 10)).join(' X ')
  const shades = [...new Set(layers.map((layer) => layer.shade).filter(Boolean))].join(' / ')
  return <article className="job-card-sheet">
    <header><img className="job-card-logo" src="/assets/PC-Bord-Logo-only-transparent.png" alt="Polarcanvas" /><h1 className="job-card-heading">PRODUCTION JOB CARD</h1><strong>Job Card: {line.job_number}</strong></header>
    <table className="job-card-master"><colgroup><col className="job-card-label-column" /><col className="job-card-value-column" /><col className="job-card-label-column" /><col className="job-card-value-column" /><col className="job-card-label-column" /><col className="job-card-value-column" /><col className="job-card-label-column" /><col className="job-card-value-column" /></colgroup><tbody>
      <tr><th>Job ID</th><td>{line.job_number}</td><th>PC Item Code</th><td>{line.specification_code}</td><th>Date</th><td>{formatIstDate(line.plan_date)}</td><th>Time</th><td></td></tr>
      <tr><th>Customer Name</th><td colSpan={3}>{line.customer_name}</td><th>Printing</th><td colSpan={3}>{line.print_required ? 'Printing Required' : 'No Printing'}</td></tr>
      <tr><th>Product Spec</th><td colSpan={3}>{line.item_description || line.item_name}</td><th>No. of Color</th><td>{line.print_colors || '0'}</td><th>Color</th><td>{line.print_colors || shades}</td></tr>
      <tr><th>No. of Ply</th><td>{line.ply ? `${line.ply} Ply` : ''}</td><th>Box Wt.</th><td>{boxWeight ? numberText(boxWeight) : ''}</td><th>Lamination (Size)</th><td colSpan={2}></td><th>Req. Qty (Kg)</th></tr>
      <tr><th>Box Size (OD)</th><td colSpan={3}>{size ? `${size} mm | ${sizeCm} cm` : ''}</td><th>Metpad (Size)</th><td colSpan={3}></td></tr>
      <tr><th>Sheet Size</th><td colSpan={3}>{deckle && rotary ? `${numberText(deckle)} X ${numberText(rotary)} mm | ${numberText(deckle / 10)} X ${numberText(rotary / 10)} cm` : ''}</td><th>Window (Size)</th><td colSpan={3}></td></tr>
      <tr><th>Rotary Size</th><td colSpan={2}>{line.length_mm != null && line.width_mm != null ? `${2 * line.length_mm} + ${2 * line.width_mm} + 50 = ${numberText(rotary)}` : ''}</td><th>BS</th><td>{bs ? numberText(bs) : ''}</td><th>UV / Dripoff / Varnish</th><td colSpan={2}></td></tr>
      <tr><th>Job Remarks</th><td colSpan={3}>{line.plan_remarks || line.specification_notes}</td><th>Die No.</th><td></td><th>Art Work No.</th><td></td></tr>
      <tr><th>Box Qty</th><td>{numberText(line.production_quantity)}</td><th>Box/Board</th><td>1.0</td><th>Sales Order</th><td>{line.sales_order_number}</td><th>Delivery</th><td>{formatIstDate(line.delivery_date)}</td></tr>
      <tr><th>Board Qty</th><td>{numberText(line.production_quantity)}</td><th>Paper Ups</th><td>1</td><th>Corr. Ups</th><td>1</td><th>Customer PO</th><td>{line.customer_po_number}</td></tr>
    </tbody></table>
    <h2 className="job-card-heading">REQUIRED ITEM</h2>
    <table className="job-card-items"><colgroup><col className="job-card-col-serial" /><col className="job-card-col-layer" /><col /><col /><col /><col className="job-card-col-small" /><col className="job-card-col-small" /><col /><col /></colgroup><thead><tr><th>S.N</th><th>Layers</th><th>Size (MM)</th><th>Req. Size (CM)</th><th>Color</th><th>GSM</th><th>BF</th><th>Qty</th><th>Board Qty</th></tr></thead><tbody>
      {layers.map((layer, index) => <tr key={`${layer.layer_name}-${index}`}><td>{index + 1}</td><td>{layer.layer_name}</td><td>{deckle ? numberText(deckle) : ''}</td><td>{deckle ? numberText(deckle / 10) : ''}</td><td>{layer.shade}</td><td>{layer.gsm}</td><td>{layer.bf_rct}</td><td></td><td>{!layer.flute ? numberText(line.production_quantity) : ''}</td></tr>)}
      {!layers.length && <tr><td colSpan={9}>Paper composition not available.</td></tr>}
    </tbody></table>
    <h2 className="job-card-heading">PROCESS</h2>
    <table className="job-card-process"><colgroup><col className="job-card-col-serial" /><col className="job-card-col-process" /><col className="job-card-col-time" /><col className="job-card-col-time" /><col className="job-card-col-reel" /><col className="job-card-col-weight" /><col className="job-card-col-weight" /><col className="job-card-col-weight" /><col className="job-card-col-qty" /><col className="job-card-col-qty" /><col className="job-card-col-employee" /></colgroup><thead><tr><th>S.N</th><th>Process</th><th>Start Datetime</th><th>End Datetime</th><th>Reel No.</th><th>In Reel Weight</th><th>Out Reel Weight</th><th>Remaining Reel Weight</th><th>In Qty</th><th>Out Qty</th><th>Emp. Name</th></tr></thead><tbody>
      {(stages.length ? stages : ['Paper Cutting', 'Corrugation', 'Pasting', 'Quality Inspection']).map((stage, index) => <tr key={stage}><td>{index + 1}</td><td>{stage}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}
    </tbody></table>
    <footer><span>Supervisor</span><span>Quality</span><span>Dispatch</span><span>Box Wt.</span><span>Manufactured Qty</span></footer>
  </article>
}
