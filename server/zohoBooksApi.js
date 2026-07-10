import { createServer } from 'node:http'
import { URLSearchParams } from 'node:url'

const PORT = Number(process.env.ZOHO_API_PORT || 4001)
const allowedOrigin = process.env.CORS_ORIGIN || 'https://www.polarcanvas.in'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  })
  res.end(JSON.stringify(payload))
}

const ZOHO_REGION_URLS = {
  in: {
    tokenUrl: 'https://accounts.zoho.in/oauth/v2/token',
    booksUrl: 'https://www.zohoapis.in/books/v3',
  },
}

const getEnv = (name) => process.env[name]?.trim()

const getZohoUrls = () => {
  const region = getEnv('ZOHO_REGION')?.toLowerCase() || 'in'

  return ZOHO_REGION_URLS[region] || ZOHO_REGION_URLS.in
}

const formatZohoOAuthError = (status, payload) => {
  const errorCode = payload?.error || 'unknown_error'
  const errorMessage = payload?.error_description || payload?.message || 'Unable to get Zoho access token'

  return `Zoho OAuth token request failed (${status}): ${errorCode}: ${errorMessage}`
}

const getAccessToken = async () => {
  const clientId = getEnv('ZOHO_CLIENT_ID')
  const clientSecret = getEnv('ZOHO_CLIENT_SECRET')
  const refreshToken = getEnv('ZOHO_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Zoho OAuth environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN')
  }

  const response = await fetch(getZohoUrls().tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const text = await response.text()
  let data

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Zoho OAuth token request failed (${response.status}): response was not valid JSON`)
  }

  if (!response.ok || !data.access_token) {
    throw new Error(formatZohoOAuthError(response.status, data))
  }

  return data.access_token
}

const proxyZohoRequest = async (resource, method, body, searchParams) => {
  const accessToken = await getAccessToken()
  const zohoUrl = new URL(`${getZohoUrls().booksUrl}/${resource}`)

  searchParams.forEach((value, key) => {
    zohoUrl.searchParams.set(key, value)
  })

  const organizationId = getEnv('ZOHO_ORG_ID')
  if (!zohoUrl.searchParams.has('organization_id') && organizationId) {
    zohoUrl.searchParams.set('organization_id', organizationId)
  }

  const response = await fetch(zohoUrl, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  })

  const text = await response.text()
  let payload

  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = text
  }

  return {
    status: response.status,
    payload,
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      port: PORT,
      organizationConfigured: Boolean(getEnv('ZOHO_ORG_ID')),
      zohoRegion: getEnv('ZOHO_REGION') || 'in',
    })
    return
  }

  const match = url.pathname.match(/^\/api\/zoho\/books\/(.+)$/)
  if (!match) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  const resource = match[1]

  try {
    let body = {}
    if (req.method !== 'GET') {
      let rawBody = ''
      req.on('data', (chunk) => {
        rawBody += chunk
      })
      req.on('end', async () => {
        try {
          body = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          body = {}
        }

        try {
          const result = await proxyZohoRequest(resource, req.method, body, url.searchParams)
          res.writeHead(result.status, {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          })
          res.end(JSON.stringify(result.payload))
        } catch (error) {
          sendJson(res, 502, {
            error: error.message || 'Zoho Books request failed',
          })
        }
      })
      return
    }

    const result = await proxyZohoRequest(resource, req.method, body, url.searchParams)
    res.writeHead(result.status, {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    })
    res.end(JSON.stringify(result.payload))
  } catch (error) {
    sendJson(res, 502, {
      error: error.message || 'Zoho Books request failed',
    })
  }
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Zoho Books API running at http://127.0.0.1:${PORT}`)
})
