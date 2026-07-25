import type { SavedPaperRequest } from '../paper-purchase-request/paperPurchaseRequestService'

export interface ApprovedPaperRequest {
  id: number
  requestNumber: string
  requestDate: string
  customerId: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  approvedAt: string | null
  approvedByName: string | null
  eligibleItemCount: number
  paperRequirementKg: number
  status: 'APPROVED'
}

export interface PaperPoSource {
  paperRequestId: number
  requestNumber: string
  customerName: string
  salesOrderId: string
  salesOrderNumber: string
  itemName: string
  itemType: string
  layerKey: string
  layerName: string
  paperType: string
  gsm: number
  bf: number
  deckleCm: number | null
  cutLengthCm: number | null
  quantity: number
  unit: 'KG'
}

export interface ConsolidatedPaperRow {
  groupKey: string
  paperType: string
  gsm: number
  bf: number
  deckleCm: number | null
  cutLengthCm: number | null
  unit: 'KG'
  sourceRequestCount: number
  sourceSaleOrderCount: number
  sourceLayerCount: number
  sourceLayers: string[]
  consolidatedQuantity: number
  sources: PaperPoSource[]
}

export interface ConsolidationResult {
  selectedRequestCount: number
  selectedSaleOrderCount: number
  selectedCustomerCount: number
  sourcePaperRowCount: number
  consolidatedGroupCount: number
  rowsRequiringReview: number
  totalsByUnit: Record<string, number>
  consolidatedRows: ConsolidatedPaperRow[]
  incompleteSpecificationRows: Array<{
    source: PaperPoSource & { gsm: number | null; bf: number | null; quantity: number | null }
    missingSpecifications: string[]
  }>
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    // Use status fallback.
  }
  return `Request failed (${response.status})`
}

export async function getApprovedPaperRequests(): Promise<ApprovedPaperRequest[]> {
  const response = await fetch('/api/paper-po-calculation/approved-requests', { credentials: 'include' })
  if (!response.ok) throw new Error(await responseError(response))
  const body = await response.json() as { requests?: ApprovedPaperRequest[] }
  return Array.isArray(body.requests) ? body.requests : []
}

export async function getApprovedPaperRequestDetails(requestId: number): Promise<SavedPaperRequest> {
  const response = await fetch(`/api/paper-po-calculation/approved-requests/${requestId}`, {
    credentials: 'include',
  })
  if (!response.ok) throw new Error(await responseError(response))
  const body = await response.json() as { request?: SavedPaperRequest }
  if (!body.request) throw new Error('Approved request details were unavailable')
  return body.request
}

export async function calculateConsolidatedPaperRequirement(
  paperRequestIds: number[],
): Promise<ConsolidationResult> {
  const response = await fetch('/api/paper-po-calculation/consolidate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paperRequestIds }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  return response.json() as Promise<ConsolidationResult>
}
