import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, X, Phone, Mail, MessageSquare, MapPin, Users, CalendarDays, Clock3, ListFilter } from 'lucide-react'
import {
  leadSources,
  leadStatuses,
  leadStatusReasonLabels,
  contactModes,
  type Lead,
  type Coordinator,
  type LeadActivity,
  type LeadHistory,
} from './leadTypes'
import { formatLeadDate, formatLeadDateTime } from './leadDateFormatting'
import { parseLeadChangeDetails, leadHistoryActionLabels, leadHistoryFieldLabels } from './leadHistoryFormatting'
import './lead-management.css'

interface Listing {
  leads: Lead[]
  total: number
  summary: { status: string; count: number; due: number; overdue: number }[]
  coordinators: Coordinator[]
  permissions: { view: boolean; create: boolean; edit: boolean; reassign: boolean; viewAll: boolean }
  admin: boolean
  userId: number
  today: string
}
interface Detail {
  lead: Lead
  activities: LeadActivity[]
  history: LeadHistory[]
  customers: { customer_id: string; customer_name: string }[]
}
const displayMobileNumbers = (value: string) =>
  value.split(',').map((number) => number.trim()).filter(Boolean).join('\n')

function LeadDateInput({ value, onChange, required = false }: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <span className="lead-date-input">
      <input type="date" value={value} required={required} onChange={(event) => onChange(event.target.value)} />
      <span aria-hidden="true">{formatLeadDate(value, 'DD Mmm YYYY')}</span>
    </span>
  )
}

