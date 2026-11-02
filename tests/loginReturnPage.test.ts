import assert from 'node:assert/strict'
import test from 'node:test'
import { clearLoginReturnPage, consumeLoginReturnPage, rememberLoginReturnPage } from '../src/loginReturnPage.ts'

test('timeout return page survives login reload and is scoped to the user and current access', () => {
  const originalWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    location: { hash: '#job-cards' },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    },
  } as unknown as Window & typeof globalThis
  try {
    rememberLoginReturnPage(1)
    window.location.hash = ''
    assert.equal(consumeLoginReturnPage(1, ['job-cards']), '#job-cards')
    assert.equal(consumeLoginReturnPage(1, ['job-cards']), undefined)
    window.location.hash = '#job-cards'
    rememberLoginReturnPage(1)
    assert.equal(consumeLoginReturnPage(2, ['job-cards']), undefined)
    rememberLoginReturnPage(1)
    assert.equal(consumeLoginReturnPage(1, []), undefined)
    rememberLoginReturnPage(1)
    clearLoginReturnPage()
    assert.equal(consumeLoginReturnPage(1, ['job-cards']), undefined)
    storage.set('pc-tech-login-return-page', '{invalid')
    assert.equal(consumeLoginReturnPage(1, ['job-cards']), undefined)
  } finally {
    clearLoginReturnPage()
    globalThis.window = originalWindow
  }
})
