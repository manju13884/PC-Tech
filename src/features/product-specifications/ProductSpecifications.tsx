import { useEffect, useState, type FormEvent } from 'react'
import { CircleCheck, Pencil, Plus, Save, X } from 'lucide-react'
import { getCustomers, type Customer } from '../../customerService'
import { getItems, type Item } from '../../itemService'
import './product-specifications.css'

type PaperLayer = {
  layer_name: string; paper_grade: string; gsm: string; bf_rct: string
  shade: string; flute: string
}
type FormState = {
  specification_name: string; polar_canvas_item_code: string
  specification_type: string; length_mm: string; width_mm: string; height_mm: string
  ply: string; gsm: string; bf: string; print_required: boolean; print_colors: string; notes: string
  flute_type: string; paper_type: string; material: string; shade_color: string
  finish: string; thickness_micron: string; roll_length_m: string; joint_type: string
  paper_layers: PaperLayer[]
}
const emptyForm: FormState = {
  specification_name: '', polar_canvas_item_code: '', specification_type: 'GENERAL', length_mm: '', width_mm: '', height_mm: '', ply: '', gsm: '', bf: '',
  print_required: false, print_colors: '', notes: '', flute_type: '', paper_type: '', material: '',
  shade_color: '', finish: '', thickness_micron: '', roll_length_m: '', joint_type: '',
  paper_layers: [],
}
type Specification = Omit<FormState, 'print_required'> & {
  id: number; customer_id: string; customer_name: string; item_id: string; item_name: string
  item_sku: string; print_required: boolean | number; updated_at: string; attributes_json?: string
}

const attributeKeys = ['flute_type', 'paper_type', 'material', 'shade_color', 'finish', 'thickness_micron', 'roll_length_m', 'joint_type'] as const
type AttributeFields = Pick<FormState, (typeof attributeKeys)[number]>
const emptyAttributes = Object.fromEntries(attributeKeys.map((key) => [key, ''])) as AttributeFields
function readAttributes(value?: string): AttributeFields & { paper_layers: PaperLayer[] } {
  try {
    const parsed: unknown = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object') return { ...emptyAttributes, paper_layers: [] }
    const record = parsed as Record<string, unknown>
    const paperLayers = Array.isArray(record.paper_layers) ? record.paper_layers
      .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object')
      .map((layer) => ({
        layer_name: String(layer.layer_name ?? ''),
        paper_grade: String(layer.paper_grade ?? layer.paper_type ?? ''),
        gsm: String(layer.gsm ?? ''),
        bf_rct: String(layer.bf_rct ?? layer.bf ?? ''),
        shade: String(layer.shade ?? ''),
        flute: String(layer.flute ?? ''),
      })) : []
    return { ...Object.fromEntries(attributeKeys.map((key) => [key, String(record[key] ?? '')])) as AttributeFields, paper_layers: paperLayers }
  } catch { return { ...emptyAttributes, paper_layers: [] } }
}

const paperCompositionByPly: Record<string, string[]> = {
  '2': ['Liner', 'Fluting'],
  '3': ['Top Liner', 'Fluting', 'Bottom Liner'],
  '5': ['Top Liner', 'Fluting 1', 'Middle Liner', 'Fluting 2', 'Bottom Liner'],
  '7': ['Top', 'Fluting 1', 'Liner 1', 'Fluting 2', 'Liner 2', 'Fluting 3', 'Bottom'],
  '9': ['Top', 'Fluting 1', 'Liner 1', 'Fluting 2', 'Liner 2', 'Fluting 3', 'Liner 3', 'Fluting 4', 'Bottom'],
}

function buildPaperLayers(ply: string, current: PaperLayer[]): PaperLayer[] {
  return (paperCompositionByPly[ply] ?? []).map((layerName, index) => ({
    layer_name: layerName,
    paper_grade: current[index]?.paper_grade ?? '',
    gsm: current[index]?.gsm ?? '',
    bf_rct: current[index]?.bf_rct ?? '',
    shade: current[index]?.shade ?? '',
    flute: layerName.toLowerCase().includes('fluting') ? current[index]?.flute ?? '' : '',
  }))
}

