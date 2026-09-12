import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { getCustomers, getCustomersError, type Customer } from '../../customerService'
import { getInvoicesByCustomer, getInvoicesError, type Invoice } from '../../invoiceService'
import './material-issue.css'

interface MaterialStock { inventory_stock_id:number; material_no:string; material_type:string; paper_type:string; item_name:string; item_description:string; reel_number:string; gsm:number; bf:number|null; reel_size_cm:number; color:string; available_stock:number; uom:string }
interface MaterialIssueRow extends MaterialStock { id:number; issue_number:string; issue_date:string; zoho_customer_id:string; customer_name:string; original_available_stock:number; issue_quantity:number; remaining_stock:number; zoho_invoice_id:string|null; invoice_number:string|null; sales_order_number:string|null; customer_po_number:string|null; remarks:string|null; status:'DRAFT'|'COMPLETED'; issued_by_name:string; completed_by_name:string|null; completed_at:string|null }
interface Payload { issues:MaterialIssueRow[]; materials:MaterialStock[]; currentUser:{id:number;fullName:string}; error?:string }
const todayIst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const initialForm=()=>({issue_date:todayIst(),zoho_customer_id:'',zoho_invoice_id:'',invoice_number:'',material_type:'',inventory_stock_id:'',issue_quantity:'',sales_order_number:'',customer_po_number:'',remarks:''})
const numberText=(value:number)=>Number(value).toLocaleString('en-IN',{maximumFractionDigits:3})
const moneyText=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value)
const invoiceDate=(value:string)=>{const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);return match?`${match[3]}-${match[2]}-${match[1]}`:value}

async function request(body?:Record<string,unknown>):Promise<Payload>{
  const response=await fetch('/api/material-issues',{method:body?'POST':'GET',credentials:'include',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined})
  const text=await response.text();let data:Payload
  try{data=text?JSON.parse(text) as Payload:{} as Payload}catch{throw new Error('Material Issue service returned an invalid response.')}
  if(!response.ok)throw new Error(data.error||'Unable to process Material Issue.')
  return data
}

