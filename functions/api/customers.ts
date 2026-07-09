import { zohoGet } from '../../lib/zoho'

interface CustomersQueryParams {
  page?: string
  per_page?: string
  search_text?: string
}

/**
 * Build the Zoho Contacts endpoint with any supported query parameters.
 */
function buildContactsEndpoint(query: CustomersQueryParams): string {
  const params = new URLSearchParams()

  if (query.page) {
    params.set('page', query.page)
  }

  if (query.per_page) {
    params.set('per_page', query.per_page)
  }

  if (query.search_text) {
    params.set('search_text', query.search_text)
  }

  const queryString = params.toString()
  return queryString ? `/contacts?${queryString}` : '/contacts'
}

/**
 * Cloudflare Function that returns Zoho Books contacts in read-only mode.
 */
export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  try {
    const url = new URL(request.url)
    const query: CustomersQueryParams = {}

    url.searchParams.forEach((value, key) => {
      if (key === 'page' || key === 'per_page' || key === 'search_text') {
        query[key as keyof CustomersQueryParams] = value
      }
    })

    const payload = await zohoGet(buildContactsEndpoint(query))

    return Response.json(payload, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    return Response.json(
      {
        error: 'Failed to load customers',
        message,
      },
      { status: 502 },
    )
  }
}
