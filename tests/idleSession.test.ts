import assert from 'node:assert/strict'
import test from 'node:test'
import { monitorIdleSession, IDLE_TIMEOUT_MS } from '../src/idleSession.ts'

test('idle logout resets on activity, survives reloads, and checks suspended tabs', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalNow = Date.now
  let now = 1000
  let deadline = 0
  let callback = () => {}
  let logouts = 0
  const storage = new Map<string, string>()
  const makeTarget = () => {
    const listeners = new Map<string, Set<() => void>>()
    return {
      addEventListener: (name: string, fn: () => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set())
        listeners.get(name)!.add(fn)
      },
      removeEventListener: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
      dispatchEvent: (event: Event) => listeners.get(event.type)?.forEach((fn) => fn()),
    }
  }
  const browser = makeTarget()
  const page = makeTarget()
  Object.assign(page, { visibilityState: 'visible' })
  Object.assign(browser, {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout: (fn: () => void, delay: number) => {
      callback = fn
      deadline = now + delay
      return 1
    },
    clearTimeout: () => {},
  })
  globalThis.window = browser as unknown as Window & typeof globalThis
  globalThis.document = page as unknown as Document
  Date.now = () => now
  let stop = () => {}
  try {
    stop = monitorIdleSession(() => logouts++)
    assert.equal(deadline, now + IDLE_TIMEOUT_MS)
    now += IDLE_TIMEOUT_MS - 1
    browser.dispatchEvent(new Event('keydown'))
    assert.equal(logouts, 0)
    assert.equal(deadline, now + IDLE_TIMEOUT_MS)
    stop()
    now += 1000
    stop = monitorIdleSession(() => logouts++)
    assert.equal(deadline, now + IDLE_TIMEOUT_MS - 1000)
    now = deadline
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(logouts, 1)
    browser.dispatchEvent(new Event('pointerdown'))
    callback()
    assert.equal(logouts, 1)
  } finally {
    stop()
    Date.now = originalNow
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
