import { useState, type FormEvent } from 'react'
import { Factory, FileText, Save } from 'lucide-react'
import './master-data.css'
import ProductionItems from './ProductionItems'
import { masterDataFields, resolveMasterData, validMasterDataValue, type MasterDataValues } from './masterDataFields'

export default function MasterDataForm({
  savedValues,
  canEdit,
  onSave,
}: {
  savedValues: MasterDataValues
  canEdit: boolean
  onSave: (values: Partial<MasterDataValues>) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'paper' | 'production'>('paper')
  const [values, setValues] = useState(() => resolveMasterData(savedValues))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const normalized = resolveMasterData(values)
    const invalid = masterDataFields.find(field => field.name !== 'maximumMachineDeckle' && !validMasterDataValue(normalized[field.name], field.name))
    if (invalid) {
      setActiveTab(invalid.name === 'maximumMachineDeckle' ? 'production' : 'paper')
      setError(invalid.name === 'maximumMachineDeckle' ? 'Maximum Machine Deckle must be greater than zero.' : `Enter a valid, non-negative ${invalid.label}.`)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { maximumMachineDeckle: _maximumMachineDeckle, ...paperValues } = normalized
      await onSave(paperValues)
      setValues(normalized)
      setMessage('Master Data saved.')
    } catch {
      setError('Unable to save Master Data. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-config-page">
      <div className="admin-config-topbar">
        <div className="admin-config-tabs master-data-tabs" role="tablist" aria-label="Master Data sections">
          <button type="button" role="tab" id="master-tab-paper" aria-controls="master-data-panel-paper" aria-selected={activeTab === 'paper'} className={activeTab === 'paper' ? 'active' : ''} onClick={() => setActiveTab('paper')}><FileText size={15} aria-hidden="true" /><span>Paper</span></button>
          <button type="button" role="tab" id="master-tab-production" aria-controls="master-data-panel-production" aria-selected={activeTab === 'production'} className={activeTab === 'production' ? 'active' : ''} onClick={() => setActiveTab('production')}><Factory size={15} aria-hidden="true" /><span>Prod Planning Items</span></button>
        </div>
      </div>
    <ProductionItems canEdit={canEdit} active={activeTab === 'production'} />
    <form hidden={activeTab !== 'paper'} className="admin-config-panel master-data-form" onSubmit={save} role="tabpanel" id="master-data-panel-paper" aria-labelledby="master-tab-paper">
      <div className="master-data-grid">
        {masterDataFields.filter(field => field.name !== 'maximumMachineDeckle').map(field => (
          <div className="coc-form-field" key={field.name}>
            <label htmlFor={`master-${field.key}`}>{field.label}</label>
            <input
              id={`master-${field.key}`}
              type="text"
              inputMode="decimal"
              value={values[field.name]}
              disabled={saving || !canEdit}
              onChange={event => {
                setValues(previous => ({ ...previous, [field.name]: event.target.value }))
                setMessage('')
                setError('')
              }}
              onBlur={() => setValues(previous => ({ ...previous, [field.name]: previous[field.name].trim() || field.defaultValue }))}
            />
          </div>
        ))}
      </div>
      <div className="admin-dialog-actions">
        <button className="primary" type="submit" disabled={saving || !canEdit}>
          <Save size={15} aria-hidden="true" />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
      {message && <p className="admin-user-message success" role="status">{message}</p>}
      {error && <p id="master-data-error" className="admin-user-message" role="alert">{error}</p>}
    </form>
    </div>
  )
}
