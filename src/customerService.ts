export interface Customer {
  customer_id: string
  customer_name: string
  gst_number: string
}

let loading = false
let error: string | null = null
let cachedCustomers: Customer[] | null = null
let customersRequest: Promise<Customer[]> | null = null
let refreshedAt: Date | null = null

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

export function getCustomersRefreshedAt(): Date | null {
  return refreshedAt
}

export async function getCustomers(): Promise<Customer[]> {
  if (cachedCustomers) return cachedCustomers
  if (customersRequest) return customersRequest

  loading = true
  error = null

  customersRequest = (async () => {
    try {
      const response = await fetch('/api/customers', { credentials: 'include' })

      if (!response.ok) {
        throw new Error(await getResponseError(response, `Unable to load customers (${response.status})`))
      }

      const data: unknown = await response.json()

      if (!Array.isArray(data)) {
        throw new Error('Customer response was not a list')
      }

      cachedCustomers = data
        .map(mapCustomer)
        .filter((customer): customer is Customer => customer !== null)
      const cacheDate = response.headers.get('X-Customer-Refreshed-At')
      refreshedAt = cacheDate ? new Date(cacheDate) : null
      return cachedCustomers
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : 'Unable to load customers'
      return []
    } finally {
      loading = false
      customersRequest = null
    }
  })()

  return customersRequest
}

export async function refreshCustomers(): Promise<{ customers: Customer[]; refreshedAt: Date }> {
  loading = true
  error = null

  try {
    const response = await fetch('/api/customers', {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error(await getResponseError(response, `Unable to refresh customers (${response.status})`))
    }

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('Invalid customer refresh response')
    const value = payload as { customers?: unknown; refreshedAt?: unknown }
    if (!Array.isArray(value.customers) || typeof value.refreshedAt !== 'string') {
      throw new Error('Invalid customer refresh response')
    }

    cachedCustomers = value.customers
      .map(mapCustomer)
      .filter((customer): customer is Customer => customer !== null)
    refreshedAt = new Date(value.refreshedAt)
    return { customers: cachedCustomers, refreshedAt }
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : 'Unable to refresh customers'
    throw caughtError
  } finally {
    loading = false
  }
}
