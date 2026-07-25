import type { PaperCostResult } from './types/paperPurchaseRequest'

export interface SavedPaperRequestItem {
  salesOrderItemId: string
  itemId: string
  itemName: string
  itemDescription: string
  orderedQuantity: number
  isPaperEligible: boolean
  itemType: string
  result: PaperCostResult | null
}

export interface SavedPaperRequest {
  id: number
  requestNumber: string
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  customerId: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  requestedAt: string
  approvedByName?: string | null
  approvedAt?: string | null
  rejectionReason?: string | null
  rejectedByName?: string | null
  rejectedAt?: string | null
  resubmittedAt?: string | null
  resubmissionCount?: number
  history?: Array<{
    previousStatus: string | null
    newStatus: string
    actionType: string
    actionReason: string | null
    actionByName: string | null
    actionAt: string
  }>
  items: SavedPaperRequestItem[]
}

async function responseError(response: Response): Promise<{ message: string; request?: SavedPaperRequest }> {
  try {
    const payload = await response.json() as { error?: unknown; request?: SavedPaperRequest }
    return {
      message: typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`,
      request: payload.request,
    }
  } catch {
    return { message: `Request failed (${response.status})` }
  }
}

export async function getPaperRequestBySalesOrder(salesOrderId: string): Promise<SavedPaperRequest | null> {
  const params = new URLSearchParams({ salesOrderId })
  const response = await fetch(`/api/paper-purchase-requests/by-sales-order?${params.toString()}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error((await responseError(response)).message)
  const payload = await response.json() as { exists?: boolean; request?: SavedPaperRequest | null }
  return payload.exists && payload.request ? payload.request : null
}

export async function submitPaperRequest(payload: {
  customerId: string
  salesOrderId: string
  items: Array<{ salesOrderItemId: string; itemId: string; result: PaperCostResult | null }>
}): Promise<SavedPaperRequest> {
  const response = await fetch('/api/paper-purchase-requests', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const failure = await responseError(response)
    const error = new Error(failure.message) as Error & { request?: SavedPaperRequest; status?: number }
    error.request = failure.request
    error.status = response.status
    throw error
  }
  const result = await response.json() as { request?: SavedPaperRequest }
  if (!result.request) throw new Error('The submitted Paper Purchase Request could not be loaded')
  return result.request
}

export async function resubmitPaperRequest(
  requestId: number,
  payload: {
    customerId: string
    salesOrderId: string
    items: Array<{ salesOrderItemId: string; itemId: string; result: PaperCostResult | null }>
  },
): Promise<void> {
  const response = await fetch(`/api/paper-purchase-requests/${requestId}/resubmit`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error((await responseError(response)).message)
}