type Mode = 'view' | 'create' | 'edit' | 'followup' | 'status' | 'reassign' | 'convert'
async function api<T>(query: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/leads${query}`, {
    credentials: 'include',
    signal,
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  })
  const data = await response.json()
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Unable to load leads.'), {
      duplicate: data.duplicate,
    })
  return data
}
export default function LeadManagement() {
  const [data, setData] = useState<Listing | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [coordinator, setCoordinator] = useState(''),
    [followUp, setFollowUp] = useState(''),
    [sort, setSort] = useState('created'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [mode, setMode] = useState<Mode | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [form, setForm] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false),
    [modalError, setModalError] = useState(''),
    [duplicate, setDuplicate] = useState(false),
    [confirmed, setConfirmed] = useState(false)
  const detailAbort = useRef<AbortController | null>(null)
  const detailRequest = useRef(0),
    searchRef = useRef<HTMLInputElement>(null),
    dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!mode) return
    const previous = document.activeElement as HTMLElement | null
    const timer = setTimeout(
      () => dialogRef.current?.querySelector<HTMLElement>('button,input,select,textarea')?.focus(),
      0,
    )
    return () => {
      clearTimeout(timer)
      if (previous?.isConnected) previous.focus()
    }
  }, [mode])
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => () => detailAbort.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const query = new URLSearchParams({
      search: debouncedSearch, status, coordinator, follow_up: followUp, sort, page: String(page),
    })
    api<Listing>(`?${query}`, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message)
          setData(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [debouncedSearch, status, coordinator, followUp, sort, page, revision])
  function close() {
    detailAbort.current?.abort()
    detailRequest.current++
    setMode(null)
    setDetail(null)
    setForm({})
    setModalError('')
    setDuplicate(false)
    setConfirmed(false)
  }
  async function open(next: Mode, lead?: Lead) {
    detailAbort.current?.abort()
    const controller = new AbortController()
    detailAbort.current = controller
    const requestId = ++detailRequest.current
    setModalError('')
    setDuplicate(false)
    setConfirmed(false)
    setDetail(null)
    setMode(next)
    setForm(
      lead
        ? Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, String(v ?? '')]))
        : {
            source: 'Cold Calling',
            coordinator_id: data?.admin ? '' : String(data?.userId || ''),
            status: 'New',
          },
    )
    if (lead) {
      try {
        const result = await api<Detail>(
          `?id=${lead.id}${next === 'convert' ? '&customers=1' : next === 'view' ? '' : '&section=form'}`,
          undefined, controller.signal,
        )
        if (requestId !== detailRequest.current) return
        setDetail(result)
        setForm({
          ...Object.fromEntries(Object.entries(result.lead).map(([k, v]) => [k, String(v ?? '')])),
          ...(next === 'followup'
            ? { contact_date: data?.today || '', mode: 'Call', discussion: '', next_action: '' }
            : {}),
        })
      } catch (e) {
        if (requestId === detailRequest.current) setModalError((e as Error).message)
      }
    }
  }
  function change(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setDuplicate(false)
    setConfirmed(false)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setModalError('')
    try {
      await api('', {
        ...form,
        action: mode,
        id: detail?.lead.id,
        version: detail?.lead.version,
        confirm: confirmed,
        confirm_duplicate: duplicate && confirmed,
      })
      close()
      setRevision((v) => v + 1)
    } catch (e) {
      const err = e as Error & { duplicate?: boolean }
      setModalError(err.message)
      if (err.duplicate) {
        setDuplicate(true)
        setConfirmed(false)
      }
    } finally {
      setSaving(false)
    }
  }
  function field(key: string, label: string, required = false, type = 'text') {
    return (
      <label key={key}>
        {label}
        {required ? ' *' : ''}
        {type === 'date' ? (
          <LeadDateInput value={form[key] || ''} required={required} onChange={(value) => change(key, value)} />
        ) : (
        <input
          type={type}
          value={form[key] || ''}
          maxLength={2000}
          required={required}
          onChange={(e) => change(key, e.target.value)}
        />
        )}
      </label>
    )
  }
  const coordinatorField = (
    <label>
      Sales Coordinator
      <select disabled={!(data?.admin || (mode === 'reassign' && data?.permissions.reassign))} value={form.coordinator_id || ''} onChange={(e) => change('coordinator_id', e.target.value)}>
        <option value="">Unassigned (assign later)</option>
        {data?.coordinators.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </select>
    </label>
  )
  const editable = data?.permissions.edit,
    counts = data?.summary || [],
    count = (s: string) => Number(counts.find((c) => c.status === s)?.count || 0)
  const summary = [
    ['Total Leads', counts.reduce((n, c) => n + Number(c.count), 0)],
    ['New Leads', count('New')],
    ['Follow-ups Due Today', counts.reduce((n, c) => n + Number(c.due), 0)],
    ['Overdue Follow-ups', counts.reduce((n, c) => n + Number(c.overdue), 0)],
    ['Converted Leads', count('Converted')],
  ]
  const actions = (lead: Lead) => (
    <>
      <button className="lead-action-view" onClick={() => void open('view', lead)}>View</button>
      {editable && (data?.permissions.viewAll || lead.coordinator_id === data?.userId) && (
        <>
          <button className="lead-action-edit" onClick={() => void open('edit', lead)}>Edit</button>
          <button className="lead-action-followup" onClick={() => void open('followup', lead)}>Add Follow-up</button>
          {lead.status !== 'Converted' && (
            <button className="lead-action-status" onClick={() => void open('status', lead)}>Update Status</button>
          )}
          {['Qualified', 'Quotation'].includes(lead.status) && (
            <button className="lead-action-convert" onClick={() => void open('convert', lead)}>Convert to Customer</button>
          )}
        </>
      )}
      {data?.permissions.reassign && <button className="lead-action-reassign" onClick={() => void open('reassign', lead)}>Reassign</button>}
    </>
  )
  return (
    <section className="lead-management" aria-label="Lead Management">
      <div className="lead-overview">
      <div className="lead-toolbar">
        <div className="lead-toolbar-title"><ListFilter size={14} aria-hidden="true" /><strong>Sales pipeline</strong><span>{data?.total || 0} {data?.total === 1 ? 'lead' : 'leads'}</span></div>
        <div>
          <button onClick={() => setRevision((v) => v + 1)} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          {data?.permissions.create && (
            <button className="lead-primary" onClick={() => void open('create')}>
              <Plus size={14} /> New Lead
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="lead-error">
          {error}
        </p>
      )}
      <div className="lead-summary">
        {summary.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{loading ? '—' : value}</strong>
          </div>
        ))}
      </div>
      </div>
      <nav className="lead-tabs" aria-label="Lead status">
        <span className="lead-tabs-label"><ListFilter size={12} aria-hidden="true" />Status</span>
        {['', ...leadStatuses].map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            aria-label={`${s || 'All'} (${s ? count(s) : summary[0][1]})`}
            onClick={() => {
              setStatus(s)
              setPage(1)
            }}
          >
            <span>{s || 'All'}</span>
            <span className="lead-tab-count" aria-hidden="true">{s ? count(s) : summary[0][1]}</span>
          </button>
        ))}
      </nav>
      <div className="lead-filters">
        <label>
          Search
          <input
            ref={searchRef}
            value={search}
            placeholder="Company, contact, mobile or lead ID"
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </label>
        {data?.permissions.viewAll && (
          <label>
            Sales Coordinator
            <select
              value={coordinator}
              onChange={(e) => {
                setCoordinator(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All coordinators</option>
              {data.coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Follow-up date
          <LeadDateInput value={followUp} onChange={(value) => {
            setFollowUp(value)
            setPage(1)
          }} />
        </label>
        <label>
          Sort by
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
          >
            <option value="created">Created date (newest first)</option>
            <option value="follow_up">Next follow-up (earliest first)</option>
          </select>
        </label>
        <button className="lead-clear-filters" type="button" disabled={!search && !status && !coordinator && !followUp && sort === 'created'} onClick={() => {
          setSearch('')
          setStatus('')
          setCoordinator('')
          setFollowUp('')
          setSort('created')
          setPage(1)
        }}><X size={12} aria-hidden="true" />Clear filters</button>
      </div>
      <div className="lead-grid" aria-busy={loading}>
        <table>
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '18%' }} />
            <col style={{ width: '13%' }} /><col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} /><col /><col style={{ width: 112 }} />
          </colgroup>
          <thead>
            <tr>
              {['Lead / Company', 'Contact', 'Location / Source', 'Sales Coordinator', 'Lead Status', 'Follow-up Dates', 'Actions'].map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {data?.leads.map((lead) => (
              <tr key={lead.id}>
                <td data-label="Lead / Company">
                  <div className="lead-cell-stack">
                    <button className="lead-link" onClick={() => void open('view', lead)}>{lead.lead_number}</button>
                    <strong>{lead.company}</strong>
                    <small>Created {formatLeadDate(lead.created_at)}</small>
                  </div>
                </td>
                <td data-label="Contact">
                  <div className="lead-cell-stack">
                    <span>{lead.contact || '\u2014'}</span>
                    <span className="lead-mobile-numbers">{displayMobileNumbers(lead.mobile) || '\u2014'}</span>
                  </div>
                </td>
                <td data-label="Location / Source"><div className="lead-cell-stack"><span>{lead.city}</span><small>{lead.source}</small></div></td>
                <td data-label="Sales Coordinator">{lead.coordinator_name || 'Unassigned'}</td>
                <td data-label="Lead Status"><span className={`lead-status lead-status-${lead.status.toLowerCase().replace(/\s+/g, '-')}`}>{lead.status}</span></td>
                <td data-label="Follow-up Dates">
                  <div className="lead-cell-stack">
                    <small>Next follow-up</small>
                    <span className={lead.next_follow_up_date && lead.next_follow_up_date < data.today ? 'lead-overdue' : ''}>{formatLeadDate(lead.next_follow_up_date)}</span>
                    <small>Last contact</small>
                    <span>{formatLeadDate(lead.last_contact_date)}</span>
                  </div>
                </td>
                <td data-label="Actions"><div className="lead-actions">{actions(lead)}</div></td>
              </tr>
            ))}
            {!data?.leads.length && (
              <tr>
                <td colSpan={7}>
                  {loading
                    ? 'Loading leads…'
                    : error
                      ? 'Unable to load leads.'
                      : 'No leads match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="lead-pagination">
        <span>
          {data?.total || 0} leads · Page {page}
        </span>
        <button
          disabled={!data || loading}
          onClick={async () => {
            try {
              const query = new URLSearchParams({
                search,
                status,
                coordinator,
                follow_up: followUp,
                sort,
                export: 'csv',
              })
              const response = await fetch(`/api/leads?${query}`, { credentials: 'include' })
              if (!response.ok) throw new Error((await response.json()).error)
              const url = URL.createObjectURL(await response.blob())
              const link = document.createElement('a')
              link.href = url
              link.download = 'sales-leads.csv'
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        >
          Export CSV
        </button>
        <button disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <button
          disabled={loading || page * 25 >= (data?.total || 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {mode && (
        <div className="lead-overlay">
          <section
            ref={dialogRef}
            className="lead-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-dialog-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !saving) close()
              if (e.key === 'Tab') {
                const controls = Array.from(
                  dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
                  ) || [],
                )
                const first = controls[0],
                  last = controls[controls.length - 1]
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault()
                  last?.focus()
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault()
                  first?.focus()
                }
              }
            }}
          >
            <header>
              <h3 id="lead-dialog-title">
                {
                  {
                    view: 'Lead Details',
                    create: 'New Lead',
                    edit: 'Edit Lead',
                    followup: 'Add Follow-up',
                    status: 'Update Status',
                    reassign: 'Reassign Lead',
                    convert: 'Convert to Customer',
                  }[mode]
                }{' '}
                {detail?.lead.lead_number}
              </h3>
              <button aria-label="Close" disabled={saving} onClick={close}>
                <X size={18} />
              </button>
            </header>
            {modalError && (
              <p className="lead-error" role="alert">
                {modalError}
              </p>
            )}
            {mode !== 'create' && !detail ? (
              <p>{modalError ? 'Close and retry.' : 'Loading lead…'}</p>
            ) : mode === 'view' && detail ? (
              <>
                <dl className="lead-details">
                  {[
                    ['Company', detail.lead.company],
                    ['Contact', detail.lead.contact],
                    ['Mobile', displayMobileNumbers(detail.lead.mobile)],
                    ['Email', detail.lead.email],
                    ['City', detail.lead.city],
                    ['Address', detail.lead.address],
                    ['Sales Coordinator', detail.lead.coordinator_name],
                    ['Status', detail.lead.status],
                    ['Source', detail.lead.source],
                    ['Product Interest', detail.lead.product],
                    ['Remarks', detail.lead.remarks],
                    [leadStatusReasonLabels[detail.lead.status] || 'Status Reason', detail.lead.status_reason || detail.lead.closure_reason],
                    ['Zoho Customer ID', detail.lead.customer_id],
                    ['Next Follow-up', formatLeadDate(detail.lead.next_follow_up_date)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v || '—'}</dd>
                    </div>
                  ))}
                </dl>
                <div className="lead-actions">{actions(detail.lead)}</div>
                <section className="lead-followups" aria-labelledby="lead-followups-title">
                  <header className="lead-section-heading">
                    <h4 id="lead-followups-title">Follow-up History <span>{detail.activities.length}</span></h4>
                    {editable && (data?.permissions.viewAll || detail.lead.coordinator_id === data?.userId) && <button className="lead-followup-add" onClick={() => void open('followup', detail.lead)}><Plus size={12} /> Add Follow-up</button>}
                  </header>
                  {!detail.activities.length ? (
                    <div className="lead-followup-empty">
                      <MessageSquare size={20} aria-hidden="true" />
                      <strong>No follow-ups yet</strong>
                      <p>Record a conversation and plan the next step for this lead.</p>
                    </div>
                  ) : (
                    <ol className="lead-followup-list">
                      {detail.activities.map((a) => {
                        const Icon = { Call: Phone, Email: Mail, WhatsApp: MessageSquare, Visit: MapPin, Meeting: Users }[a.mode] || MessageSquare
                        return (
                          <li key={a.id}>
                            <article className="lead-followup-card">
                              <header>
                                <span className="lead-contact-mode"><Icon size={12} aria-hidden="true" />{a.mode}</span>
                                <time dateTime={a.contact_date}>{formatLeadDate(a.contact_date)}</time>
                              </header>
                              <p className="lead-followup-discussion">{a.discussion}</p>
                              <div className="lead-followup-next">
                                <span><CalendarDays size={12} aria-hidden="true" />Next follow-up</span>
                                {a.next_follow_up_date ? <time dateTime={a.next_follow_up_date}>{formatLeadDate(a.next_follow_up_date)}</time> : <span className="lead-unscheduled">Not scheduled</span>}
                                {a.next_action && <p><strong>Next action</strong>{a.next_action}</p>}
                              </div>
                              <footer>
                                <span>{a.user_name}</span>
                                <span><Clock3 size={11} aria-hidden="true" /><time dateTime={a.created_at}>{formatLeadDateTime(a.created_at)}</time></span>
                              </footer>
                            </article>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </section>
                <h4>Activity History</h4>
                {detail.history.map((h) => {
                  const details = parseLeadChangeDetails(h.changes_json)
                  const value = (field: string, text: string | null) => text ? (field.endsWith('_date') ? formatLeadDate(text) : text) : 'Not set'
                  return (
                    <article className="lead-history" key={h.id}>
                      <strong>{details ? leadHistoryActionLabels[details.action] || h.event : h.event}</strong>
                      {details ? (
                        details.changes.length ? <dl className="lead-change-list">
                          {details.changes.map((change) => <div key={change.field}>
                            <dt>{leadHistoryFieldLabels[change.field] || change.field}</dt>
                            <dd><span className="lead-change-before"><small>Before</small>{value(change.field, change.previous)}</span>
                              <span className="lead-change-after"><small>After</small>{value(change.field, change.current)}</span></dd>
                          </div>)}
                        </dl> : <p>Saved without changing lead fields.</p>
                      ) : h.event === 'Updated' ? (
                        <p className="lead-history-legacy">Record updated. Field details were not recorded for this older entry.</p>
                      ) : (
                        <p>{h.previous_value ? `${h.previous_value} \u2192 ` : ''}{h.new_value}</p>
                      )}
                      <small>{h.user_name} &middot; {formatLeadDateTime(h.changed_at)}</small>
                    </article>
                  )
                })}
              </>
            ) : (
              <form onSubmit={save}>
                <div className="lead-form">
                  {(mode === 'create' || mode === 'edit') && (
                    <>
                      <div className="lead-form-section">Lead information</div>
                      <label>
                        Lead ID
                        <input
                          disabled
                          value={detail?.lead.lead_number || 'Auto-generated on save'}
                        />
                      </label>
                      {field('company', 'Company / Lead Name', true)}
                      <div className="lead-form-section">Contact details</div>
                      {field('contact', 'Contact Person')}
                      <label>
                        <span>Mobile Number <small id="lead-mobile-help" className="lead-field-hint">Enter multiple mobile numbers separated by commas.</small></span>
                        <input value={form.mobile || ''} maxLength={2000} aria-describedby="lead-mobile-help" onChange={(e) => change('mobile', e.target.value)} />
                      </label>
                      {field('email', 'Email Address', false, 'email')}
                      {field('city', 'Location / City', true)}
                      <label className="lead-wide">
                        Address
                        <textarea maxLength={2000} value={form.address || ''} onChange={(e) => change('address', e.target.value)} />
                      </label>
                      <div className="lead-form-section">Sales details</div>
                      <label>
                        Lead Source *
                        <select
                          required
                          value={form.source || ''}
                          onChange={(e) => change('source', e.target.value)}
                        >
                          {leadSources.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      {field('product', 'Product Interested')}
                      <label>
                        Lead Status
                        <input disabled value={detail?.lead.status || 'New'} />
                      </label>
                      {mode === 'create' ? coordinatorField : (
                        <label>Sales Coordinator<input disabled value={detail?.lead.coordinator_name || 'Unassigned'} /></label>
                      )}
                      <label className="lead-wide">
                        Remarks
                        <textarea
                          maxLength={2000}
                          value={form.remarks || ''}
                          onChange={(e) => change('remarks', e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {mode === 'reassign' && coordinatorField}
                  {mode === 'edit' && data?.permissions.reassign && (
                    <p className="lead-wide">Use Reassign to change the sales coordinator.</p>
                  )}
                  {mode === 'status' && (
                    <>
                      <label>
                        Status *
                        <select
                          required
                          value={form.status}
                          onChange={(e) => { change('status', e.target.value); change('status_reason', ''); change('closure_reason', '') }}
                        >
                          {leadStatuses
                            .filter((s) => s !== 'Converted')
                            .map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                        </select>
                      </label>
                      {leadStatusReasonLabels[form.status] && (
                        <label className="lead-wide">
                          {leadStatusReasonLabels[form.status]} *
                          <textarea required maxLength={2000} value={form[form.status === 'Closed' ? 'closure_reason' : 'status_reason'] || ''} onChange={(e) => change(form.status === 'Closed' ? 'closure_reason' : 'status_reason', e.target.value)} />
                        </label>
                      )}
                    </>
                  )}
                  {mode === 'followup' && (
                    <>
                      {field('contact_date', 'Contact Date', true, 'date')}
                      <label>
                        Contact Mode *
                        <select
                          required
                          value={form.mode || 'Call'}
                          onChange={(e) => change('mode', e.target.value)}
                        >
                          {contactModes.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <label className="lead-wide">
                        Discussion / Remarks *
                        <textarea
                          required
                          maxLength={4000}
                          value={form.discussion || ''}
                          onChange={(e) => change('discussion', e.target.value)}
                        />
                      </label>
                      {field(
                        'next_follow_up_date',
                        'Next Follow-up Date',
                        !['Converted', 'Closed'].includes(detail?.lead.status || ''),
                        'date',
                      )}
                      {field('next_action', 'Next Action')}
                    </>
                  )}
                  {mode === 'convert' && (
                    <>
                      <p className="lead-wide">
                        Link this lead to an existing active Zoho Books customer. Matching company
                        names appear first. Customer conversion is independent of Sales Orders.
                      </p>
                      <label className="lead-wide">
                        Zoho Books Customer *
                        <select
                          required
                          value={form.customer_id || ''}
                          onChange={(e) => change('customer_id', e.target.value)}
                        >
                          <option value="">Select verified customer</option>
                          {[...(detail?.customers || [])]
                            .sort(
                              (a, b) =>
                                Number(
                                  b.customer_name.toLowerCase() ===
                                    detail?.lead.company.toLowerCase(),
                                ) -
                                Number(
                                  a.customer_name.toLowerCase() ===
                                    detail?.lead.company.toLowerCase(),
                                ),
                            )
                            .map((c) => (
                              <option value={c.customer_id} key={c.customer_id}>
                                {c.customer_name}
                                {c.customer_name.toLowerCase() ===
                                detail?.lead.company.toLowerCase()
                                  ? ' (matching name)'
                                  : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="lead-wide">
                        If no customer exists, create it in Zoho Books, then reopen this action.
                      </p>
                    </>
                  )}
                </div>
                {(duplicate || mode === 'convert') && (
                  <label className="lead-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    {duplicate
                      ? 'I reviewed the potential duplicate warning and want to save this lead.'
                      : 'I confirm this is the correct customer and want to convert this lead.'}
                  </label>
                )}
                <footer>
                  <button type="button" disabled={saving} onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="lead-primary"
                    disabled={saving || ((duplicate || mode === 'convert') && !confirmed)}
                  >
                    {saving ? 'Saving…' : mode === 'convert' ? 'Convert to Customer' : 'Save'}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
