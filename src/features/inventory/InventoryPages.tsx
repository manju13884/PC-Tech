import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getInventoryPurchaseOrderItems,
  getInventoryPurchaseOrders,
  getInventoryVendors,
  saveMaterialInventoryRecord,
  type InventoryPurchaseOrderItem,
  type InventoryPurchaseOrder,
  type InventoryVendor,
} from './inventoryZohoService'
import './inventory.css'
export { default as StockAdjustment } from './StockAdjustment'

const materialOptions = ['Paper'] as const
const paperTypeOptions = ['Kraft Paper', 'White Paper', 'Duplex Grey Back'] as const
const colorOptions = ['GYT', 'Natural', 'White'] as const
const statusOptions = ['Available', 'Hold'] as const

interface PaperDetailsState {
  paperType: string
  reelSizeCm: string
  color: string
  gsm: string
  bf: string
  poNumber: string
  poItem: string
  suppliedVendor: string
  reelNumber: string
  reelWeightKg: string
  status: string
}

const initialPaperDetails: PaperDetailsState = {
  paperType: '', reelSizeCm: '', color: '', gsm: '', bf: '', poNumber: '', poItem: '', suppliedVendor: '',
  reelNumber: '', reelWeightKg: '', status: 'Available',
}

type PaperDetailsErrors = Partial<Record<keyof PaperDetailsState, string>>

function validatePaperDetails(details: PaperDetailsState): PaperDetailsErrors {
  const errors: PaperDetailsErrors = {}
  if (!details.paperType) errors.paperType = 'Select Paper Type.'
  if (!details.suppliedVendor) errors.suppliedVendor = 'Select Supplied Vendor.'
  if (!details.poNumber) errors.poNumber = 'Select PO Number.'
  if (!details.poItem) errors.poItem = 'Select an item from the purchase order.'
  if (!(Number(details.reelSizeCm) > 0)) errors.reelSizeCm = 'Reel Size must be greater than zero.'
  if (!details.color) errors.color = 'Select Color.'
  if (!(Number(details.gsm) > 0)) errors.gsm = 'GSM must be greater than zero.'
  if (details.bf && !(Number(details.bf) > 0)) errors.bf = 'BF must be greater than zero.'
  if (!details.reelNumber.trim()) errors.reelNumber = 'Enter Reel Number.'
  if (!(Number(details.reelWeightKg) > 0)) errors.reelWeightKg = 'Reel Weight must be greater than zero.'
  return errors
}

