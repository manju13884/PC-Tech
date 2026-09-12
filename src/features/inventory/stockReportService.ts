export interface StockReportRow {
  id: number; material_type: string; material_no: string; reel_number: string; paper_type: string
  gsm: number; bf: number | null; reel_size_cm: number; color: string; supplier: string
  purchase_order_number: string; location_name: string; opening_stock: number; received_qty: number
  issued_qty: number; returned_qty: number; adjustment_increase: number; adjustment_decrease: number
  closing_stock: number; uom: string; last_transaction_date: string; received_date: string
  reel_status: 'Available' | 'Reserved' | 'Consumed'; reserved_for_job: string | null
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
