export interface ZohoTokenResponse {
  access_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  message?: string
}

export interface ZohoApiErrorPayload {
  code?: string | number
  message?: string
  error?: string | { message?: string }
  error_description?: string
  [key: string]: unknown
}

const ZOHO_REGION_URLS: Record<string, { tokenUrl: string; booksUrl: string }> = {
  in: {
    tokenUrl: 'https://accounts.zoho.in/oauth/v2/token',
    booksUrl: 'https://www.zohoapis.in/books/v3',
  },
}

export type ZohoEnv = Record<string, string | undefined>

interface ZohoErrorDetails {
  status: number
  code: string
  message: string
}

export class ZohoRequestError extends Error {
  status: number
  code: string

  constructor(message: string, details: ZohoErrorDetails) {
    super(message)
    this.name = 'ZohoRequestError'
    this.status = details.status
    this.code = details.code
  }
}

const getEnv = (name: string, env?: ZohoEnv): string | undefined => {
  const configuredValue = env?.[name]?.trim()
  if (configuredValue) {
    return configuredValue
  }

  const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
    env?: Record<string, string | undefined>
  }).process?.env

  const runtimeValue = runtimeEnv?.[name]?.trim()
  if (runtimeValue) {
    return runtimeValue
  }

  const globalEnv = (globalThis as typeof globalThis & {
    env?: Record<string, string | undefined>
  }).env

  return globalEnv?.[name]?.trim()
}

const getZohoRegion = (env?: ZohoEnv): string => getEnv('ZOHO_REGION', env)?.toLowerCase() || 'in'

const getZohoUrls = (env?: ZohoEnv): { tokenUrl: string; booksUrl: string } => {
  const region = getZohoRegion(env)

  return ZOHO_REGION_URLS[region] ?? ZOHO_REGION_URLS.in
}

const logZohoDiagnostic = (message: string, details: Record<string, unknown>): void => {
  console.info('[zoho]', message, details)
}

const isZohoOrgIdNumeric = (env?: ZohoEnv): boolean => /^\d+$/.test(getEnv('ZOHO_ORG_ID', env) ?? '')

const getRawEnv = (name: string, env?: ZohoEnv): string | undefined => {
  if (env?.[name]) {
    return env[name]
  }

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

const logTokenRequestDiagnostic = (tokenUrl: string, body: URLSearchParams, env?: ZohoEnv): void => {
  const rawRefreshToken = getRawEnv('ZOHO_REFRESH_TOKEN', env) ?? ''
  const trimmedRefreshToken = rawRefreshToken.trim()

  logZohoDiagnostic('access-token request prepared', {
    tokenEndpoint: tokenUrl,
    grantType: body.get('grant_type'),
    refreshTokenExists: trimmedRefreshToken.length > 0,
    refreshTokenLength: trimmedRefreshToken.length,
    refreshTokenStartsWith1000: trimmedRefreshToken.startsWith('1000.'),
    refreshTokenTrimChangedLength: rawRefreshToken.length !== trimmedRefreshToken.length,
    requestBodyKeys: Array.from(body.keys()),
  })
}

let cachedAccessToken: string | null = null
let tokenExpiryTime = 0

/**
 * Retrieve a fresh Zoho access token using the configured refresh-token grant.
 * The result is cached briefly so repeated calls reuse a still-valid token.
 */
export async function getAccessToken(env?: ZohoEnv): Promise<string> {
  const clientId = getEnv('ZOHO_CLIENT_ID', env)
  const clientSecret = getEnv('ZOHO_CLIENT_SECRET', env)
  const refreshToken = getEnv('ZOHO_REFRESH_TOKEN', env)

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Zoho OAuth environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN')
  }

  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    logZohoDiagnostic('access-token request skipped; cached token is valid', {
      tokenEndpointHostname: new URL(getZohoUrls(env).tokenUrl).hostname,
      accessTokenRequestSucceeded: true,
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env),
    })
    return cachedAccessToken
  }

  const tokenUrl = getZohoUrls(env).tokenUrl
  const body = new URLSearchParams()
  body.append('client_id', clientId)
  body.append('client_secret', clientSecret)
  body.append('refresh_token', refreshToken)
  body.append('grant_type', 'refresh_token')

  logTokenRequestDiagnostic(tokenUrl, body, env)

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const responseText = await response.text()
  let payload: ZohoTokenResponse

  try {
    payload = responseText ? JSON.parse(responseText) : {}
  } catch {
    logZohoDiagnostic('access-token request failed', {
      tokenEndpointHostname: new URL(tokenUrl).hostname,
      accessTokenRequestSucceeded: false,
      zohoHttpStatus: response.status,
      zohoErrorCode: 'invalid_json',
      zohoErrorMessage: 'Zoho OAuth token response was not valid JSON',
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env),
    })
    throw new ZohoRequestError(`Zoho OAuth token request failed (${response.status}): response was not valid JSON`, {
      status: response.status,
      code: 'invalid_json',
      message: 'Zoho OAuth token response was not valid JSON',
    })
  }

  if (!response.ok || !payload.access_token) {
    const details = getZohoOAuthErrorDetails(response.status, payload)
    logZohoDiagnostic('access-token request failed', {
      tokenEndpointHostname: new URL(tokenUrl).hostname,
      accessTokenRequestSucceeded: false,
      zohoHttpStatus: response.status,
      zohoErrorCode: details.code,
      zohoErrorMessage: details.message,
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env),
    })
    throw new ZohoRequestError(formatZohoOAuthError(details), details)
  }

  logZohoDiagnostic('access-token request succeeded', {
    tokenEndpointHostname: new URL(tokenUrl).hostname,
    accessTokenRequestSucceeded: true,
    zohoHttpStatus: response.status,
    requiredScope: 'ZohoBooks.contacts.READ',
    requiredScopePresent: typeof payload.scope === 'string' ? payload.scope.split(/[,\s]+/).includes('ZohoBooks.contacts.READ') : null,
    zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env),
  })

  cachedAccessToken = payload.access_token
  tokenExpiryTime = Date.now() + ((payload.expires_in ?? 3600) * 1000 - 60000)

  return cachedAccessToken
}

