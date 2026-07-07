import { createServer } from 'http'
import { readFileSync } from 'fs'
import { pbkdf2Sync } from 'crypto'

const PORT = process.env.PORT || 4000
const authConfig = JSON.parse(readFileSync(new URL('./auth-config.json', import.meta.url), 'utf8'))

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

const verifyPassword = (password, user) => {
  const derivedHash = pbkdf2Sync(
    password,
    Buffer.from(user.salt, 'hex'),
    user.iterations,
    user.keyLength,
    'sha256',
  ).toString('hex')

  return derivedHash === user.passwordHash
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
        const user = authConfig.users.find((entry) => entry.username === data.username)

        if (user && verifyPassword(data.password, user)) {
          return sendJson(res, 200, {
            authenticated: true,
            username: user.username,
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
