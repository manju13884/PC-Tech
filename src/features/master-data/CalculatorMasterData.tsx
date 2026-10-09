import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveMasterData, type MasterDataValues } from './masterDataFields'

const MasterDataContext = createContext<MasterDataValues>(resolveMasterData({}))
export const useCalculatorMasterData = () => useContext(MasterDataContext)

export default function CalculatorMasterData({ children, live = false }: { children: ReactNode; live?: boolean }) {
  const [values, setValues] = useState<MasterDataValues | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    const refresh = () => fetch('/api/calculator-defaults', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load calculator defaults')
        setValues(resolveMasterData(await response.json()))
        setError(false)
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    void refresh()
    return () => { controller.abort() }
  }, [attempt])
  useEffect(() => {
    if (!live) return
    const controller = new AbortController()
    let refreshing = false
    const refresh = async () => {
      if (refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await fetch('/api/calculator-defaults', { signal: controller.signal, cache: 'no-store', headers: { 'X-PC-Tech-Background': '1' } })
        if (!response.ok) return
        const updated = resolveMasterData(await response.json())
        if (!controller.signal.aborted) setValues(updated)
      } catch {
        // Keep the last loaded settings when a background refresh fails.
      } finally {
        refreshing = false
      }
    }
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [live])
  if (error) return <div className="data-management-utility"><p role="alert">Unable to load calculator defaults.</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
  if (!values) return <p role="status">Loading calculator defaults...</p>
  return <MasterDataContext.Provider value={values}>{children}</MasterDataContext.Provider>
}
