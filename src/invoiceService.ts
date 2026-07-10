export interface Invoice {
  invoice_id: string
  invoice_number: string
}

let loading = false
let error: string | null = null

async function getResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json()

    if (payload && typeof payload === 'object') {
      const errorPayload = payload as { error?: unknown; message?: unknown }

      if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) {
        return errorPayload.error
      }

      if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) {
        return errorPayload.message
      }
    }
  } catch {
    // Fall back to the status-based message when the response body is not JSON.
  }

  return fallback
}

function isInvoice(value: unknown): value is Invoice {
  if (!value || typeof value !== 'object') {
    return false
  }

  const invoice = value as Partial<Invoice>

  return (
    typeof invoice.invoice_id === 'string' &&
    typeof invoice.invoice_number === 'string'
  )
}

export function isInvoicesLoading(): boolean {
  return loading
}

export function getInvoicesError(): string | null {
  return error
}

export async function getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
  loading = true
  error = null

  try {
    const params = new URLSearchParams({ customer_id: customerId })
    const response = await fetch(`/api/invoices?${params.toString()}`)

    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to load invoices (${response.status})`))
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data)) {
      throw new Error('Invoice response was not a list')
    }

    return data.filter(isInvoice)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to load invoices'
    return []
  } finally {
    loading = false
  }
}
