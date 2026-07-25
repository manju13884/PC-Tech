import type { SavedPaperRequest } from '../paper-purchase-request/paperPurchaseRequestService'

export interface PendingPaperRequest {
  id: number
  requestNumber: string
  customerName: string
  salesOrderNumber: string
  requestedByName: string | null
  requestedAt: string
  status: 'PENDING_APPROVAL'
  totalItems: number
  eligibleItems: number
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    // Use fallback.
  }
  return `Request failed (${response.status})`
}

export async function getPendingPaperRequests(): Promise<PendingPaperRequest[]> {
  const response = await fetch('/api/paper-purchase-requests/pending', { credentials: 'include' })
  if (!response.ok) throw new Error(await errorMessage(response))
  const body = await response.json() as { requests?: PendingPaperRequest[] }
  return Array.isArray(body.requests) ? body.requests : []
}

export async function getPaperRequestDetails(requestId: number): Promise<SavedPaperRequest> {
  const response = await fetch(`/api/paper-purchase-requests/${requestId}`, { credentials: 'include' })
  if (!response.ok) throw new Error(await errorMessage(response))
  const body = await response.json() as { request?: SavedPaperRequest }
  if (!body.request) throw new Error('Paper Purchase Request details were unavailable')
  return body.request
}

export async function approvePaperRequest(requestId: number): Promise<void> {
  const response = await fetch(`/api/paper-purchase-requests/${requestId}/approve`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(await errorMessage(response))
}

export async function rejectPaperRequest(requestId: number, reason: string): Promise<void> {
  const response = await fetch(`/api/paper-purchase-requests/${requestId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
}
