import { useEffect, useState, useSyncExternalStore } from 'react'
import { getRequestActivity, subscribeRequestActivity } from './requestActivity'
import './request-activity.css'

export default function RequestActivityIndicator() {
  const activity = useSyncExternalStore(subscribeRequestActivity, getRequestActivity)
  const [visible, setVisible] = useState(false)
  const busy = activity.pending > 0
  useEffect(() => {
    if (!busy) { setVisible(false); return }
    const timeout = window.setTimeout(() => setVisible(true), 200)
    return () => window.clearTimeout(timeout)
  }, [busy])

  if (!busy || !visible) return null
  return (
    <div className="request-activity" role="status" aria-live="polite" aria-atomic="true">
      <div className="request-activity-animation" aria-hidden="true">
        <svg className="request-activity-ring" viewBox="0 0 100 100">
          <defs><linearGradient id="request-activity-blue" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#bae6fd" /><stop offset=".5" stopColor="#38bdf8" /><stop offset="1" stopColor="#168eef" /></linearGradient></defs>
          <circle cx="50" cy="50" r="44" fill="none" stroke="#dceefa" strokeWidth="2" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="url(#request-activity-blue)" strokeWidth="3" strokeLinecap="round" strokeDasharray="210 67" />
          <circle cx="50" cy="6" r="2.5" fill="#168eef" stroke="#dbeeff" strokeWidth=".5" />
          <circle cx="12" cy="72" r="2.5" fill="#168eef" stroke="#dbeeff" strokeWidth=".5" />
        </svg>
        <img src="/assets/Bird Logo-transparent.png" alt="" />
      </div>
      <span>{activity.processing > 0 ? 'Processing...' : 'Loading...'}</span>
    </div>
  )
}
