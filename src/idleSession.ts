export const IDLE_TIMEOUT_MS = 5 * 60 * 1000

// Keep the deadline across reloads in this tab.
const STORAGE_KEY = 'pc-tech-last-activity'

export function monitorIdleSession(onIdle: () => void): () => void {
  let lastActivity = Date.now()
  try {
    const stored = Number(window.sessionStorage.getItem(STORAGE_KEY))
    if (stored > 0 && stored <= lastActivity) lastActivity = stored
  } catch {
    // The timer still works when browser storage is unavailable.
  }
  let timer: number
  let expired = false

  const saveActivity = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(lastActivity))
    } catch {
      // Storage is optional.
    }
  }
  const checkDeadline = () => {
    window.clearTimeout(timer)
    if (expired) return
    const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivity)
    if (remaining <= 0) {
      expired = true
      onIdle()
      return
    }
    timer = window.setTimeout(checkDeadline, remaining)
  }
  const handleActivity = () => {
    // A delayed event must not revive a session whose deadline has passed.
    checkDeadline()
    if (expired || document.visibilityState === 'hidden') return
    lastActivity = Date.now()
    saveActivity()
    checkDeadline()
  }
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
  for (const event of events) {
    window.addEventListener(event, handleActivity, { capture: true, passive: true })
  }
  window.addEventListener('focus', checkDeadline)
  document.addEventListener('visibilitychange', checkDeadline)
  saveActivity()
  checkDeadline()

  return () => {
    window.clearTimeout(timer)
    for (const event of events) window.removeEventListener(event, handleActivity, true)
    window.removeEventListener('focus', checkDeadline)
    document.removeEventListener('visibilitychange', checkDeadline)
  }
}

export function clearIdleSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is optional.
  }
}
