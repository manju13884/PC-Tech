import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveMasterData, type MasterDataValues } from './masterDataFields'

const MasterDataContext = createContext<MasterDataValues>(resolveMasterData({}))
export const useCalculatorMasterData = () => useContext(MasterDataContext)

export default function CalculatorMasterData({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<MasterDataValues | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    fetch('/api/calculator-defaults', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load calculator defaults')
        setValues(resolveMasterData(await response.json()))
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [attempt])
  if (error) return <div className="data-management-utility"><p role="alert">Unable to load calculator defaults.</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
  if (!values) return <p role="status">Loading calculator defaults...</p>
  return <MasterDataContext.Provider value={values}>{children}</MasterDataContext.Provider>
}