function detectType(item?: Item): string {
  const value = `${item?.item_name ?? ''} ${item?.description ?? ''}`.toLowerCase()
  if (/box|carton/.test(value)) return 'BOX'
  if (/board|sheet/.test(value)) return 'BOARD / SHEET'
  if (/stretch|film|shrink/.test(value)) return 'FILM'
  if (/tape/.test(value)) return 'TAPE'
  if (/roll|paper|reel/.test(value)) return 'PAPER / ROLL'
  return 'GENERAL'
}

function specificationSize(specification: Specification): string {
  const value = (input: string | number | null | undefined) => input == null || input === '' ? '' : String(input)
  const length = value(specification.length_mm)
  const width = value(specification.width_mm)
  const height = value(specification.height_mm)
  if (specification.specification_type === 'BOX') return [length, width, height].filter(Boolean).join(' × ') + (length || width || height ? ' mm' : '') || '—'
  if (specification.specification_type === 'BOARD / SHEET') return [length, width].filter(Boolean).join(' × ') + (length || width ? ' mm' : '') || '—'
  const attributes = readAttributes(specification.attributes_json)
  const parts = [width ? `${width} mm wide` : '', attributes.thickness_micron ? `${attributes.thickness_micron} μ` : '', attributes.roll_length_m ? `${attributes.roll_length_m} m roll` : ''].filter(Boolean)
  return parts.join(' · ') || '—'
}

