import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { formatIstDateTime } from '../../utils/dateTimeFormatting'
import { loadStockLedger, type StockLedgerRow } from './stockLedgerService'
import './stock-ledger.css'

const initial = () => ({ date_from:'', date_to:'', transaction_type:'', material:'', reel_number:'', reference_number:'', location:'', user:'' })
const number = (value:number) => value ? new Intl.NumberFormat('en-IN',{maximumFractionDigits:3}).format(value) : '-'

export default function StockLedger() {
  const [filters,setFilters]=useState(initial); const [rows,setRows]=useState<StockLedgerRow[]>([])
  const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  const load=async(next=filters)=>{setBusy(true);setError('');try{setRows(await loadStockLedger(next))}catch(e){setError(e instanceof Error?e.message:'Unable to load Stock Ledger.')}finally{setBusy(false)}}
  useEffect(()=>{void load(initial())},[])
  const change=(key:string,value:string)=>setFilters(current=>({...current,[key]:value}))
  return <div className="stock-ledger-page">
    {error&&<p className="stock-ledger-message" role="alert">{error}</p>}
    <section className="stock-ledger-filters">
      <label><span>Date From</span><input type="date" value={filters.date_from} onChange={e=>change('date_from',e.target.value)}/></label>
      <label><span>Date To</span><input type="date" value={filters.date_to} onChange={e=>change('date_to',e.target.value)}/></label>
      <label><span>Transaction Type</span><select value={filters.transaction_type} onChange={e=>change('transaction_type',e.target.value)}><option value="">All</option><option>Material Receipt</option><option value="MATERIAL_ISSUE">Material Issue</option><option>Material Return</option><option>Stock Adjustment</option><option value="PRODUCTION_CONSUMPTION">Job Consumption</option></select></label>
      {[['material','Material'],['reel_number','Reel No.'],['reference_number','Reference No.'],['location','Location'],['user','User']].map(([key,label])=><label key={key}><span>{label}</span><input value={filters[key as keyof typeof filters]} onChange={e=>change(key,e.target.value)}/></label>)}
      <div><button onClick={()=>void load()} disabled={busy}>Apply Filters</button><button className="secondary" onClick={()=>{const next=initial();setFilters(next);void load(next)}}><RotateCcw size={13}/> Reset</button></div>
    </section>
    <section className="stock-ledger-grid"><div><table><thead><tr>{['Date / Time','Transaction Type','Reference Type','Reference No.','Material','Reel / Lot No.','IN Qty','OUT Qty','Balance','UOM','Source','Created By','Approved By','Remarks'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.sort_id}-${row.transaction_at}-${index}`}><td>{formatIstDateTime(new Date(row.transaction_at))}</td><td>{row.transaction_type==='PRODUCTION_CONSUMPTION'?'Job Consumption':row.transaction_type==='MATERIAL_ISSUE'?'Material Issue':row.transaction_type}</td><td>{row.reference_type}</td><td>{row.reference_number}</td><td>{row.material_no}<small>{row.item_name}</small></td><td>{row.reel_number||'-'}</td><td>{number(Number(row.in_qty))}</td><td>{number(Number(row.out_qty))}</td><td>{number(Number(row.balance))}</td><td>{row.uom}</td><td>{row.source}</td><td>{row.created_by||'-'}</td><td>{row.approved_by||'-'}</td><td>{row.remarks||'-'}</td></tr>)}{!rows.length&&<tr><td className="empty" colSpan={14}>No inventory movements match the selected filters.</td></tr>}</tbody></table></div></section>
  </div>
}
