export interface StockLedgerRow {
  sort_id:number; transaction_at:string; transaction_type:string; reference_type:string; reference_number:string
  material_no:string; item_name:string; reel_number:string; location_name:string; in_qty:number; out_qty:number
  balance:number; uom:string; source:string; created_by:string; approved_by:string; remarks:string
}

export async function loadStockLedger(filters: Record<string,string>): Promise<StockLedgerRow[]> {
  const response = await fetch(`/api/stock-ledger?${new URLSearchParams(filters)}`, { credentials: 'include' })
  const text = await response.text(); let payload: { transactions?: StockLedgerRow[]; error?: string }
  try { payload = text ? JSON.parse(text) : {} } catch { throw new Error('Stock Ledger service returned an invalid response.') }
  if (!response.ok) throw new Error(payload.error || 'Unable to load Stock Ledger.')
  return payload.transactions ?? []
}
