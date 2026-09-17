import { healthPath, maintenanceResponse, tokenHash } from './lib/deploymentMaintenance.ts'

interface Gate { active: number; token_hash: string }

export const onRequest: PagesFunction<{ DB: D1Database }> = async context => {
  const { request, env } = context
  const path = new URL(request.url).pathname
  let probe = false
  try {
    // Always read the primary. No edge cache or replica may admit a stale write.
    const gate = await env.DB.withSession('first-primary').prepare(
      'SELECT active, token_hash FROM deployment_maintenance WHERE id = 1',
    ).first<Gate>()
    if (!gate) return maintenanceResponse(request)
    const token = request.headers.get('X-PC-Tech-Health-Token')
    probe = Boolean(token && gate.token_hash && request.method === 'GET' && healthPath(path)
      && await tokenHash(token) === gate.token_hash)
    if (gate.active !== 0 && !probe) return maintenanceResponse(request)
  } catch {
    // Unknown state must never expose the application during deployment.
    return maintenanceResponse(request)
  }
  if (path === '/api/deployment-status') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  if (path === '/api/deployment-health') {
    if (!probe) return new Response('Not found', { status: 404 })
    try {
      // Exercise the auth schema without creating users, sessions or other test data.
      await env.DB.withSession('first-primary').prepare(`SELECT s.id, s.token_hash, s.expires_at, s.revoked_at,
        s.session_version, u.status, u.session_version, u.must_change_password, r.is_active
        FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id LIMIT 1`).all()
      return Response.json({ ok: true, database: true, authSchema: true }, { headers: { 'Cache-Control': 'no-store' } })
    } catch { return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
  }
  const response = await context.next()
  const safe = new Response(response.body, response)
  // Browsers must recheck the gate; preserve all session/auth headers.
  safe.headers.set('Cache-Control', 'no-store')
  return safe
}
