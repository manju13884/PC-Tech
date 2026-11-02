const STORAGE_KEY = 'pc-tech-login-return-page'
let pendingPage: { userId: number; hash: string } | null = null

export function rememberLoginReturnPage(userId: number): void {
  pendingPage = { userId, hash: window.location.hash }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pendingPage))
  } catch {
    // Keep the return page in memory when storage is unavailable.
  }
}

export function clearLoginReturnPage(): void {
  pendingPage = null
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is optional.
  }
}

export function consumeLoginReturnPage(userId: number, menuAccess: string[]): string | undefined {
  let page = pendingPage
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored) page = JSON.parse(stored)
  } catch {
    // Use the in-memory page if storage is unavailable or invalid.
  }
  clearLoginReturnPage()
  if (!page || page.userId !== userId || typeof page.hash !== 'string') return
  const key = page.hash.replace(/^#/, '')
  if (key === 'home' || menuAccess.includes(key)) return `#${key}`
}
