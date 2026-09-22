import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { loadMaterialEditRequests, reviewMaterialEdit, submitMaterialEdit, type MaterialEditRequest, type StockReportRow } from './stockReportService'
import { getInventoryPurchaseOrderItems, getInventoryPurchaseOrders, getInventoryVendors, type InventoryPurchaseOrder, type InventoryPurchaseOrderItem, type InventoryVendor } from './inventoryZohoService'

const fields = [
  ['paper_type','Paper Type'], ['reel_size_cm','Reel Size (cm)'], ['color','Color'], ['gsm','GSM'],
  ['bf','BF'], ['reel_number','Reel Number'], ['reel_weight_kg','Reel Weight (Kg)'], ['status','Status'],
] as const
const approvalFields: ReadonlyArray<readonly [string,string]> = [
  ['vendor_name','Supplied Vendor'], ['purchase_order_number','PO Number'], ['item_name','PO Item'],
  ['po_quantity','PO Qty'], ...fields,
]
type Form = Record<typeof fields[number][0], string>
const parse = (value:string) => { try { return JSON.parse(value) as Record<string,unknown> } catch { return {} } }

export function MaterialEditDialog({ row, onClose, onDone }:{ row:StockReportRow; onClose:()=>void; onDone:(message:string)=>void }) {
  const [form,setForm] = useState<Form>({ paper_type:row.paper_type || '', reel_size_cm:String(row.reel_size_cm ?? ''), color:row.color || '', gsm:String(row.gsm ?? ''), bf:String(row.bf ?? ''), reel_number:row.reel_number || '', reel_weight_kg:String(row.reel_weight_kg ?? ''), status:row.material_status || 'Available' })
  const [vendorId,setVendorId]=useState(row.vendor_id); const [poId,setPoId]=useState(row.purchase_order_id); const [itemId,setItemId]=useState(row.purchase_order_line_item_id)
  const [vendors,setVendors]=useState<InventoryVendor[]>([]); const [orders,setOrders]=useState<InventoryPurchaseOrder[]>([]); const [items,setItems]=useState<InventoryPurchaseOrderItem[]>([])
  const [reason,setReason]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  useEffect(()=>{getInventoryVendors().then(setVendors).catch(e=>setError(e instanceof Error?e.message:'Unable to load vendors.'))},[])
  useEffect(()=>{if(!vendorId){setOrders([]);return} getInventoryPurchaseOrders(vendorId).then(setOrders).catch(e=>setError(e instanceof Error?e.message:'Unable to load purchase orders.'))},[vendorId])
  useEffect(()=>{if(!poId){setItems([]);return} getInventoryPurchaseOrderItems(poId).then(setItems).catch(e=>setError(e instanceof Error?e.message:'Unable to load PO items.'))},[poId])
  const selectedItem=items.find(item=>item.line_item_id===itemId)
  const submit=async()=>{ setError(''); if(!reason.trim()){setError('Reason for Edit is required.');return} setBusy(true); try { await submitMaterialEdit({inventory_stock_id:row.id,...form,vendor_id:vendorId,purchase_order_id:poId,purchase_order_line_item_id:itemId,edit_reason:reason.trim()}); onDone('Material Edit submitted for approval. Live stock remains unchanged.') } catch(e){setError(e instanceof Error?e.message:'Unable to submit Material Edit.')} finally{setBusy(false)} }
  return <div className="stock-report-modal material-edit-modal" role="dialog" aria-modal="true"><section><header><div><h3>Edit Material / Reel</h3><p>{row.material_no} · Reel {row.reel_number}</p></div><button disabled={busy} onClick={onClose}><X size={15}/></button></header><div className="material-edit-form">
    <label><span>Supplied Vendor <b>*</b></span><select value={vendorId} onChange={e=>{setVendorId(e.target.value);setPoId('');setItemId('')}}><option value="">Select Vendor</option>{vendors.map(v=><option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}</select></label>
    <label><span>PO Number <b>*</b></span><select value={poId} disabled={!vendorId} onChange={e=>{setPoId(e.target.value);setItemId('')}}><option value="">Select PO Number</option>{orders.map(v=><option key={v.purchase_order_id} value={v.purchase_order_id}>{v.purchase_order_number}</option>)}</select></label>
    <label><span>PO Item &amp; Description <b>*</b></span><select value={itemId} disabled={!poId} onChange={e=>setItemId(e.target.value)}><option value="">Select PO Item</option>{items.map(v=><option key={v.line_item_id} value={v.line_item_id}>{v.description?`${v.name} - ${v.description}`:v.name}</option>)}</select></label>
    <label><span>PO Qty</span><input readOnly value={selectedItem?`${selectedItem.quantity}${selectedItem.unit?` ${selectedItem.unit}`:''}`:`${row.po_quantity}${row.po_unit?` ${row.po_unit}`:''}`}/></label>
    {fields.map(([key,label])=><label key={key}><span>{label} {key!=='bf'&&<b>*</b>}</span>{key==='paper_type'?<select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}><option>Kraft Paper</option><option>White Paper</option><option>Duplex Grey Back</option></select>:key==='color'?<select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}><option>GYT</option><option>Natural</option><option>White</option></select>:key==='status'?<select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}><option>Available</option><option>Hold</option></select>:<input type={['reel_size_cm','gsm','bf','reel_weight_kg'].includes(key)?'number':'text'} min="0" step="any" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}
    <label className="reason"><span>Reason for Edit <b>*</b></span><textarea maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>{error&&<p className="material-edit-error" role="alert">{error}</p>}
  </div><footer><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy||!reason.trim()} onClick={()=>void submit()}>{busy?'Submitting…':'Submit for Approval'}</button></footer></section></div>
}