export default function ProductSpecifications() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [customerId, setCustomerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [specifications, setSpecifications] = useState<Specification[]>([])
  const [showForm, setShowForm] = useState(false)
  const [listCustomerId, setListCustomerId] = useState('')
  const [listItemId, setListItemId] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const customer = customers.find((value) => value.customer_id === customerId)
  const item = items.find((value) => value.item_id === itemId)
  const displayedSpecifications = listCustomerId
    ? specifications.filter((specification) => specification.customer_id === listCustomerId && (!listItemId || specification.item_id === listItemId))
    : []
  const showsHeight = form.specification_type === 'BOX'
  const showsDimensions = form.specification_type === 'BOX' || form.specification_type === 'BOARD / SHEET'
  const showsBoardFields = form.specification_type === 'BOX' || form.specification_type === 'BOARD / SHEET'
  const showsRollFields = form.specification_type === 'PAPER / ROLL'
  const showsFlexibleFields = form.specification_type === 'TAPE' || form.specification_type === 'FILM'

  const loadSpecifications = async () => {
    const response = await fetch('/api/product-specifications', { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to load product specifications.')
    const payload = await response.json() as { specifications?: Specification[] }
    setSpecifications(Array.isArray(payload.specifications) ? payload.specifications : [])
  }

  useEffect(() => {
    Promise.allSettled([getCustomers(), getItems(), loadSpecifications()])
      .then(([customerResult, itemResult, specificationResult]) => {
        if (customerResult.status === 'fulfilled') setCustomers(customerResult.value)
        if (itemResult.status === 'fulfilled') setItems(itemResult.value)
        const failures = [customerResult, itemResult, specificationResult]
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failures.length > 0) {
          const reason = failures[0].reason
          setError(reason instanceof Error ? reason.message : 'Some product specification data could not be loaded.')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const update = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const updatePly = (ply: string) => setForm((current) => ({ ...current, ply, paper_layers: buildPaperLayers(ply, current.paper_layers) }))
  const updatePaperLayer = (index: number, key: keyof Omit<PaperLayer, 'layer_name'>, value: string) => setForm((current) => ({
    ...current,
    paper_layers: current.paper_layers.map((layer, layerIndex) => layerIndex === index ? { ...layer, [key]: value } : layer),
  }))
  const startAdd = () => {
    if (!listCustomerId || !listItemId) { setError('Select a customer and item before adding a specification.'); return }
    const nextRecordId = specifications.reduce((maximum, value) => Math.max(maximum, value.id), 0) + 1
    const nextItemCode = `PC-${String(nextRecordId).padStart(4, '0')}`
    setEditingId(null); setCustomerId(listCustomerId); setItemId(listItemId); setForm({ ...emptyForm, polar_canvas_item_code: nextItemCode, specification_type: detectType(items.find((value) => value.item_id === listItemId)) }); setMessage(''); setError(''); setShowForm(true)
  }
  const edit = (specification: Specification) => {
    setEditingId(specification.id); setListCustomerId(specification.customer_id); setListItemId(specification.item_id); setCustomerId(specification.customer_id); setItemId(specification.item_id); setShowForm(true); setMessage(''); setError('')
    setForm({
      specification_name: specification.specification_name,
      polar_canvas_item_code: specification.polar_canvas_item_code,
      specification_type: specification.specification_type || 'GENERAL',
      length_mm: specification.length_mm?.toString() ?? '', width_mm: specification.width_mm?.toString() ?? '',
      height_mm: specification.height_mm?.toString() ?? '', ply: specification.ply?.toString() ?? '',
      gsm: specification.gsm?.toString() ?? '', bf: specification.bf?.toString() ?? '',
      print_required: specification.print_required === true || specification.print_required === 1,
      print_colors: specification.print_colors ?? '', notes: specification.notes ?? '',
      ...readAttributes(specification.attributes_json),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!customer || !item) return
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/product-specifications', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editingId, customer_id: customer.customer_id, customer_name: customer.customer_name, item_id: item.item_id, item_name: item.item_name, item_sku: item.sku }),
      })
      const responseText = await response.text()
      let payload: { error?: string; specification?: { id?: number; polar_canvas_item_code?: string } }
      try {
        payload = JSON.parse(responseText) as typeof payload
      } catch {
        throw new Error('The specification service returned an invalid response. Please retry after refreshing the page.')
      }
      if (!response.ok) throw new Error(payload.error || 'Unable to save specification.')
      if (payload.specification?.id) setEditingId(payload.specification.id)
      if (payload.specification?.polar_canvas_item_code) setForm((current) => ({ ...current, polar_canvas_item_code: payload.specification?.polar_canvas_item_code ?? '' }))
      setMessage('Product specification saved successfully.')
      await loadSpecifications()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save specification.') }
    finally { setSaving(false) }
  }

  return <form className="coc-form product-spec-form" onSubmit={save}>
    <div className="product-spec-toolbar"><div><strong>Product Specification Master</strong>{listCustomerId && <span>{displayedSpecifications.length} record{displayedSpecifications.length === 1 ? '' : 's'}</span>}</div></div>
    <section className="product-spec-filterbar">
      <label><span>Customer</span><select value={listCustomerId} onChange={(event) => { setListCustomerId(event.target.value); setListItemId(''); setShowForm(false) }}><option value="">Select customer</option>{customers.map((value) => <option key={value.customer_id} value={value.customer_id}>{value.customer_name}</option>)}</select></label>
      <label><span>Item</span><select value={listItemId} onChange={(event) => { setListItemId(event.target.value); setShowForm(false) }}><option value="">All items</option>{items.map((value) => <option key={value.item_id} value={value.item_id}>{value.item_name}{value.sku ? ` (${value.sku})` : ''}</option>)}</select></label>
      <button type="button" onClick={startAdd}><Plus size={15} /> Add Specification</button>
    </section>
    {showForm && <>
    <section className="product-spec-panel product-spec-editor-heading">
      <div className="product-spec-form-title"><strong>{editingId ? 'Edit Specification' : 'Add Specification'}</strong><button type="button" onClick={() => setShowForm(false)} aria-label="Close form"><X size={15} /></button></div>
      <div className="product-spec-editor-context"><span>Customer<strong>{customer?.customer_name}</strong></span><span>Item<strong>{item?.item_name}{item?.sku ? ` (${item.sku})` : ''}</strong></span></div>
    </section>
    {customer && item && <section className="product-spec-panel product-spec-technical">
      <header><div><h3>Technical Specification</h3><p>Fields are adapted to the selected item design.</p></div><span className="spec-type-badge">{form.specification_type}</span></header>
      <div className="product-spec-grid">
        <label>Polar Canvas Item Code<input value={form.polar_canvas_item_code} readOnly aria-readonly="true" /></label>
        <label>Design Type <select value={form.specification_type} onChange={(e) => update('specification_type', e.target.value)}><option>BOX</option><option>BOARD / SHEET</option><option>PAPER / ROLL</option><option>TAPE</option><option>FILM</option><option>GENERAL</option></select></label>
        {showsDimensions && <label>Length (mm)<input type="number" min="0" step="0.01" value={form.length_mm} onChange={(e) => update('length_mm', e.target.value)} /></label>}
        {(showsDimensions || showsFlexibleFields || showsRollFields) && <label>{showsRollFields ? 'Deckle / Width (mm)' : 'Width (mm)'}<input type="number" min="0" step="0.01" value={form.width_mm} onChange={(e) => update('width_mm', e.target.value)} /></label>}
        {showsHeight && <label>Height (mm)<input type="number" min="0" step="0.01" value={form.height_mm} onChange={(e) => update('height_mm', e.target.value)} /></label>}
        {showsBoardFields && <label>Ply<select value={form.ply} onChange={(e) => updatePly(e.target.value)}><option value="">Select ply</option><option value="2">2 Ply</option><option value="3">3 Ply</option><option value="5">5 Ply</option><option value="7">7 Ply</option><option value="9">9 Ply</option></select></label>}
        {showsRollFields && <label>GSM<input type="number" min="0" step="0.01" value={form.gsm} onChange={(e) => update('gsm', e.target.value)} /></label>}
        {showsRollFields && <label>BF/RCT<input type="number" min="0" step="0.01" value={form.bf} onChange={(e) => update('bf', e.target.value)} /></label>}
        {showsRollFields && <label>Paper Grade<input value={form.paper_type} onChange={(e) => update('paper_type', e.target.value)} placeholder="Kraft / Test liner" /></label>}
        <label>Material<input value={form.material} onChange={(e) => update('material', e.target.value)} /></label>
        {(showsRollFields || showsFlexibleFields || form.specification_type === 'GENERAL') && <label>Colour / Shade<input value={form.shade_color} onChange={(e) => update('shade_color', e.target.value)} /></label>}
        {showsFlexibleFields && <label>Thickness (micron)<input type="number" min="0" step="0.01" value={form.thickness_micron} onChange={(e) => update('thickness_micron', e.target.value)} /></label>}
        {(showsFlexibleFields || showsRollFields) && <label>Roll Length (m)<input type="number" min="0" step="0.01" value={form.roll_length_m} onChange={(e) => update('roll_length_m', e.target.value)} /></label>}
        {showsHeight && <label>Joint Type<select value={form.joint_type} onChange={(e) => update('joint_type', e.target.value)}><option value="">Select joint</option><option value="Glue">Glue</option><option value="Stitch">Stitch</option><option value="Brass Pinning">Brass Pinning</option><option value="SS Pinning">SS Pinning</option><option value="GI Pinning">GI Pinning</option><option value="Glue & Stitch">Glue &amp; Stitch</option><option value="Self Lock">Self Lock</option><option value="Not Applicable">Not Applicable</option>{form.joint_type && !['Glue', 'Stitch', 'Brass Pinning', 'SS Pinning', 'GI Pinning', 'Glue & Stitch', 'Self Lock', 'Not Applicable'].includes(form.joint_type) && <option value={form.joint_type}>{form.joint_type}</option>}</select></label>}
        <label>Finish<select value={form.finish} onChange={(e) => update('finish', e.target.value)}><option value="">Select finish</option><option value="Normal">Normal</option><option value="Gloss Lamination">Gloss Lamination</option><option value="Matt Lamination">Matt Lamination</option><option value="Varnish">Varnish</option><option value="UV Coating">UV Coating</option><option value="Water Resistant">Water Resistant</option><option value="Not Applicable">Not Applicable</option>{form.finish && !['Normal', 'Gloss Lamination', 'Matt Lamination', 'Varnish', 'UV Coating', 'Water Resistant', 'Not Applicable'].includes(form.finish) && <option value={form.finish}>{form.finish}</option>}</select></label>
        {form.specification_type !== 'PAPER / ROLL' && <label>Print<select value={form.print_required ? 'YES' : 'NO'} onChange={(e) => update('print_required', e.target.value === 'YES')}><option>NO</option><option>YES</option></select></label>}
        {form.print_required && <label>Print Colours<input value={form.print_colors} onChange={(e) => update('print_colors', e.target.value)} placeholder="e.g. 2 colours" /></label>}
        <label className="spec-notes">Specification Notes<textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Add material, flute, tolerance or finishing instructions" /></label>
      </div>
      {showsBoardFields && form.paper_layers.length > 0 && <div className="paper-composition">
        <div className="paper-composition-heading"><strong>Paper Composition · {form.ply} Ply</strong><span>{form.paper_layers.map((layer) => layer.layer_name).join(' + ')}</span></div>
        <div className="paper-composition-table"><table><thead><tr><th>#</th><th>Layer Type</th><th>GSM</th><th>BF/RCT</th><th>Shade</th><th>Paper Grade</th><th>Flute</th></tr></thead><tbody>
          {form.paper_layers.map((layer, index) => {
            const isFluting = layer.layer_name.toLowerCase().includes('fluting')
            return <tr key={`${layer.layer_name}-${index}`}><td>{index + 1}</td><td><strong>{layer.layer_name}</strong></td><td><input type="number" min="0" step="0.01" value={layer.gsm} onChange={(e) => updatePaperLayer(index, 'gsm', e.target.value)} placeholder="GSM" /></td><td><input type="number" min="0" step="0.01" value={layer.bf_rct} onChange={(e) => updatePaperLayer(index, 'bf_rct', e.target.value)} placeholder="BF / RCT" /></td><td><select value={layer.shade} onChange={(e) => updatePaperLayer(index, 'shade', e.target.value)}><option value="">Select</option><option value="GYT">GYT</option><option value="Natural">Natural</option><option value="White">White</option></select></td><td><input value={layer.paper_grade} onChange={(e) => updatePaperLayer(index, 'paper_grade', e.target.value)} placeholder={isFluting ? 'Fluting medium' : 'Kraft liner'} /></td><td>{isFluting ? <select value={layer.flute} onChange={(e) => updatePaperLayer(index, 'flute', e.target.value)}><option value="">Select</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="E">E</option><option value="F">F</option></select> : <span className="not-applicable">—</span>}</td></tr>
          })}
        </tbody></table></div>
      </div>}
      <footer><div>{error && <span className="spec-error">{error}</span>}{message && <span className="spec-success"><CircleCheck size={14} />{message}</span>}</div><button type="submit" disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save Specification'}</button></footer>
    </section>}
    {error && !item && <p className="spec-error">{error}</p>}
    </>}
    <section className="product-spec-list product-spec-panel">
      <header><div><h3>Saved Specifications</h3><p>Customer-wise specifications. Items are available irrespective of the selected customer.</p></div></header>
      <div className="product-spec-table-wrap"><table><thead><tr><th>#</th><th>PC Item Code</th><th>Item</th><th>Size</th><th>Type</th><th>GSM</th><th>BF</th><th>Print</th><th>Updated</th><th aria-label="Actions" /></tr></thead><tbody>
        {displayedSpecifications.map((specification, index) => <tr key={specification.id}><td>{index + 1}</td><td><strong>{specification.polar_canvas_item_code}</strong></td><td><strong>{specification.item_name}</strong>{specification.item_sku && <small>{specification.item_sku}</small>}</td><td>{specificationSize(specification)}</td><td><span className="spec-type-badge">{specification.specification_type}</span></td><td>{['BOX', 'BOARD / SHEET'].includes(specification.specification_type) ? 'Layer-wise' : specification.gsm ?? '—'}</td><td>{['BOX', 'BOARD / SHEET'].includes(specification.specification_type) ? 'Layer-wise' : specification.bf ?? '—'}</td><td>{specification.print_required ? 'Yes' : 'No'}</td><td>{new Date(specification.updated_at).toLocaleString('en-IN')}</td><td><button type="button" className="spec-edit-button" onClick={() => edit(specification)}><Pencil size={13} /> Edit</button></td></tr>)}
        {!loading && !listCustomerId && <tr><td colSpan={10} className="product-spec-empty">Select a customer to display saved specifications.</td></tr>}
        {!loading && listCustomerId && displayedSpecifications.length === 0 && <tr><td colSpan={10} className="product-spec-empty">No product specifications are saved for this customer.</td></tr>}
      </tbody></table></div>
    </section>
  </form>
}
