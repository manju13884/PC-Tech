export interface ZohoTokenResponse {
  access_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

export interface ZohoApiErrorPayload {
  message?: string
  error?: string | { message?: string }
  [key: string]: unknown
}

const ZOHO_TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token'

const getEnv = (name: string): string | undefined => {
  const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
    env?: Record<string, string | undefined>
  }).process?.env

  if (runtimeEnv?.[name]) {
    return runtimeEnv[name]
  }

  const globalEnv = (globalThis as typeof globalThis & {
    env?: Record<string, string | undefined>
  }).env

  return globalEnv?.[name]
}

const getZohoBaseUrl = (): string => 'https://www.zohoapis.in/books/v3'

let cachedAccessToken: string | null = null
let tokenExpiryTime = 0

/**
 * Retrieve a fresh Zoho access token using the configured refresh-token grant.
 * The result is cached briefly so repeated calls reuse a still-valid token.
 */
export async function getAccessToken(): Promise<string> {
  const clientId = getEnv('ZOHO_CLIENT_ID')
  const clientSecret = getEnv('ZOHO_CLIENT_SECRET')
  const refreshToken = getEnv('ZOHO_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Zoho OAuth environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN')
  }

  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    return cachedAccessToken
  }

  const response = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  })

  const responseText = await response.text()
  let payload: ZohoTokenResponse

  try {
    payload = responseText ? JSON.parse(responseText) : {}
  } catch {
    throw new Error(`Zoho OAuth token response was not valid JSON: ${responseText}`)
  }

  if (!response.ok || !payload.access_token) {
    const errorMessage = payload.error_description || payload.error || 'Unable to obtain a Zoho access token'
    throw new Error(`Zoho OAuth token request failed: ${errorMessage}`)
  }

  cachedAccessToken = payload.access_token
  tokenExpiryTime = Date.now() + ((payload.expires_in ?? 3600) * 1000 - 60000)

  return cachedAccessToken
}

async function zohoRequest(endpoint: string): Promise<unknown> {
  const accessToken = await getAccessToken()
  const normalizedEndpoint = endpoint.startsWith('http') ? endpoint : `${getZohoBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const url = new URL(normalizedEndpoint)

  if (!url.searchParams.has('organization_id')) {
    const organizationId = getEnv('ZOHO_ORGANIZATION_ID')
    if (organizationId) {
      url.searchParams.set('organization_id', organizationId)
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  })

  const responseText = await response.text()
  let payload: unknown

  try {
    payload = responseText ? JSON.parse(responseText) : null
  } catch {
    payload = responseText
  }

  if (!response.ok) {
    const errorMessage = extractErrorMessage(payload)
    throw new Error(`Zoho API request failed (${response.status}) for GET ${endpoint}: ${errorMessage}`)
  }

  return payload
}

/**
 * Execute a read-only Zoho Books GET request against the provided endpoint.
 */
export async function zohoGet(endpoint: string): Promise<unknown> {
  return zohoRequest(endpoint)
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const errorPayload = payload as ZohoApiErrorPayload

    if (typeof errorPayload.message === 'string') {
      return errorPayload.message
    }

    if (typeof errorPayload.error === 'string') {
      return errorPayload.error
    }

    if (errorPayload.error && typeof errorPayload.error === 'object' && typeof errorPayload.error.message === 'string') {
      return errorPayload.error.message
    }
  }

  return 'Unknown Zoho API error'
}
