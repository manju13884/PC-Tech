export interface StockReportRow {
  id: number; material_type: string; material_no: string; reel_number: string; paper_type: string
  gsm: number; bf: number | null; reel_size_cm: number; color: string; supplier: string
  vendor_id:string; purchase_order_id:string; purchase_order_number: string; purchase_order_line_item_id:string
  item_name:string; item_description:string|null; po_quantity:number; po_unit:string|null
  location_name: string; opening_stock: number; received_qty: number
  issued_qty: number; returned_qty: number; adjustment_increase: number; adjustment_decrease: number
  closing_stock: number; uom: string; last_transaction_date: string; received_date: string
  reel_status: 'Available' | 'Reserved' | 'Consumed'; reserved_for_job: string | null; can_delete: number
  can_edit: number; edit_pending: number; reel_weight_kg: number; material_status: 'Available' | 'Hold' | 'Consumed'
}
export interface MaterialEditRequest {
  id:number; inventory_stock_id:number; status:'PENDING_APPROVAL'|'APPROVED'|'REJECTED'; old_values:string
  proposed_values:string; edit_reason:string; requested_by_name:string; requested_at:string; reviewed_by_name:string|null
  reviewed_at:string|null; rejection_reason:string|null; material_no:string; reel_number:string; item_name:string
}
export interface StockReportTotal { uom: string; total_materials: number; total_stock: number; in_stock: number; zero_stock: number; negative_stock: number }
export interface StockReportResult { rows: StockReportRow[]; totals: StockReportTotal[]; page: number; pageSize: number; total: number; lowStockAvailable: boolean; asOnDate: string }
export interface StockTransaction { transaction_date: string; transaction_type: string; reference_number: string; reel_number?: string; in_qty: number; out_qty: number; balance: number; uom: string; source: string; created_by: string; approved_by: string }

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' })
  const text = await response.text(); let payload: unknown
  try { payload = text ? JSON.parse(text) : {} } catch { throw new Error('Stock Report service returned an invalid response.') }
  if (!response.ok) { const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null; throw new Error(typeof error === 'string' ? error : 'Unable to load Stock Report.') }
  return payload as T
}
export const loadStockReport = (filters: Record<string, string>) => get<StockReportResult>(`/api/stock-report?${new URLSearchParams(filters)}`)
export const loadStockTransactions = async (id: number, asOnDate: string) => (await get<{ transactions: StockTransaction[] }>(`/api/stock-report?transactions=1&inventory_stock_id=${id}&as_on_date=${asOnDate}`)).transactions
export async function deleteMaterialStock(id: number, reason: string): Promise<string> {
  const response = await fetch('/api/stock-report', {
    method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory_stock_id: id, reason }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string }
  if (!response.ok) throw new Error(payload.error || 'Unable to delete the Material Stock row.')
  return payload.message || 'Material Stock row deleted successfully.'
}
async function editRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/material-edit-requests', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  const payload = await response.json().catch(() => ({})) as { error?:string }
  if (!response.ok) throw new Error(payload.error || 'Unable to process Material Edit request.')
}
export const submitMaterialEdit = (body: Record<string, unknown>) => editRequest(body)
export const reviewMaterialEdit = (id:number, action:'approve'|'reject', rejectionReason='') => editRequest({ id, action, rejection_reason:rejectionReason })
export async function loadMaterialEditRequests(): Promise<MaterialEditRequest[]> {
  return (await get<{ requests:MaterialEditRequest[] }>('/api/material-edit-requests')).requests
}
