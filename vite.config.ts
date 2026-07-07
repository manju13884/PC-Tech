import { readFileSync } from 'node:fs'
import { pbkdf2Sync } from 'node:crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

const authMiddleware = () => ({
  name: 'auth-middleware',
  configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: any) => void) => void } }) {
    server.middlewares.use('/api/login', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
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
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
            })
            res.end(JSON.stringify({ authenticated: true, username: user.username }))
            return
          }

          res.writeHead(401, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          })
          res.end(JSON.stringify({ error: 'Invalid username or password' }))
        } catch {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          })
          res.end(JSON.stringify({ error: 'Invalid request body' }))
        }
      })
    })
  },
})

export default defineConfig({
  plugins: [react(), authMiddleware()],
  server: {
    port: 5173,
  },
})
