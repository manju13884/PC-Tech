import { existsSync, readFileSync } from 'node:fs'
import { pbkdf2Sync } from 'node:crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getZohoCustomers } from './lib/customers'
import { getZohoInvoiceById, getZohoInvoicesByCustomer } from './lib/invoices'

const authConfig = JSON.parse(
  readFileSync(new URL('./server/auth-config.json', import.meta.url), 'utf8'),
)

const verifyPassword = (password: string, user: { salt: string; iterations: number; keyLength: number; passwordHash: string }) => {
  const derivedHash = pbkdf2Sync(
    password,
    Buffer.from(user.salt, 'hex'),
    user.iterations,
    user.keyLength,
    'sha256',
  ).toString('hex')

  return derivedHash === user.passwordHash
}

const allowedOrigin = process.env.CORS_ORIGIN || 'https://www.polarcanvas.in'

const sendJson = (res: any, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
  })
  res.end(JSON.stringify(payload))
}

const loadDevVars = () => {
  const devVarsPath = new URL('./.dev.vars', import.meta.url)

  if (!existsSync(devVarsPath)) {
    return
  }

  const lines = readFileSync(devVarsPath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const value = trimmedLine.slice(separatorIndex + 1).trim()

    if (key) {
      process.env[key] = value
    }
  }
}

loadDevVars()

const apiMiddleware = () => ({
  name: 'api-middleware',
  configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: any) => void) => void } }) {
    server.middlewares.use('/api/customers', async (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      if (req.method !== 'GET') {
        next()
        return
      }

      try {
        sendJson(res, 200, await getZohoCustomers())
      } catch (error) {
        console.error('Unable to load customers from Zoho Books', error)
        sendJson(res, 502, {
          error: error instanceof Error ? error.message : 'Unable to load customers',
        })
      }
    })

    server.middlewares.use('/api/invoices', async (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      if (req.method !== 'GET') {
        next()
        return
      }

      try {
        const url = new URL(req.url ?? '', 'http://localhost')
        const invoiceId = url.searchParams.get('invoice_id') ?? ''
        const customerId = url.searchParams.get('customer_id') ?? ''

        if (invoiceId) {
          const invoice = await getZohoInvoiceById(invoiceId)
          sendJson(res, invoice ? 200 : 404, invoice ?? { error: 'Invoice not found' })
          return
        }

        sendJson(res, 200, await getZohoInvoicesByCustomer(customerId))
      } catch (error) {
        console.error('Unable to load invoices from Zoho Books', error)
        sendJson(res, 502, {
          error: error instanceof Error ? error.message : 'Unable to load invoices',
        })
      }
    })

    server.middlewares.use('/api/login', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        res.end()
        return
      }

      if (req.method !== 'POST') {
        next()
        return
      }

      let body = ''
      req.on('data', (chunk: string) => {
        body += chunk
      })

      req.on('end', () => {
        try {
          const data = JSON.parse(body)
          const user = authConfig.users.find((entry: { username: string }) => entry.username === data.username)

          if (user && verifyPassword(data.password, user)) {
            sendJson(res, 200, { authenticated: true, username: user.username })
            return
          }

          sendJson(res, 401, { error: 'Invalid username or password' })
        } catch {
          sendJson(res, 400, { error: 'Invalid request body' })
        }
      })
    })
  },
})

export default defineConfig({
  base: '/',
  plugins: [react(), apiMiddleware()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
})
