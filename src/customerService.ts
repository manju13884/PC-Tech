export interface Customer {
  customer_id: string
  customer_name: string
  gst_number: string
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

function mapCustomer(value: unknown): Customer | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const customer = value as Partial<Customer>

  if (
    typeof customer.customer_id !== 'string' ||
    typeof customer.customer_name !== 'string'
  ) {
    return null
  }

  return {
    customer_id: customer.customer_id,
    customer_name: customer.customer_name,
    gst_number: typeof customer.gst_number === 'string' ? customer.gst_number : '',
  }
}

export function isCustomersLoading(): boolean {
  return loading
}

export function getCustomersError(): string | null {
  return error
}

export async function getCustomers(): Promise<Customer[]> {
  loading = true
  error = null

  try {
    const response = await fetch('/api/customers')

    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to load customers (${response.status})`))
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data)) {
      throw new Error('Customer response was not a list')
    }

    return data
      .map(mapCustomer)
      .filter((customer): customer is Customer => customer !== null)
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to load customers'
    return []
  } finally {
    loading = false
  }
}