export function MaterialInventory() {
  const [material, setMaterial] = useState('')
  const [paperDetails, setPaperDetails] = useState<PaperDetailsState>(initialPaperDetails)
  const [errors, setErrors] = useState<PaperDetailsErrors>({})
  const [message, setMessage] = useState('')
  const [materialNo, setMaterialNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [vendors, setVendors] = useState<InventoryVendor[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<InventoryPurchaseOrder[]>([])
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<InventoryPurchaseOrderItem[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(false)
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false)
  const [purchaseOrderItemsLoading, setPurchaseOrderItemsLoading] = useState(false)
  const [vendorError, setVendorError] = useState('')
  const [purchaseOrderError, setPurchaseOrderError] = useState('')
  const [purchaseOrderItemError, setPurchaseOrderItemError] = useState('')
  const selectedPurchaseOrderItem = purchaseOrderItems.find((item) => item.line_item_id === paperDetails.poItem)

  const loadVendors = useCallback((force = false) => {
    let active = true
    setVendorsLoading(true)
    setVendorError('')
    void getInventoryVendors({ force })
      .then((loaded) => { if (active) setVendors(loaded) })
      .catch((error: unknown) => { if (active) setVendorError(error instanceof Error ? error.message : 'Unable to load vendors. Please retry.') })
      .finally(() => { if (active) setVendorsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (material !== 'Paper' || vendors.length > 0) return
    return loadVendors()
  }, [loadVendors, material, vendors.length])

  useEffect(() => {
    const vendorId = paperDetails.suppliedVendor
    setPurchaseOrders([])
    setPurchaseOrderError('')
    if (!vendorId) {
      setPurchaseOrdersLoading(false)
      return
    }
    let active = true
    setPurchaseOrdersLoading(true)
    void getInventoryPurchaseOrders(vendorId)
      .then((loaded) => { if (active) setPurchaseOrders(loaded) })
      .catch((error: unknown) => { if (active) setPurchaseOrderError(error instanceof Error ? error.message : 'Unable to load purchase orders from Zoho Books.') })
      .finally(() => { if (active) setPurchaseOrdersLoading(false) })
    return () => { active = false }
  }, [paperDetails.suppliedVendor])

  useEffect(() => {
    const purchaseOrderId = paperDetails.poNumber
    setPurchaseOrderItems([])
    setPurchaseOrderItemError('')
    if (!purchaseOrderId) {
      setPurchaseOrderItemsLoading(false)
      return
    }
    let active = true
    setPurchaseOrderItemsLoading(true)
    void getInventoryPurchaseOrderItems(purchaseOrderId)
      .then((loaded) => { if (active) setPurchaseOrderItems(loaded) })
      .catch((error: unknown) => { if (active) setPurchaseOrderItemError(error instanceof Error ? error.message : 'Unable to load items for the selected purchase order from Zoho Books.') })
      .finally(() => { if (active) setPurchaseOrderItemsLoading(false) })
    return () => { active = false }
  }, [paperDetails.poNumber])

  const updatePaperDetail = (field: keyof PaperDetailsState, value: string) => {
    setPaperDetails((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validatePaperDetails(paperDetails)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setMessage('')
      return
    }
    const selectedItem = purchaseOrderItems.find((item) => item.line_item_id === paperDetails.poItem)
    if (!selectedItem) {
      setErrors((current) => ({ ...current, poItem: 'Select an item from the purchase order.' }))
      return
    }
    setSaving(true)
    try {
      const saved = await saveMaterialInventoryRecord({
        material_type: material,
        paper_type: paperDetails.paperType,
        vendor_id: paperDetails.suppliedVendor,
        purchase_order_id: paperDetails.poNumber,
        purchase_order_line_item_id: selectedItem.line_item_id,
        reel_size_cm: paperDetails.reelSizeCm,
        color: paperDetails.color,
        gsm: paperDetails.gsm,
        bf: paperDetails.bf,
        reel_number: paperDetails.reelNumber,
        reel_weight_kg: paperDetails.reelWeightKg,
        status: paperDetails.status,
      })
      setMaterialNo(saved.material_no)
      setMessage(`Material Inventory saved successfully as ${saved.material_no}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save Material Inventory.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="inventory-page" onSubmit={submit} noValidate>
      <section className="inventory-material-panel">
        <label>
          <span>Material <b aria-label="required">*</b></span>
          <select value={material} required onChange={(event) => {
            setMaterial(event.target.value)
            setErrors({})
            setMessage('')
          }}>
            <option value="">Select Material</option>
            {materialOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Material No.</span>
          <input className="inventory-readonly-input" type="text" readOnly value={materialNo} placeholder="Auto-generated on save" />
        </label>
      </section>

      {material === 'Paper' && (
        <section className="inventory-paper-panel">
          <header>
            <div>
              <h3>Paper Details</h3>
              <p>Capture material details against the selected Zoho Books purchase order.</p>
            </div>
          </header>
          <div className="inventory-paper-grid">
            <label><span>Paper Type <b aria-label="required">*</b></span><select value={paperDetails.paperType} onChange={(event) => updatePaperDetail('paperType', event.target.value)} aria-invalid={Boolean(errors.paperType)}><option value="">Select Paper Type</option>{paperTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>{errors.paperType && <small role="alert">{errors.paperType}</small>}</label>
            <label><span>Supplied Vendor <b aria-label="required">*</b></span><select value={paperDetails.suppliedVendor} disabled={vendorsLoading || Boolean(vendorError) || (!vendorsLoading && vendors.length === 0)} onChange={(event) => { updatePaperDetail('suppliedVendor', event.target.value); updatePaperDetail('poNumber', ''); updatePaperDetail('poItem', '') }} aria-invalid={Boolean(errors.suppliedVendor)}><option value="">{vendorsLoading ? 'Loading Vendors…' : vendorError ? 'Unable to load vendors' : vendors.length === 0 ? 'No vendors available' : 'Select Vendor'}</option>{vendors.map((vendor) => <option key={vendor.vendor_id} value={vendor.vendor_id}>{vendor.vendor_name}</option>)}</select>{vendorError ? <span className="inventory-load-error"><small role="alert">{vendorError}</small><button type="button" onClick={() => loadVendors(true)} disabled={vendorsLoading}>Retry</button></span> : errors.suppliedVendor && <small role="alert">{errors.suppliedVendor}</small>}</label>
            <label><span>PO Number <b aria-label="required">*</b></span><select value={paperDetails.poNumber} disabled={!paperDetails.suppliedVendor || purchaseOrdersLoading} onChange={(event) => { updatePaperDetail('poNumber', event.target.value); updatePaperDetail('poItem', '') }} aria-invalid={Boolean(errors.poNumber)}><option value="">{!paperDetails.suppliedVendor ? 'Select Vendor first' : purchaseOrdersLoading ? 'Loading Purchase Orders…' : 'Select PO Number'}</option>{purchaseOrders.map((purchaseOrder) => <option key={purchaseOrder.purchase_order_id} value={purchaseOrder.purchase_order_id}>{purchaseOrder.purchase_order_number}</option>)}</select>{purchaseOrderError ? <small role="alert">{purchaseOrderError}</small> : errors.poNumber && <small role="alert">{errors.poNumber}</small>}</label>
            <label><span>PO Item &amp; Description <b aria-label="required">*</b></span><select value={paperDetails.poItem} disabled={!paperDetails.poNumber || purchaseOrderItemsLoading} onChange={(event) => updatePaperDetail('poItem', event.target.value)} aria-invalid={Boolean(errors.poItem)}><option value="">{!paperDetails.poNumber ? 'Select PO Number first' : purchaseOrderItemsLoading ? 'Loading PO Items…' : 'Select PO Item & Description'}</option>{purchaseOrderItems.map((item) => <option key={item.line_item_id} value={item.line_item_id}>{item.description ? `${item.name} - ${item.description}` : item.name}</option>)}</select>{purchaseOrderItemError ? <small role="alert">{purchaseOrderItemError}</small> : errors.poItem && <small role="alert">{errors.poItem}</small>}</label>
            <label><span>PO Qty</span><input className="inventory-readonly-input" type="text" readOnly value={selectedPurchaseOrderItem ? `${selectedPurchaseOrderItem.quantity}${selectedPurchaseOrderItem.unit ? ` ${selectedPurchaseOrderItem.unit}` : ''}` : ''} placeholder="From selected PO item" /></label>

            <label><span>Reel Size (cm) <b aria-label="required">*</b></span><input className="inventory-number-input" type="number" min="0" step="any" value={paperDetails.reelSizeCm} onChange={(event) => updatePaperDetail('reelSizeCm', event.target.value)} aria-invalid={Boolean(errors.reelSizeCm)} />{errors.reelSizeCm && <small role="alert">{errors.reelSizeCm}</small>}</label>
            <label><span>Color <b aria-label="required">*</b></span><select value={paperDetails.color} onChange={(event) => updatePaperDetail('color', event.target.value)} aria-invalid={Boolean(errors.color)}><option value="">Select Color</option>{colorOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>{errors.color && <small role="alert">{errors.color}</small>}</label>
            <label><span>GSM <b aria-label="required">*</b></span><input className="inventory-number-input" type="number" min="0" step="any" value={paperDetails.gsm} onChange={(event) => updatePaperDetail('gsm', event.target.value)} aria-invalid={Boolean(errors.gsm)} />{errors.gsm && <small role="alert">{errors.gsm}</small>}</label>

            <label><span>BF</span><input className="inventory-number-input" type="number" min="0" step="any" value={paperDetails.bf} onChange={(event) => updatePaperDetail('bf', event.target.value)} aria-invalid={Boolean(errors.bf)} />{errors.bf && <small role="alert">{errors.bf}</small>}</label>
            <label><span>Reel Weight (Kg) <b aria-label="required">*</b></span><input className="inventory-number-input" type="number" min="0" step="any" value={paperDetails.reelWeightKg} onChange={(event) => updatePaperDetail('reelWeightKg', event.target.value)} aria-invalid={Boolean(errors.reelWeightKg)} />{errors.reelWeightKg && <small role="alert">{errors.reelWeightKg}</small>}</label>
            <label><span>Reel Number <b aria-label="required">*</b> <em className="inventory-label-note">(As per Vendor Invoice)</em></span><input type="text" value={paperDetails.reelNumber} onChange={(event) => updatePaperDetail('reelNumber', event.target.value)} aria-invalid={Boolean(errors.reelNumber)} />{errors.reelNumber && <small role="alert">{errors.reelNumber}</small>}</label>

            <label><span>Status</span><select value={paperDetails.status} onChange={(event) => updatePaperDetail('status', event.target.value)}>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          <footer>
            {message && <p role="status">{message}</p>}
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </footer>
        </section>
      )}
    </form>
  )
}
