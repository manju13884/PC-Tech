import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, Pencil, Plus, Printer, Save, X } from 'lucide-react'
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
  paper_layers: PaperLayer[]; production_stages: string[]
}
const emptyForm: FormState = {
  specification_name: '', polar_canvas_item_code: '', specification_type: 'GENERAL', length_mm: '', width_mm: '', height_mm: '', ply: '', gsm: '', bf: '',
  print_required: false, print_colors: '', notes: '', flute_type: '', paper_type: '', material: '',
  shade_color: '', finish: '', thickness_micron: '', roll_length_m: '', joint_type: '',
  paper_layers: [], production_stages: [],
}
type Specification = Omit<FormState, 'print_required'> & {
  id: number; customer_id: string; customer_name: string; item_id: string; item_name: string
  item_sku: string; print_required: boolean | number; updated_at: string; attributes_json?: string
}

const attributeKeys = ['flute_type', 'paper_type', 'material', 'shade_color', 'finish', 'thickness_micron', 'roll_length_m', 'joint_type'] as const
type AttributeFields = Pick<FormState, (typeof attributeKeys)[number]>
const emptyAttributes = Object.fromEntries(attributeKeys.map((key) => [key, ''])) as AttributeFields
const productionStageOptions = [
  'Paper Cutting', 'Corrugation', 'Pasting', 'Board / Sheet Cutting', 'Printing', 'RS4',
  'Creasing', 'Slotting', 'Die Cutting', 'Stitching / Gluing', 'Quality Inspection', 'Bundling / Packing',
] as const

function defaultProductionStages(type: string, printRequired: boolean): string[] {
  if (type === 'BOX') return productionStageOptions.filter((stage) => stage !== 'Die Cutting' && (stage !== 'Printing' || printRequired))
  if (type === 'BOARD / SHEET') return ['Paper Cutting', 'Corrugation', 'Pasting', 'Board / Sheet Cutting', 'Quality Inspection', 'Bundling / Packing']
  if (type === 'PAPER / ROLL') return ['Paper Cutting', 'Quality Inspection', 'Bundling / Packing']
  return [...(printRequired ? ['Printing'] : []), 'Quality Inspection', 'Bundling / Packing']
}

function readAttributes(value?: string): AttributeFields & { paper_layers: PaperLayer[]; production_stages: string[] } {
  try {
    const parsed: unknown = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object') return { ...emptyAttributes, paper_layers: [], production_stages: [] }
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
    const productionStages = Array.isArray(record.production_stages)
      ? record.production_stages.filter((stage): stage is string => typeof stage === 'string' && productionStageOptions.includes(stage as typeof productionStageOptions[number]))
      : []
    return { ...Object.fromEntries(attributeKeys.map((key) => [key, String(record[key] ?? '')])) as AttributeFields, paper_layers: paperLayers, production_stages: productionStages }
  } catch { return { ...emptyAttributes, paper_layers: [], production_stages: [] } }
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

function calculatedDeckle(form: FormState): string {
  const width = Number(form.width_mm)
  const height = Number(form.height_mm)
  let deckleMm: number | null = null
  if (form.specification_type === 'BOX' && width > 0 && height > 0) deckleMm = width + height + 20
  if (form.specification_type === 'BOARD / SHEET' && width > 0) deckleMm = width
  if (deckleMm == null) return '—'
  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '')
  return `${format(deckleMm)} mm (${format(deckleMm / 10)} cm)`
}

const fluteDrawRatios: Record<string, number> = { A: 1.45, B: 1.36, C: 1.43, E: 1.225, F: 1.2 }
const calculatedNumber = (value: number, decimals = 2) => Number.isFinite(value)
  ? value.toFixed(decimals).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
  : ''

