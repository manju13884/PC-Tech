import { useCallback, useEffect, useState } from 'react'
import { getCustomerOpenSalesOrderSummary, type HomeDashboardSummary } from '../../homeDashboardService'
import { summarizeDashboardLeads, type LeadStatusSummary } from '../utils/leadSummary'

export interface PurchaseDashboardSummary {
  pendingApproval: number
  approvedPendingPo: number
  rejected: number
  openRequests: number
}

const emptySummary: HomeDashboardSummary = { salesOrders: null, invoices: null, errors: { sales: null, finance: null } }

export function useDashboardData(loadPurchases: boolean, loadLeads = false) {
  const [summary, setSummary] = useState<HomeDashboardSummary>(emptySummary)
  const [purchases, setPurchases] = useState<PurchaseDashboardSummary | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [leads, setLeads] = useState<ReturnType<typeof summarizeDashboardLeads> | null>(null)
  const [leadError, setLeadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async (refreshCache = false) => {
    setLoading(true)
    const overviewPromise = getCustomerOpenSalesOrderSummary(refreshCache)
    const purchasePromise = loadPurchases
      ? fetch('/api/dashboard/purchases', { credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new Error('Unable to load purchase data.')
        return response.json() as Promise<PurchaseDashboardSummary>
      })
      : Promise.resolve(null)
    const leadPromise = loadLeads
      ? fetch('/api/leads?summary=1', { credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new Error('Unable to load lead summary.')
        const payload = await response.json() as { summary?: LeadStatusSummary[] }
        if (!Array.isArray(payload.summary)) throw new Error('Invalid lead summary.')
        return summarizeDashboardLeads(payload.summary)
      })
      : Promise.resolve(null)
    const [overviewResult, purchaseResult, leadResult] = await Promise.allSettled([overviewPromise, purchasePromise, leadPromise])
    if (overviewResult.status === 'fulfilled') {
      setSummary(overviewResult.value)
      setRefreshedAt(overviewResult.value.refreshedAt ? new Date(overviewResult.value.refreshedAt) : new Date())
    } else {
      setSummary({ ...emptySummary, errors: { sales: 'Unable to load sales data.', finance: 'Unable to load finance data.' } })
      setRefreshedAt(new Date())
    }
    if (purchaseResult.status === 'fulfilled') {
      setPurchases(purchaseResult.value)
      setPurchaseError(null)
    } else {
      setPurchaseError('Unable to load purchase data.')
    }
    if (leadResult.status === 'fulfilled') {
      setLeads(leadResult.value)
      setLeadError(null)
    } else {
      setLeads(null)
      setLeadError('Unable to load lead summary.')
    }
    setLoading(false)
  }, [loadPurchases, loadLeads])

  useEffect(() => { void load() }, [load])
  const refresh = useCallback(() => load(true), [load])
  return { summary, purchases, purchaseError, leads, leadError, loading, refreshedAt, refresh }
}
