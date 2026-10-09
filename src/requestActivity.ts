type Activity = { pending: number; processing: number }
type ActivityState = {
  activity: Activity
  listeners: Set<() => void>
  requests: Map<object, number>
  installedWindows: WeakSet<object>
}
// Keep one tracker across local hot reloads; old requests must finish in the same store.
const globalState = globalThis as typeof globalThis & { __pcRequestActivity?: ActivityState }
const state = globalState.__pcRequestActivity ??= {
  activity: { pending: 0, processing: 0 },
  listeners: new Set(),
  requests: new Map(),
  installedWindows: new WeakSet(),
}

export const getRequestActivity = () => state.activity
export const subscribeRequestActivity = (listener: () => void) => {
  state.listeners.add(listener)
  return () => { state.listeners.delete(listener) }
}

function update() {
  state.activity = { pending: state.requests.size, processing: [...state.requests.values()].reduce((sum, value) => sum + value, 0) }
  state.listeners.forEach(listener => listener())
}

export function watchRequestActivity() {
  if (state.installedWindows.has(window)) return
  state.installedWindows.add(window)
  window.addEventListener('hashchange', () => {
    state.requests.clear()
    update()
  })
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/') || url.pathname === '/api/deployment-status' || headers.get('X-PC-Tech-Background') === '1') {
      return originalFetch(input, init)
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const processing = method === 'GET' || method === 'HEAD' ? 0 : 1
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (signal?.aborted) return originalFetch(input, init)
    const token = {}
    const finish = () => {
      if (state.requests.delete(token)) update()
    }
    state.requests.set(token, processing)
    update()
    signal?.addEventListener('abort', finish, { once: true })
    try {
      return await originalFetch(input, init)
    } finally {
      signal?.removeEventListener('abort', finish)
      finish()
    }
  }
}
