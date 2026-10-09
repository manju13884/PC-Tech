import test from 'node:test'
import assert from 'node:assert/strict'
import { getRequestActivity, subscribeRequestActivity, watchRequestActivity } from '../src/requestActivity.ts'

test('tracks concurrent reads and processing, clears failures, and ignores background requests', async () => {
  const requests = []
  const previousWindow = globalThis.window
  const events = new Map()
  globalThis.window = {
    location: { href: 'http://localhost:5174/', origin: 'http://localhost:5174' },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    addEventListener: (name, handler) => events.set(name, handler),
  }
  let notifications = 0
  const unsubscribe = subscribeRequestActivity(() => notifications++)
  try {
    watchRequestActivity()
    const read = window.fetch('/api/production-plans')
    const save = window.fetch('/api/unloading', { method: 'POST' })
    assert.deepEqual(getRequestActivity(), { pending: 2, processing: 1 })
    requests[0].resolve(new Response('{}'))
    await read
    assert.deepEqual(getRequestActivity(), { pending: 1, processing: 1 })
    const failed = assert.rejects(save, /offline/)
    requests[1].reject(new Error('offline'))
    await failed
    assert.deepEqual(getRequestActivity(), { pending: 0, processing: 0 })
    assert.equal(notifications, 4)
    watchRequestActivity()
    const controller = new AbortController()
    const cancelled = window.fetch('/api/data', { signal: controller.signal })
    assert.equal(getRequestActivity().pending, 1, 'reinstall does not double count')
    controller.abort()
    assert.equal(getRequestActivity().pending, 0, 'cancel immediately clears activity')
    requests[2].resolve(new Response('{}'))
    await cancelled
    const oldScreen = window.fetch('/api/old-screen')
    events.get('hashchange')()
    assert.equal(getRequestActivity().pending, 0, 'navigation clears old screen activity')
    const newScreen = window.fetch('/api/new-screen')
    requests[3].resolve(new Response('{}'))
    await oldScreen
    assert.equal(getRequestActivity().pending, 1, 'old completion cannot clear new screen activity')
    requests[4].resolve(new Response('{}'))
    await newScreen
    assert.equal(getRequestActivity().pending, 0)
    const background = window.fetch('/api/calculator-defaults', { headers: { 'X-PC-Tech-Background': '1' } })
    assert.equal(getRequestActivity().pending, 0)
    requests[5].resolve(new Response('{}'))
    await background
    const beforeBackground = notifications
    const ignored = [window.fetch('/api/deployment-status'), window.fetch('https://example.com/api/data')]
    assert.deepEqual(getRequestActivity(), { pending: 0, processing: 0 })
    requests.slice(6).forEach(request => request.resolve(new Response('{}')))
    await Promise.all(ignored)
    assert.equal(notifications, beforeBackground)
  } finally {
    unsubscribe()
    globalThis.window = previousWindow
  }
})
