import {
  buildExpiredSessionCookie,
  getSessionTokenFromRequest,
  hashSessionToken,
} from '../../lib/session'

interface Env {
  DB: D1Database
}

interface FunctionContext {
  request: Request
  env: Env
}

function json(payload: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(payload, { status, headers })
}

export async function onRequest(context: FunctionContext): Promise<Response> {
  if (context.request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, { Allow: 'POST' })
  }

  const isSecureRequest = new URL(context.request.url).protocol === 'https:'
  const headers = {
    'Set-Cookie': buildExpiredSessionCookie(isSecureRequest),
  }

  try {
    const sessionToken = getSessionTokenFromRequest(context.request)

    if (sessionToken) {
      const tokenHash = await hashSessionToken(sessionToken)

      await context.env.DB.prepare(
        'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL',
      ).bind(tokenHash).run()
    }

    return json({ success: true }, 200, headers)
  } catch {
    console.error('[logout] Unable to revoke session')
    return json({ success: false, error: 'Unable to logout' }, 500, headers)
  }
}
