// The server is the gate. This only moves already-open tabs to its standalone page.
export function watchDeploymentMaintenance() {
  let reloading = false
  const originalFetch = window.fetch.bind(window)
  const inspect = (response: Response) => {
    if (!reloading && response.status === 503 && response.headers.get('X-PC-Tech-Maintenance') === '1') {
      reloading = true
      window.location.reload()
    }
    return response
  }
  window.fetch = async (...args: Parameters<typeof fetch>) => inspect(await originalFetch(...args))
  const check = () => {
    if (document.visibilityState === 'visible' && !reloading) {
      void originalFetch('/api/deployment-status', { cache: 'no-store', credentials: 'same-origin' }).then(inspect).catch(() => {})
    }
  }
  window.setInterval(check, 30000)
  document.addEventListener('visibilitychange', check)
}
