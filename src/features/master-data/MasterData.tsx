import { useEffect, useState } from 'react'
import MasterDataForm from './MasterDataForm'
import type { MasterDataValues } from './masterDataFields'

export default function MasterData() {
  const [data, setData] = useState<(MasterDataValues & { canEdit: boolean }) | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/master-data', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load Master Data. Please reopen this page to retry.')
        setData(await response.json())
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])

  if (error) return <p className="admin-user-message" role="alert">{error}</p>
  if (!data) return <p className="data-management-message" role="status">Loading Master Data...</p>
  return <MasterDataForm savedValues={data} canEdit={data.canEdit} onSave={async values => {
    const response = await fetch('/api/master-data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!response.ok) throw new Error('Unable to save Master Data.')
  }} />
}
