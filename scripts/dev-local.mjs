import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const node = process.execPath
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js')
const vite = resolve(root, 'node_modules/vite/bin/vite.js')
const children = new Set()
let stopping = false

function start(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env })
  children.add(child)
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(`[local-dev] ${label} stopped unexpectedly (${signal || `exit ${code ?? 1}`}).`)
      stop(code || 1)
    }
  })
  return child
}

function run(label, command, args, input = '') {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'], env: process.env })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${label} failed with exit ${code ?? 1}.`)))
    if (input) child.stdin.end(input)
  })
}

async function responds(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.status > 0
  } catch {
    return false
  }
}

async function waitFor(url, label, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child?.exitCode != null) throw new Error(`${label} stopped before becoming ready.`)
    if (await responds(url)) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000} seconds.`)
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 250).unref()
}

process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))

try {
  console.log('[local-dev] Applying pending local D1 migrations...')
  await run('Local D1 migration', node, [wrangler, 'd1', 'migrations', 'apply', 'pc-tech-db', '--local'], 'y\n')

  const backendUrl = 'http://127.0.0.1:8788/api/auth/me'
  if (await responds(backendUrl)) {
    console.log('[local-dev] Backend already ready on http://127.0.0.1:8788')
  } else {
    console.log('[local-dev] Starting authentication/API backend on http://127.0.0.1:8788')
    const backend = start('Backend', node, [wrangler, 'pages', 'dev', 'public', '--port', '8788', '--persist-to', '.wrangler/state', '--log-level', 'info'])
    await waitFor(backendUrl, 'Backend', backend)
    console.log('[local-dev] Authentication backend is ready.')
  }

  const frontendUrl = 'http://127.0.0.1:5173/'
  if (await responds(frontendUrl)) {
    console.log('[local-dev] Frontend already ready on http://127.0.0.1:5173')
  } else {
    console.log('[local-dev] Starting frontend on http://127.0.0.1:5173')
    const frontend = start('Frontend', node, ['--use-system-ca', vite])
    await waitFor(frontendUrl, 'Frontend', frontend)
    console.log('[local-dev] Frontend is ready. Sign-in is available.')
  }
} catch (error) {
  console.error(`[local-dev] ${error instanceof Error ? error.message : String(error)}`)
  stop(1)
}

await new Promise(() => {})
