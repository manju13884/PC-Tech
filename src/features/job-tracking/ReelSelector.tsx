import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { InventoryReel } from '../job-cards/JobCards'
import { canSelectReel, filterReels, reelFilterFields, reelFilterOptions, reelSelectFilterKeys, sortReels, type ReelFilters, type ReelSortKey, type ReelSelectFilterKey } from './reelSelection'
import './reel-selector.css'

interface Props {
  reels: InventoryReel[]
  selectedId: number
  selectedNumber: string
  processName: string
  slot: 1 | 2
  label: string
  disabled: boolean
  busy?: boolean
  onSelect: (id: number) => void | Promise<void>
}
const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 })

export default function ReelSelector(props: Props) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (props.disabled) setOpen(false) }, [props.disabled])
  const selectedNumber = props.selectedNumber || props.reels.find(reel => reel.inventory_stock_id === props.selectedId)?.reel_number
  return <div className="reel-selector-control">
    <button type="button" className="reel-selector-trigger" disabled={props.disabled || props.busy} aria-label={props.label}
      aria-haspopup="dialog" title={selectedNumber ? `Selected Reel: ${selectedNumber} — Change Reel` : 'Select Reel'} onClick={() => setOpen(true)}>
      {selectedNumber ? <><strong>{selectedNumber}</strong><span>Change Reel</span></> : 'Select Reel'}
    </button>
    {open && !props.disabled && <ReelSelectionDialog {...props} onClose={() => setOpen(false)} />}
  </div>
}

function ReelSelectionDialog({ reels, selectedId, selectedNumber, processName, slot, busy, onSelect, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [pendingId, setPendingId] = useState(selectedId)
  const [filters, setFilters] = useState<ReelFilters>({})
  const [sort, setSort] = useState<{ key: ReelSortKey; ascending: boolean }>({ key: 'reel_number', ascending: true })
  const [page, setPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  const working = submitting || Boolean(busy)
  const eligible = useMemo(() => reels.filter(reel => canSelectReel(reel, selectedId, processName, slot)), [reels, selectedId, processName, slot])
  const options = useMemo(() => Object.fromEntries(reelSelectFilterKeys.map(key => [key, reelFilterOptions(eligible, key)])) as Record<ReelSelectFilterKey, string[]>, [eligible])
  const filtered = useMemo(() => sortReels(filterReels(eligible, filters), sort.key, sort.ascending), [eligible, filters, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / 50))
  const currentPage = Math.min(page, pages - 1)
  const displayed = filtered.slice(currentPage * 50, (currentPage + 1) * 50)
  const confirm = async (id: number) => {
    if (submittingRef.current || busy) return
    if (id !== 0 && !filtered.some(reel => reel.inventory_stock_id === id && canSelectReel(reel, selectedId, processName, slot))) {
      setError('This reel is no longer available. Please select another reel.')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      // The existing assignment API revalidates stock and reservations before assigning.
      await onSelect(id)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to select this reel. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    return () => { opener?.focus() }
  }, [])
  const sortable = (key: ReelSortKey, text: string) => <th aria-sort={sort.key === key ? sort.ascending ? 'ascending' : 'descending' : 'none'}>
    <button type="button" onClick={() => { setSort({ key, ascending: sort.key === key ? !sort.ascending : true }); setPage(0) }}>{text}{sort.key === key ? sort.ascending ? ' ↑' : ' ↓' : ''}</button>
  </th>
  return createPortal(<dialog ref={dialog} className="reel-selection-dialog" aria-labelledby={titleId} aria-busy={working} onCancel={event => { event.preventDefault(); if (!working) onClose() }}
    onClick={event => { if (!working && event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose() } }}>
    <header><div><h2 id={titleId}>Select Reel</h2><p>{processName} · Reel {slot}{selectedNumber ? ` · Current: ${selectedNumber}` : ''}</p></div><button type="button" aria-label="Close reel selection" disabled={working} onClick={onClose}><X size={18} /></button></header>
    {error && <p className="reel-selection-error" role="alert">{error}</p>}
    <div className="reel-selection-filters">
      {reelFilterFields.map(([key, label]) => <label key={key}>{label}{key in options
        ? <select value={filters[key] || ''} onChange={event => { setFilters(previous => ({ ...previous, [key]: event.target.value })); setPage(0) }}>
          <option value="">All</option>{filters[key] && !options[key as ReelSelectFilterKey].includes(filters[key]!) && <option value={filters[key]}>{filters[key]}</option>}
          {options[key as ReelSelectFilterKey].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        : <input type={key === 'min_available_weight' ? 'number' : 'search'} min={key === 'min_available_weight' ? 0 : undefined} step={key === 'min_available_weight' ? 'any' : undefined}
          autoFocus={key === 'reel_number'} value={filters[key] || ''} onChange={event => { setFilters(previous => ({ ...previous, [key]: event.target.value })); setPage(0) }} />}</label>)}
      <button type="button" onClick={() => { setFilters({}); setPage(0) }}>Clear Filters</button>
    </div>
    <div className="reel-selection-table-scroll"><table>
      <thead><tr><th>Select</th>{sortable('reel_number', 'Reel No.')}{sortable('gsm', 'GSM')}{sortable('bf', 'BF')}{sortable('reel_size_cm', 'Size (cm)')}{sortable('shade', 'Shade')}{sortable('available_weight', 'Available Weight (KG)')}<th>Paper Type</th><th>Supplier / Vendor</th><th>PO Number</th><th>Status</th></tr></thead>
      <tbody>{displayed.map(reel => <tr key={reel.inventory_stock_id} className={pendingId === reel.inventory_stock_id ? 'is-selected' : ''}
        onClick={() => { if (!working) setPendingId(reel.inventory_stock_id) }} onDoubleClick={() => void confirm(reel.inventory_stock_id)}>
        <td><input type="radio" name={titleId} aria-label={`Select reel ${reel.reel_number}`} checked={pendingId === reel.inventory_stock_id} disabled={working} onChange={() => setPendingId(reel.inventory_stock_id)} /></td>
        <td><strong>{reel.reel_number}</strong><small>{reel.material_no}</small></td><td className="numeric">{number(reel.gsm)}</td><td className="numeric">{number(reel.bf)}</td><td className="numeric">{number(reel.reel_size_cm)}</td><td>{reel.shade || '—'}</td><td className="numeric reel-available-weight">{number(reel.available_weight)} KG</td>
        <td>{reel.paper_type || '—'}</td><td>{reel.vendor_name || '—'}</td><td>{reel.purchase_order_number || '—'}</td><td>{reel.reel_status || 'Available'}</td>
      </tr>)}{!displayed.length && <tr><td colSpan={11} className="reel-selection-empty">{eligible.length ? 'No reels match the selected filters.' : 'No eligible reels are currently available.'}</td></tr>}</tbody>
    </table></div>
    <footer><div className="reel-selection-pagination"><span aria-live="polite">{filtered.length} reels · Page {currentPage + 1} of {pages}</span><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      <div>{selectedId > 0 && <button type="button" disabled={working} onClick={() => void confirm(0)}>Remove Reel</button>}<button type="button" disabled={working} onClick={onClose}>Cancel</button><button type="button" className="reel-selection-confirm" disabled={working || !filtered.some(reel => reel.inventory_stock_id === pendingId)} onClick={() => void confirm(pendingId)}>{working ? 'Checking Reel…' : 'Select Reel'}</button></div>
    </footer>
  </dialog>, document.body)
}
