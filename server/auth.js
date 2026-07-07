import { createServer } from 'http'

const PORT = process.env.PORT || 4000
const validCredentials = {
  username: 'superadmin',
  password: 'superadmin',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  })
  res.end(JSON.stringify(payload))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'OPTIONS' && url.pathname === '/api/login') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    let body = ''

    req.on('data', (chunk) => {
      body += chunk
    })

    req.on('end', () => {
      try {
        const data = JSON.parse(body)

        if (
          data.username === validCredentials.username &&
          data.password === validCredentials.password
        ) {
          return sendJson(res, 200, {
            authenticated: true,
            username: validCredentials.username,
          })
        }

        return sendJson(res, 401, {
          error: 'Invalid username or password',
        })
      } catch (error) {
        return sendJson(res, 400, {
          error: 'Invalid request body',
        })
      }
    })

    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Auth server running at http://127.0.0.1:${PORT}`)
})