export function MaterialEditApprovals({ onClose, onChanged }:{onClose:()=>void;onChanged:()=>void}) {
  const [requests,setRequests]=useState<MaterialEditRequest[]>([]); const [error,setError]=useState(''); const [busy,setBusy]=useState(0); const [rejecting,setRejecting]=useState<number|null>(null); const [reason,setReason]=useState('')
  const load=()=>loadMaterialEditRequests().then(setRequests).catch(e=>setError(e instanceof Error?e.message:'Unable to load requests.'))
  useEffect(()=>{void load()},[])
  const act=async(request:MaterialEditRequest,action:'approve'|'reject')=>{if(action==='reject'&&!reason.trim()){setError('Rejection Reason is required.');return} setBusy(request.id);setError('');try{await reviewMaterialEdit(request.id,action,reason.trim());setRejecting(null);setReason('');await load();onChanged()}catch(e){setError(e instanceof Error?e.message:'Unable to review request.')}finally{setBusy(0)}}
  return <div className="stock-report-modal material-approval-modal" role="dialog" aria-modal="true"><section><header><div><h3>Material Edit Approvals</h3><p>Current and proposed values are shown side by side.</p></div><button onClick={onClose}><X size={15}/></button></header>{error&&<p className="approval-error" role="alert">{error}</p>}<div className="material-approval-list">{requests.filter(r=>r.status==='PENDING_APPROVAL').map(r=>{const old=parse(r.old_values),next=parse(r.proposed_values);return <article key={r.id}><div className="approval-meta"><strong>{r.material_no} · Reel {r.reel_number}</strong><span>Requested by {r.requested_by_name} · {new Date(r.requested_at).toLocaleString()}</span><p>{r.edit_reason}</p></div><table><thead><tr><th>Field</th><th>Current Value</th><th>Proposed Value</th></tr></thead><tbody>{approvalFields.map(([key,label])=>{const changed=String(old[key]??'')!==String(next[key]??'');return <tr key={key} className={changed?'changed':''}><td>{label}</td><td>{String(old[key]??'—')}</td><td>{String(next[key]??'—')}</td></tr>})}</tbody></table>{rejecting===r.id&&<label className="reject-reason"><span>Rejection Reason *</span><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}/></label>}<footer><button className="secondary" disabled={busy===r.id} onClick={()=>{setRejecting(r.id);setReason('')}}><X size={12}/> Reject</button>{rejecting===r.id&&<button className="danger" disabled={busy===r.id||!reason.trim()} onClick={()=>void act(r,'reject')}>Confirm Reject</button>}<button disabled={busy===r.id} onClick={()=>void act(r,'approve')}><Check size={12}/> Approve</button></footer></article>})}{!requests.some(r=>r.status==='PENDING_APPROVAL')&&<p className="empty-approvals">No Material Edits are pending approval.</p>}</div></section></div>
}
