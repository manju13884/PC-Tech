export const maintenanceHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PC-Tech | System Update</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f6fa;color:#20334c;font:16px/1.6 system-ui,sans-serif;padding:24px}
main{width:100%;max-width:560px;text-align:center;background:white;border:1px solid #dce5ef;border-top:4px solid #194e80;border-radius:12px;padding:48px 28px;box-shadow:0 12px 40px #20334c0d}
.brand{font-weight:750;letter-spacing:.16em;color:#194e80}.product{margin:4px 0 32px;color:#66778c}h1{font-size:clamp(24px,5vw,30px);line-height:1.3;margin:0 0 20px}p{margin:12px 0}.safe{color:#66778c;font-size:14px}
button{margin-top:20px;padding:11px 32px;border:0;border-radius:6px;background:#194e80;color:white;font:600 16px system-ui;cursor:pointer}button:focus-visible{outline:3px solid #70a9dc;outline-offset:4px}footer{margin-top:32px;font-size:12px;color:#66778c}
</style></head><body><main><div class="brand">POLAR CANVAS</div><div class="product">PC-Tech</div>
<h1>System Update in Progress</h1><p>PC-Tech is currently being updated.<br>Please wait a few minutes and try again.</p>
<p class="safe">Your data is safe. No action is required.</p><button type="button" onclick="location.reload()">Retry</button>
<footer>© Polar Canvas Technologies Pvt Ltd</footer></main></body></html>`

export function maintenanceResponse(request: Request): Response {
  const api = new URL(request.url).pathname.startsWith('/api/')
  return new Response(request.method === 'HEAD' ? null : api
    ? JSON.stringify({ success: false, maintenance: true, error: 'System update in progress. Please try again shortly.' }) : maintenanceHtml, {
    status: 503,
    headers: { 'Content-Type': api ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0', 'Retry-After': '60', 'X-PC-Tech-Maintenance': '1',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
  })
}

export async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function healthPath(path: string) {
  return path === '/' || path === '/deployment.json' || path === '/api/auth/me' || path === '/api/deployment-health'
    || /^\/assets\/[^/]+\.(js|css)$/.test(path)
}