function calculatedSpecificationValues(form: FormState) {
  const length = Number(form.length_mm)
  const width = Number(form.width_mm)
  const height = Number(form.height_mm)
  const hasBoxDimensions = form.specification_type === 'BOX' && length > 0 && width > 0 && height > 0
  const hasSheetDimensions = form.specification_type === 'BOARD / SHEET' && length > 0 && width > 0
  const rotaryMm = hasBoxDimensions ? (2 * length) + (2 * width) + 50 : hasSheetDimensions ? length : 0
  const deckleMm = hasBoxDimensions ? width + height + 20 : hasSheetDimensions ? width : 0
  const validLayers = form.paper_layers.map((layer) => {
    const isFluting = layer.layer_name.toLowerCase().includes('fluting')
    return { gsm: Number(layer.gsm), bf: Number(layer.bf_rct), ratio: isFluting ? fluteDrawRatios[layer.flute] ?? 0 : 1 }
  })
  const hasCompleteGsm = validLayers.length > 0 && validLayers.every((layer) => layer.gsm > 0 && layer.ratio > 0)
  const hasCompleteBf = validLayers.length > 0 && validLayers.every((layer) => layer.gsm > 0 && layer.bf > 0)
  const boardGsm = hasCompleteGsm ? validLayers.reduce((total, layer) => total + (layer.gsm * layer.ratio), 0) : 0
  const sheetAreaSqM = rotaryMm > 0 && deckleMm > 0 ? (rotaryMm * deckleMm) / 1_000_000 : 0
  const boxWeightG = sheetAreaSqM > 0 && boardGsm > 0 ? sheetAreaSqM * boardGsm * 1.05 : 0
  const burstingStrength = hasCompleteBf
    ? validLayers.reduce((total, layer) => total + ((layer.gsm * layer.bf) / 1000), 0)
    : 0
  return {
    rotarySize: hasBoxDimensions
      ? `${calculatedNumber(2 * length)} + ${calculatedNumber(2 * width)} + 50 = ${calculatedNumber(rotaryMm)} mm (${calculatedNumber(rotaryMm / 10)} cm)`
      : rotaryMm ? `${calculatedNumber(rotaryMm)} mm (${calculatedNumber(rotaryMm / 10)} cm)` : '—',
    sheetSize: rotaryMm && deckleMm ? `${calculatedNumber(rotaryMm)} × ${calculatedNumber(deckleMm)} mm` : '—',
    boxWeight: boxWeightG ? `${calculatedNumber(boxWeightG)} g (${calculatedNumber(boxWeightG / 1000, 3)} kg)` : '—',
    boardGsm: boardGsm ? `${calculatedNumber(boardGsm)} gsm` : '—',
    burstingStrength: burstingStrength ? `${calculatedNumber(burstingStrength)} kg/cm² (est.)` : '—',
    moisture: 'Lab test required',
  }
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
  const [reportOpen, setReportOpen] = useState(false)
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
  const calculatedValues = calculatedSpecificationValues(form)

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
  const updateDesignType = (specificationType: string) => setForm((current) => ({
    ...current,
    specification_type: specificationType,
    production_stages: defaultProductionStages(specificationType, current.print_required),
  }))
  const updatePrintRequired = (printRequired: boolean) => setForm((current) => ({
    ...current,
    print_required: printRequired,
    production_stages: printRequired
      ? current.production_stages.includes('Printing') ? current.production_stages : [...current.production_stages, 'Printing']
      : current.production_stages.filter((stage) => stage !== 'Printing'),
  }))
  const toggleProductionStage = (stage: string) => setForm((current) => ({
    ...current,
    production_stages: current.production_stages.includes(stage)
      ? current.production_stages.filter((value) => value !== stage)
      : productionStageOptions.filter((value) => [...current.production_stages, stage].includes(value)),
  }))
  const updatePly = (ply: string) => setForm((current) => ({ ...current, ply, paper_layers: buildPaperLayers(ply, current.paper_layers) }))
  const updatePaperLayer = (index: number, key: keyof Omit<PaperLayer, 'layer_name'>, value: string) => setForm((current) => ({
    ...current,
    paper_layers: (current.paper_layers.length > 0 ? current.paper_layers : buildPaperLayers(current.ply, []))
      .map((layer, layerIndex) => layerIndex === index ? { ...layer, [key]: value } : layer),
  }))
  const startAdd = () => {
    if (!listCustomerId || !listItemId) { setError('Select a customer and item before adding a specification.'); return }
    const nextRecordId = specifications.reduce((maximum, value) => Math.max(maximum, value.id), 0) + 1
    const nextItemCode = `PC-${String(nextRecordId).padStart(4, '0')}`
    const specificationType = detectType(items.find((value) => value.item_id === listItemId))
    setEditingId(null); setCustomerId(listCustomerId); setItemId(listItemId); setForm({ ...emptyForm, polar_canvas_item_code: nextItemCode, specification_type: specificationType, production_stages: defaultProductionStages(specificationType, false) }); setMessage(''); setError(''); setShowForm(true)
  }
  const edit = (specification: Specification) => {
    setEditingId(specification.id); setListCustomerId(specification.customer_id); setListItemId(specification.item_id); setCustomerId(specification.customer_id); setItemId(specification.item_id); setShowForm(true); setMessage(''); setError('')
    const attributes = readAttributes(specification.attributes_json)
    const printRequired = specification.print_required === true || specification.print_required === 1
    const savedPly = specification.ply?.toString() ?? ''
    setForm({
      specification_name: specification.specification_name,
      polar_canvas_item_code: specification.polar_canvas_item_code,
      specification_type: specification.specification_type || 'GENERAL',
      length_mm: specification.length_mm?.toString() ?? '', width_mm: specification.width_mm?.toString() ?? '',
      height_mm: specification.height_mm?.toString() ?? '', ply: savedPly,
      gsm: specification.gsm?.toString() ?? '', bf: specification.bf?.toString() ?? '',
      print_required: printRequired,
      print_colors: specification.print_colors ?? '', notes: specification.notes ?? '',
      ...attributes,
      paper_layers: attributes.paper_layers.length > 0 ? attributes.paper_layers : buildPaperLayers(savedPly, []),
      production_stages: attributes.production_stages.length > 0 ? attributes.production_stages : defaultProductionStages(specification.specification_type, printRequired),
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

  const printReport = () => {
    const previousTitle = document.title
    document.title = `${form.polar_canvas_item_code || 'Product-Specification'}-Report`
    document.body.classList.add('printing-product-spec-report')
    const cleanup = () => { document.body.classList.remove('printing-product-spec-report'); document.title = previousTitle }
    window.addEventListener('afterprint', cleanup, { once: true })
    window.print()
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
      <div className="product-spec-editor-context"><span>Customer<strong>{customer?.customer_name}</strong></span><span>Item<strong>{item?.item_name}{item?.sku ? ` (${item.sku})` : ''}</strong></span><button type="button" onClick={() => setReportOpen(true)}><Printer size={14} /> Product Specification Report</button></div>
    </section>
    {customer && item && <section className="product-spec-panel product-spec-technical">
      <header><div><h3>Technical Specification</h3><p>Length, Width and Height are captured as Outer Dimensions (OD).</p></div><span className="spec-type-badge">{form.specification_type}</span></header>
      <div className="product-spec-grid">
        <label>Polar Canvas Item Code<input value={form.polar_canvas_item_code} readOnly aria-readonly="true" /></label>
        <label>Design Type <select value={form.specification_type} onChange={(e) => updateDesignType(e.target.value)}><option>BOX</option><option>BOARD / SHEET</option><option>PAPER / ROLL</option><option>TAPE</option><option>FILM</option><option>GENERAL</option></select></label>
        {showsDimensions && <label>Length - OD (mm)<input className="spec-dimension-input" type="number" min="0" step="0.01" value={form.length_mm} onChange={(e) => update('length_mm', e.target.value)} /></label>}
        {(showsDimensions || showsFlexibleFields || showsRollFields) && <label>{showsRollFields ? 'Deckle / Width (mm)' : 'Width - OD (mm)'}<input className="spec-dimension-input" type="number" min="0" step="0.01" value={form.width_mm} onChange={(e) => update('width_mm', e.target.value)} /></label>}
        {showsHeight && <label>Height - OD (mm)<input className="spec-dimension-input" type="number" min="0" step="0.01" value={form.height_mm} onChange={(e) => update('height_mm', e.target.value)} /></label>}
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
        {form.specification_type !== 'PAPER / ROLL' && <label>Print<select value={form.print_required ? 'YES' : 'NO'} onChange={(e) => updatePrintRequired(e.target.value === 'YES')}><option>NO</option><option>YES</option></select></label>}
        {form.print_required && <label>Print Colours<input value={form.print_colors} onChange={(e) => update('print_colors', e.target.value)} placeholder="e.g. 2 colours" /></label>}
        {showsBoardFields && <label>Rotary Size<input value={calculatedValues.rotarySize} readOnly aria-readonly="true" /></label>}
        {showsBoardFields && <label>Sheet Size<input value={calculatedValues.sheetSize} readOnly aria-readonly="true" /></label>}
        {showsBoardFields && <label>Box Weight<input value={calculatedValues.boxWeight} readOnly aria-readonly="true" /></label>}
        {showsBoardFields && <label>Board GSM<input value={calculatedValues.boardGsm} readOnly aria-readonly="true" /></label>}
        {showsBoardFields && <label>BS<input value={calculatedValues.burstingStrength} readOnly aria-readonly="true" /></label>}
        {showsBoardFields && <label>Moisture<input value={calculatedValues.moisture} readOnly aria-readonly="true" /></label>}
        <label className="spec-notes">Specification Notes<textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Add material, flute, tolerance or finishing instructions" /></label>
      </div>
      {showsBoardFields && <div className="paper-composition">
        <div className="paper-composition-heading"><strong>Paper Composition{form.ply ? ` · ${form.ply} Ply` : ''}</strong><span>{form.paper_layers.length > 0 ? form.paper_layers.map((layer) => layer.layer_name).join(' + ') : 'Select Ply above to enter paper composition.'}</span></div>
        {form.paper_layers.length > 0 && <div className="paper-composition-table"><table><thead><tr><th>#</th><th>Layer Type</th><th>GSM</th><th>BF/RCT</th><th>Deckle Size</th><th>Shade</th><th>Paper Grade</th><th>Flute</th></tr></thead><tbody>
          {form.paper_layers.map((layer, index) => {
            const isFluting = layer.layer_name.toLowerCase().includes('fluting')
            return <tr key={`${layer.layer_name}-${index}`}><td>{index + 1}</td><td><strong>{layer.layer_name}</strong></td><td><input type="number" min="0" step="0.01" value={layer.gsm} onChange={(e) => updatePaperLayer(index, 'gsm', e.target.value)} placeholder="GSM" /></td><td><input type="number" min="0" step="0.01" value={layer.bf_rct} onChange={(e) => updatePaperLayer(index, 'bf_rct', e.target.value)} placeholder="BF / RCT" /></td><td><output className="paper-deckle-value">{calculatedDeckle(form)}</output></td><td><select value={layer.shade} onChange={(e) => updatePaperLayer(index, 'shade', e.target.value)}><option value="">Select</option><option value="GYT">GYT</option><option value="Natural">Natural</option><option value="White">White</option></select></td><td><input value={layer.paper_grade} onChange={(e) => updatePaperLayer(index, 'paper_grade', e.target.value)} placeholder={isFluting ? 'Fluting medium' : 'Kraft liner'} /></td><td>{isFluting ? <select value={layer.flute} onChange={(e) => updatePaperLayer(index, 'flute', e.target.value)}><option value="">Select</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="E">E</option><option value="F">F</option></select> : <span className="not-applicable">—</span>}</td></tr>
          })}
        </tbody></table></div>}
      </div>}
      <div className="production-stages">
        <div className="production-stages-heading"><strong>Production Stages</strong><span>Select the stages required for this client/item specification.</span></div>
        <div className="production-stage-grid">
          {productionStageOptions.map((stage, index) => <label key={stage} className={form.production_stages.includes(stage) ? 'is-selected' : ''}>
            <input type="checkbox" checked={form.production_stages.includes(stage)} onChange={() => toggleProductionStage(stage)} />
            <span><b>{index + 1}</b>{stage}{stage === 'Die Cutting' && <em>if required</em>}</span>
          </label>)}
        </div>
      </div>
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
    {reportOpen && customer && item && createPortal(<div className="product-spec-report-backdrop" role="dialog" aria-modal="true" aria-label="Product Specification Report">
      <div className="product-spec-report-dialog">
        <header><strong>Product Specification Report</strong><div><button type="button" onClick={printReport}><Printer size={14} /> Print</button><button type="button" onClick={() => setReportOpen(false)} aria-label="Close report"><X size={16} /></button></div></header>
        <div className="product-spec-report-scroll">
          <article className="product-spec-report-a4">
            <div className="spec-report-brand"><img src="/assets/Bird Logo-transparent.png" alt="Polar Canvas" /><div><h1>POLAR CANVAS</h1><p>PRODUCT SPECIFICATION REPORT</p></div><strong>{form.polar_canvas_item_code}</strong></div>
            <dl className="spec-report-master"><div><dt>Customer</dt><dd>{customer.customer_name}</dd></div><div><dt>Item</dt><dd>{item.item_name}</dd></div><div><dt>Item SKU</dt><dd>{item.sku || '—'}</dd></div><div><dt>Design Type</dt><dd>{form.specification_type}</dd></div></dl>
            <section><h2>Technical Specification</h2><dl className="spec-report-details">
              <div><dt>Length (OD)</dt><dd>{form.length_mm ? `${form.length_mm} mm` : '—'}</dd></div><div><dt>Width (OD)</dt><dd>{form.width_mm ? `${form.width_mm} mm` : '—'}</dd></div><div><dt>Height (OD)</dt><dd>{form.height_mm ? `${form.height_mm} mm` : '—'}</dd></div><div><dt>Ply</dt><dd>{form.ply ? `${form.ply} Ply` : '—'}</dd></div>
              <div><dt>Material</dt><dd>{form.material || '—'}</dd></div><div><dt>Joint Type</dt><dd>{form.joint_type || '—'}</dd></div><div><dt>Finish</dt><dd>{form.finish || '—'}</dd></div><div><dt>Print</dt><dd>{form.print_required ? `Yes${form.print_colors ? ` · ${form.print_colors}` : ''}` : 'No'}</dd></div>
              <div><dt>Rotary Size</dt><dd>{calculatedValues.rotarySize}</dd></div><div><dt>Sheet Size</dt><dd>{calculatedValues.sheetSize}</dd></div><div><dt>Box Weight</dt><dd>{calculatedValues.boxWeight}</dd></div><div><dt>Board GSM</dt><dd>{calculatedValues.boardGsm}</dd></div><div><dt>BS</dt><dd>{calculatedValues.burstingStrength}</dd></div><div><dt>Moisture</dt><dd>{calculatedValues.moisture}</dd></div>
            </dl></section>
            {form.paper_layers.length > 0 && <section><h2>Paper Composition</h2><table><thead><tr><th>#</th><th>Layer Type</th><th>GSM</th><th>BF/RCT</th><th>Deckle Size</th><th>Shade</th><th>Paper Grade</th><th>Flute</th></tr></thead><tbody>{form.paper_layers.map((layer, index) => <tr key={`${layer.layer_name}-report`}><td>{index + 1}</td><td>{layer.layer_name}</td><td>{layer.gsm || '—'}</td><td>{layer.bf_rct || '—'}</td><td>{calculatedDeckle(form)}</td><td>{layer.shade || '—'}</td><td>{layer.paper_grade || '—'}</td><td>{layer.flute || '—'}</td></tr>)}</tbody></table></section>}
            <section><h2>Production Stages</h2><ol className="spec-report-stages">{form.production_stages.map((stage) => <li key={`${stage}-report`}>{stage}</li>)}</ol></section>
            {form.notes && <section><h2>Specification Notes</h2><p className="spec-report-notes">{form.notes}</p></section>}
            <footer><span>Generated from PC-Tech</span><span>{new Date().toLocaleString('en-IN')}</span></footer>
          </article>
        </div>
      </div>
    </div>, document.body)}
  </form>
}