async function zohoRequest(endpoint: string, env?: ZohoEnv): Promise<unknown> {
  const normalizedEndpoint = endpoint.startsWith('http') ? endpoint : `${getZohoUrls(env).booksUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const url = new URL(normalizedEndpoint)

  if (!url.searchParams.has('organization_id')) {
    const organizationId = getEnv('ZOHO_ORG_ID', env)
    if (organizationId) {
      url.searchParams.set('organization_id', organizationId)
    }
  }

  const organizationId = url.searchParams.get('organization_id') ?? ''
  logZohoDiagnostic('books request planned', {
    booksApiUrl: url.toString(),
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId),
  })

  const accessToken = await getAccessToken(env)

  logZohoDiagnostic('books request started', {
    booksApiUrl: url.toString(),
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId),
  })

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
    const details = getZohoApiErrorDetails(response.status, payload)
    logZohoDiagnostic('books request failed', {
      booksApiUrl: url.toString(),
      zohoHttpStatus: response.status,
      zohoErrorCode: details.code,
      zohoErrorMessage: details.message,
      zohoOrgIdNumericOnly: /^\d+$/.test(organizationId),
    })
    throw new ZohoRequestError(`Zoho API request failed (${details.status}) for GET ${url.toString()}: ${details.code}: ${details.message}`, details)
  }

  logZohoDiagnostic('books request succeeded', {
    booksApiUrl: url.toString(),
    zohoHttpStatus: response.status,
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId),
  })

  return payload
}

/**
 * Execute a read-only Zoho Books GET request against the provided endpoint.
 */
export async function zohoGet(endpoint: string, env?: ZohoEnv): Promise<unknown> {
  return zohoRequest(endpoint, env)
}

function formatZohoOAuthError(details: ZohoErrorDetails): string {
  return `Zoho OAuth token request failed (${details.status}): ${details.code}: ${details.message}`
}

function getZohoOAuthErrorDetails(status: number, payload: ZohoTokenResponse): ZohoErrorDetails {
  const errorCode = payload.error || 'unknown_error'
  const errorMessage = payload.error_description || payload.message || 'Unable to obtain a Zoho access token'

  return {
    status,
    code: errorCode,
    message: errorMessage,
  }
}

function getZohoApiErrorDetails(status: number, payload: unknown): ZohoErrorDetails {
  return {
    status,
    code: extractErrorCode(payload),
    message: extractErrorMessage(payload),
  }
}

function extractErrorCode(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const errorPayload = payload as ZohoApiErrorPayload

    if (typeof errorPayload.code === 'string' || typeof errorPayload.code === 'number') {
      return String(errorPayload.code)
    }

    if (typeof errorPayload.error === 'string') {
      return errorPayload.error
    }
  }

  return 'unknown_error'
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

    if (typeof errorPayload.error_description === 'string') {
      return errorPayload.error_description
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
