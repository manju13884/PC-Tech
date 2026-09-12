export interface MaterialStock {
  id: number
  material_no: string
  material_type: string
  paper_type: string
  vendor_name: string
  purchase_order_number: string
  item_name: string
  item_description: string
  reel_size_cm: number
  color: string
  gsm: number
  bf: number | null
  reel_number: string
  current_stock: number
  uom: string
  location_name: string
}

export interface StockAdjustmentRecord extends Record<string, unknown> {
  id: number
  adjustment_number: string
  adjustment_date: string
  material_type: string
  inventory_stock_id: number
  current_stock_snapshot: number
  adjustment_type: 'INCREASE' | 'DECREASE'
  adjustment_qty: number
  revised_stock_snapshot: number
  uom: string
  reason: string
  other_reason: string | null
  remarks: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  created_by_user_id: number
  created_by_name: string
  created_at: string
  approved_by_name: string | null
  approved_at: string | null
  rejected_by_name: string | null
  rejected_at: string | null
  rejection_reason: string | null
  material_no: string
  paper_type: string
  reel_number: string
  item_name: string
  can_edit: number
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init })
  const text = await response.text()
  let payload: unknown
  try { payload = text ? JSON.parse(text) : {} } catch { throw new Error('Stock Adjustment service returned an invalid response.') }
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null
    throw new Error(typeof error === 'string' ? error : 'Stock Adjustment request failed.')
  }
  return payload as T
}

export async function getMaterialStocks(): Promise<MaterialStock[]> {
  const result = await request<{ records: MaterialStock[] }>('/api/material-inventory-records')
  return result.records
}

export async function getStockAdjustments(filters: Record<string, string> = {}): Promise<StockAdjustmentRecord[]> {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  const result = await request<{ adjustments: StockAdjustmentRecord[] }>(`/api/stock-adjustments?${params}`)
  return result.adjustments
}

export async function saveStockAdjustment<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  return request<T>('/api/stock-adjustments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
}
