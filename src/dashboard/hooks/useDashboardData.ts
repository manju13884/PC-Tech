import { useCallback, useEffect, useState } from 'react'
import { getCustomerOpenSalesOrderSummary, type HomeDashboardSummary } from '../../homeDashboardService'

export interface PurchaseDashboardSummary {
  pendingApproval: number
  approvedPendingPo: number
  rejected: number
  openRequests: number
}

const emptySummary: HomeDashboardSummary = { salesOrders: null, invoices: null, errors: { sales: null, finance: null } }

export function useDashboardData(loadPurchases: boolean) {
  const [summary, setSummary] = useState<HomeDashboardSummary>(emptySummary)
  const [purchases, setPurchases] = useState<PurchaseDashboardSummary | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const overviewPromise = getCustomerOpenSalesOrderSummary()
    const purchasePromise = loadPurchases
      ? fetch('/api/dashboard/purchases', { credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new Error('Unable to load purchase data.')
        return response.json() as Promise<PurchaseDashboardSummary>
      })
      : Promise.resolve(null)
    const [overviewResult, purchaseResult] = await Promise.allSettled([overviewPromise, purchasePromise])
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
    setLoading(false)
  }, [loadPurchases])

  useEffect(() => { void refresh() }, [refresh])
  return { summary, purchases, purchaseError, loading, refreshedAt, refresh }
}
