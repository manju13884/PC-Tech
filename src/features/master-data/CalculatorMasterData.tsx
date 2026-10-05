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
    const onFocus = () => { void refresh() }
    const timer = live ? window.setInterval(onFocus, 30000) : undefined
    if (live) window.addEventListener('focus', onFocus)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [attempt, live])
  if (error) return <div className="data-management-utility"><p role="alert">Unable to load calculator defaults.</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
  if (!values) return <p role="status">Loading calculator defaults...</p>
  return <MasterDataContext.Provider value={values}>{children}</MasterDataContext.Provider>
}