export default function MaterialIssue(){
  const [customers,setCustomers]=useState<Customer[]>([]),[invoices,setInvoices]=useState<Invoice[]>([])
  const [data,setData]=useState<Payload>({issues:[],materials:[],currentUser:{id:0,fullName:''}})
  const [form,setForm]=useState(initialForm),[editingId,setEditingId]=useState<number|null>(null)
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[invoiceError,setInvoiceError]=useState('')
  const [busy,setBusy]=useState(false),[invoicesLoading,setInvoicesLoading]=useState(false)
  const [filters,setFilters]=useState({customer:'',invoice:'',date:'',material:'',status:''})
  const selected=data.materials.find(value=>value.inventory_stock_id===Number(form.inventory_stock_id))
  const materialTypes=useMemo(()=>[...new Set(data.materials.map(value=>value.material_type))],[data.materials])
  const filtered=data.materials.filter(value=>!form.material_type||value.material_type===form.material_type)
  const load=async()=>{setError('');try{setData(await request())}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load Material Issues.')}}

  useEffect(()=>{void load();void getCustomers().then(values=>{setCustomers(values);const reason=getCustomersError();if(reason)setError(reason)})},[])
  useEffect(()=>{
    let active=true
    if(!form.zoho_customer_id){setInvoices([]);setInvoiceError('');setInvoicesLoading(false);return()=>{active=false}}
    setInvoicesLoading(true);setInvoiceError('')
    void getInvoicesByCustomer(form.zoho_customer_id).then(values=>{if(active){setInvoices(values);if(getInvoicesError())setInvoiceError('Unable to load invoices. Please try again.')}}).finally(()=>{if(active)setInvoicesLoading(false)})
    return()=>{active=false}
  },[form.zoho_customer_id])

  const change=(key:keyof ReturnType<typeof initialForm>,value:string)=>{setForm(current=>({...current,[key]:value}));setMessage('');setError('')}
  const changeCustomer=(value:string)=>{setForm(current=>({...current,zoho_customer_id:value,zoho_invoice_id:'',invoice_number:''}));setMessage('');setError('')}
  const changeInvoice=(value:string)=>{const invoice=invoices.find(row=>row.invoice_id===value);setForm(current=>({...current,zoho_invoice_id:value,invoice_number:invoice?.invoice_number||''}));setMessage('');setError('')}
  const saveDraft=async()=>{
    if(!customers.some(value=>value.customer_id===form.zoho_customer_id))throw new Error('Please select Customer.')
    if(!form.zoho_invoice_id||!form.invoice_number)throw new Error('Please select Invoice Number.')
    if(!selected||!(Number(form.issue_quantity)>0))throw new Error('Complete Material and Issue Quantity before saving.')
    const next=await request({action:'save_draft',id:editingId,...form,inventory_stock_id:Number(form.inventory_stock_id),issue_quantity:Number(form.issue_quantity)})
    setData(next);const id=editingId??Number((next as Payload&{id?:number}).id);setEditingId(id);return id
  }
  const submit=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');try{await saveDraft();setMessage('Material Issue draft saved. Inventory was not changed.')}catch(reason){setError(reason instanceof Error?reason.message:'Unable to save Material Issue.')}finally{setBusy(false)}}
  const complete=async()=>{setBusy(true);setError('');try{const id=await saveDraft();if(!window.confirm('Complete this Material Issue and reduce Inventory now?'))return;const next=await request({action:'complete',id});setData(next);setMessage(`Material Issue completed. Remaining stock: ${numberText(Number((next as Payload&{remainingStock?:number}).remainingStock??0))} KG.`);setEditingId(null);setForm(initialForm())}catch(reason){setError(reason instanceof Error?reason.message:'Unable to complete Material Issue.')}finally{setBusy(false)}}
  const edit=(row:MaterialIssueRow)=>{if(row.status!=='DRAFT')return;setEditingId(row.id);setForm({issue_date:row.issue_date,zoho_customer_id:row.zoho_customer_id,zoho_invoice_id:row.zoho_invoice_id||'',invoice_number:row.invoice_number||'',material_type:row.material_type,inventory_stock_id:String(row.inventory_stock_id),issue_quantity:String(row.issue_quantity),sales_order_number:row.sales_order_number||'',customer_po_number:row.customer_po_number||'',remarks:row.remarks||''});setMessage('');setError('')}
  const visibleIssues=data.issues.filter(row=>(!filters.customer||row.zoho_customer_id===filters.customer)&&(!filters.invoice||row.invoice_number?.toLowerCase().includes(filters.invoice.toLowerCase()))&&(!filters.date||row.issue_date===filters.date)&&(!filters.material||`${row.material_no} ${row.item_name} ${row.reel_number}`.toLowerCase().includes(filters.material.toLowerCase()))&&(!filters.status||row.status===filters.status))

  return <div className="material-issue-page">
    {(error||message)&&<p className={error?'material-issue-message is-error':'material-issue-message'} role={error?'alert':'status'}>{error||message}</p>}
    <form onSubmit={submit} className="material-issue-form"><div className="material-issue-grid">
      <label><span>Issue No.</span><input readOnly value={editingId?data.issues.find(value=>value.id===editingId)?.issue_number||'':'Auto-generated on save'}/></label>
      <label><span>Issue Date</span><input type="date" value={form.issue_date} onChange={event=>change('issue_date',event.target.value)} required/></label>
      <label><span>Customer *</span><select value={form.zoho_customer_id} onChange={event=>changeCustomer(event.target.value)} required><option value="">Select Customer</option>{customers.map(value=><option key={value.customer_id} value={value.customer_id}>{value.customer_name}{value.gst_number?` - ${value.gst_number}`:''}</option>)}</select></label>
      <label><span>Invoice Number *</span><select value={form.zoho_invoice_id} onChange={event=>changeInvoice(event.target.value)} disabled={!form.zoho_customer_id||invoicesLoading} required><option value="">{!form.zoho_customer_id?'Select Customer first':invoicesLoading?'Loading Invoices...':invoices.length?'Select Invoice':'No invoices found for the selected Customer.'}</option>{invoices.map(value=><option key={value.invoice_id} value={value.invoice_id}>{value.invoice_number} | {invoiceDate(value.date||'')} | {moneyText(value.total||0)} | {value.status||'Active'}</option>)}</select>{invoiceError&&<small className="invoice-error">{invoiceError}</small>}</label>
      <label><span>Material Type *</span><select value={form.material_type} onChange={event=>{change('material_type',event.target.value);change('inventory_stock_id','')}} required><option value="">Select Material Type</option>{materialTypes.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="material-issue-material"><span>Material / Reel *</span><select value={form.inventory_stock_id} onChange={event=>change('inventory_stock_id',event.target.value)} required><option value="">Select available material</option>{filtered.map(value=><option key={value.inventory_stock_id} value={value.inventory_stock_id}>{value.reel_number} | {value.item_name||value.paper_type} | {value.gsm} GSM | {value.bf??'-'} BF | {value.reel_size_cm} CM | {numberText(value.available_stock)} KG</option>)}</select></label>
      <label><span>Available Stock</span><input readOnly value={selected?`${numberText(selected.available_stock)} KG`:''}/></label>
      <label><span>Issue Quantity / Weight *</span><input inputMode="decimal" value={form.issue_quantity} onChange={event=>change('issue_quantity',event.target.value)} required/></label>
      <label><span>UOM</span><input readOnly value={selected?.uom||'KG'}/></label>
      <label><span>Sale Order Number</span><input value={form.sales_order_number} onChange={event=>change('sales_order_number',event.target.value)} maxLength={80}/></label>
      <label><span>Customer PO Number</span><input value={form.customer_po_number} onChange={event=>change('customer_po_number',event.target.value)} maxLength={80}/></label>
      <label><span>Issued By</span><input readOnly value={data.currentUser.fullName}/></label><label><span>Status</span><input readOnly value="Draft"/></label>
      <label className="material-issue-remarks"><span>Remarks</span><textarea value={form.remarks} onChange={event=>change('remarks',event.target.value)} maxLength={500}/></label>
    </div><footer><button type="button" className="secondary" onClick={()=>{setEditingId(null);setForm(initialForm());setError('');setMessage('')}}>New</button><button type="submit" disabled={busy}>{busy?'Saving…':'Save Draft'}</button><button type="button" className="complete" disabled={busy} onClick={()=>void complete()}>Complete Issue</button></footer></form>
    <section className="material-issue-list"><header><strong>Material Issues</strong><span>{visibleIssues.length} of {data.issues.length} records</span></header>
      <div className="material-issue-filters"><select value={filters.customer} onChange={event=>setFilters(value=>({...value,customer:event.target.value}))}><option value="">All Customers</option>{customers.map(value=><option key={value.customer_id} value={value.customer_id}>{value.customer_name}</option>)}</select><input placeholder="Invoice Number" value={filters.invoice} onChange={event=>setFilters(value=>({...value,invoice:event.target.value}))}/><input type="date" value={filters.date} onChange={event=>setFilters(value=>({...value,date:event.target.value}))}/><input placeholder="Material / Reel" value={filters.material} onChange={event=>setFilters(value=>({...value,material:event.target.value}))}/><select value={filters.status} onChange={event=>setFilters(value=>({...value,status:event.target.value}))}><option value="">All Statuses</option><option>DRAFT</option><option>COMPLETED</option></select></div>
      <div><table><thead><tr>{['Issue No.','Date','Customer','Invoice No.','Material','Reel / Lot','Original Stock','Issued','Remaining','UOM','Issued By','Status','Action'].map(value=><th key={value}>{value}</th>)}</tr></thead><tbody>{visibleIssues.map(value=><tr key={value.id}><td>{value.issue_number}</td><td>{value.issue_date}</td><td>{value.customer_name}</td><td>{value.invoice_number||'—'}</td><td>{value.material_no}<small>{value.item_name}</small></td><td>{value.reel_number}</td><td>{numberText(value.original_available_stock)} KG</td><td>{numberText(value.issue_quantity)} KG</td><td>{numberText(value.remaining_stock)} KG</td><td>{value.uom}</td><td>{value.issued_by_name}</td><td><span className={`is-${value.status.toLowerCase()}`}>{value.status}</span></td><td><button type="button" disabled={value.status==='COMPLETED'} onClick={()=>edit(value)}>{value.status==='COMPLETED'?'Locked':'Edit'}</button></td></tr>)}{!visibleIssues.length&&<tr><td colSpan={13} className="empty">No Material Issues match the selected filters.</td></tr>}</tbody></table></div>
    </section>
  </div>
}
