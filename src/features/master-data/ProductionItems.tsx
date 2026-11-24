import { useEffect, useRef, useState } from 'react'
import { Save, Search } from 'lucide-react'

type Item = { item_id: string; item_name: string; sku: string }
export default function ProductionItems({ canEdit, active }: { canEdit: boolean; active: boolean }) {
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const selectAll = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch('/api/production-planning/items', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load Books items.')
      if (!Array.isArray(data.items) || !Array.isArray(data.selectedIds)) throw new Error('Invalid Books item response.')
      setItems(data.items)
      const ids = new Set<string>(data.selectedIds)
      setSelected(ids); setSaved(new Set(ids))
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load Books items.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  const visible = items.filter(item => item.item_name.toLowerCase().includes(search.toLowerCase().trim()))
  const selectedVisible = visible.filter(item => selected.has(item.item_id)).length
  const allVisible = visible.length > 0 && selectedVisible === visible.length
  const dirty = selected.size !== saved.size || [...selected].some(id => !saved.has(id))
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedVisible > 0 && !allVisible }, [selectedVisible, allVisible])
  function toggleVisible(checked: boolean) {
    setSelected(previous => { const next = new Set(previous); for (const item of visible) { if (checked) next.add(item.item_id); else next.delete(item.item_id) } return next })
    setMessage('')
  }
  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/production-planning/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedIds: [...selected] }) })
      if (!response.ok) throw new Error('Unable to save item selection.')
      setSaved(new Set(selected)); setMessage('Production Planning items saved.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save item selection.') }
    finally { setSaving(false) }
  }
  return <section className="admin-config-panel master-data-form master-items" role="tabpanel" id="master-data-panel-production" aria-labelledby="master-tab-production" hidden={!active}>
    <div className="admin-panel-toolbar master-items-toolbar">
      <label className="master-items-search"><Search size={15} aria-hidden="true" /><span className="master-items-sr-only">Search items</span><input type="search" placeholder="Search items" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <em className="master-items-note">Only selected Items will be available for Production Planning.</em>
      <span className="master-items-count" role="status">{selected.size} selected{dirty ? ' - Unsaved changes' : ''}</span>
      <button type="button" className="primary master-items-save" onClick={() => void save()} disabled={!canEdit || saving || loading || !dirty}><Save size={15} aria-hidden="true" />{saving ? 'Saving...' : 'Save'}</button>
    </div>
    {loading ? <p className="master-items-state" role="status">Loading Books items...</p> : error && !items.length ? <div className="master-items-state"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>
      <div className="master-items-list">
        <div className="master-items-list-header">
          <label><input ref={selectAll} type="checkbox" checked={allVisible} disabled={!canEdit || saving || !visible.length} onChange={event => toggleVisible(event.target.checked)} /> Select all displayed items</label>
          <span>{visible.length} items</span>
        </div>
        {visible.length ? <div className="master-items-grid">{visible.map(item => <label className="master-items-row" key={item.item_id}>
          <input type="checkbox" checked={selected.has(item.item_id)} disabled={!canEdit || saving} onChange={event => { const checked = event.target.checked; setSelected(previous => { const next = new Set(previous); if (checked) next.add(item.item_id); else next.delete(item.item_id); return next }); setMessage('') }} />
          <span>{item.item_name}</span>
        </label>)}</div> : <p className="master-items-state">{items.length ? 'No items match your search.' : 'No Books items found.'}</p>}
      </div>
      {!canEdit && <p className="master-items-hint">You have view-only access.</p>}
      {message && <p className="admin-user-message success" role="status">{message}</p>}
      {error && <p className="admin-user-message" role="alert">{error}</p>}
    </>}
  </section>
}
