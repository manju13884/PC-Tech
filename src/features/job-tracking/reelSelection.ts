import type { InventoryReel } from '../job-cards/JobCards'

export const reelFilterFields = [
  ['reel_number', 'Reel No.'], ['gsm', 'GSM'], ['bf', 'BF'], ['reel_size_cm', 'Reel Size (cm)'],
  ['shade', 'Shade'], ['paper_type', 'Paper Type'], ['vendor_name', 'Supplier / Vendor'],
  ['purchase_order_number', 'PO Number'], ['min_available_weight', 'Minimum Available Weight (KG)'], ['search', 'Search'],
] as const
export type ReelFilterKey = typeof reelFilterFields[number][0]
export type ReelFilters = Partial<Record<ReelFilterKey, string>>
export type ReelSortKey = 'reel_number' | 'gsm' | 'bf' | 'reel_size_cm' | 'shade' | 'available_weight'
export const reelSelectFilterKeys = ['gsm', 'bf', 'reel_size_cm', 'shade', 'paper_type'] as const
export type ReelSelectFilterKey = typeof reelSelectFilterKeys[number]

export function reelFilterOptions(reels: InventoryReel[], key: ReelSelectFilterKey) {
  const values = new Map<string, string>()
  for (const reel of reels) {
    const value = String(reel[key] ?? '').trim()
    if (value && !values.has(value.toLowerCase())) values.set(value.toLowerCase(), value)
  }
  return [...values.values()].sort((a, b) => ['gsm', 'bf', 'reel_size_cm'].includes(key)
    ? Number(a) - Number(b) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

export function canSelectReel(reel: InventoryReel, selectedId: number, processName: string, slot: number) {
  if (!(reel.available_weight > 0)) return false
  if (reel.reel_status && reel.reel_status !== 'Available' && reel.reel_status !== 'Reserved') return false
  if (reel.reserved_job_card_id || reel.reel_status === 'Reserved') {
    return reel.inventory_stock_id === selectedId && reel.reserved_process_name === processName && reel.reserved_reel_slot === slot
  }
  return true
}

export function filterReels(reels: InventoryReel[], filters: ReelFilters) {
  return reels.filter(reel => reelFilterFields.every(([key]) => {
    const term = filters[key]?.trim().toLowerCase()
    if (!term) return true
    if (key === 'min_available_weight') return Number.isFinite(Number(term)) && Number(term) >= 0 && reel.available_weight >= Number(term)
    if (key === 'search') return [reel.reel_number, reel.material_no, reel.paper_type, reel.vendor_name, reel.purchase_order_number, reel.shade]
      .some(value => String(value ?? '').toLowerCase().includes(term))
    if (key === 'gsm' || key === 'bf' || key === 'reel_size_cm') return reel[key] != null && Number.isFinite(Number(term)) && Number(reel[key]) === Number(term)
    const value = String(reel[key] ?? '').trim().toLowerCase()
    return key === 'shade' || key === 'paper_type' ? value === term : value.includes(term)
  }))
}

export function sortReels(reels: InventoryReel[], key: ReelSortKey, ascending: boolean) {
  return [...reels].sort((a, b) => {
    if (a[key] == null) return b[key] == null ? 0 : 1
    if (b[key] == null) return -1
    const comparison = key === 'reel_number' || key === 'shade'
      ? String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true, sensitivity: 'base' })
      : Number(a[key]) - Number(b[key])
    return comparison * (ascending ? 1 : -1) || a.inventory_stock_id - b.inventory_stock_id
  })
}
