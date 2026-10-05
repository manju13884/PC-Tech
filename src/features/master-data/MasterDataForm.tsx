import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import './master-data.css'
import { masterDataFields, resolveMasterData, validMasterDataValue, type MasterDataValues } from './masterDataFields'

export default function MasterDataForm({
  savedValues,
  canEdit,
  onSave,
}: {
  savedValues: MasterDataValues
  canEdit: boolean
  onSave: (values: MasterDataValues) => Promise<void>
}) {
  const [values, setValues] = useState(() => resolveMasterData(savedValues))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const normalized = resolveMasterData(values)
    const invalid = masterDataFields.find(field => !validMasterDataValue(normalized[field.name], field.name))
    if (invalid) {
      setError(invalid.name === 'maximumMachineDeckle' ? 'Maximum Machine Deckle must be greater than zero.' : `Enter a valid, non-negative ${invalid.label}.`)
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await onSave(normalized)
      setValues(normalized)
      setMessage('Master Data saved.')
    } catch {
      setError('Unable to save Master Data. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="admin-config-panel master-data-form" onSubmit={save}>
      <div className="master-data-grid">
        {masterDataFields.map(field => (
          <div className="coc-form-field" key={field.name}>
            <label htmlFor={`master-${field.key}`}>{field.label}</label>
            <input
              id={`master-${field.key}`}
              type="text"
              inputMode="decimal"
              required={field.name === 'maximumMachineDeckle'}
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
  )
}
