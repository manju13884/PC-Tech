export const SESSION_DURATION_SECONDS = 8 * 60 * 60

const SESSION_TOKEN_BYTES = 32
export const SESSION_COOKIE_NAME = 'pc_tech_session'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function generateSessionToken(): string {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES))
  return bytesToBase64Url(tokenBytes)
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return bytesToBase64Url(new Uint8Array(digest))
}

export function getSessionExpiry(): string {
  return new Date(Date.now() + SESSION_DURATION_SECONDS * 1000).toISOString()
}

export function buildSessionCookie(token: string, secure = true): string {
  const secureAttribute = secure ? '; Secure' : ''

  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_SECONDS}`
}

export function buildExpiredSessionCookie(secure = true): string {
  const secureAttribute = secure ? '; Secure' : ''

  return `${SESSION_COOKIE_NAME}=; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}

  try {
    const cookies: Record<string, string> = {}

    for (const cookiePart of cookieHeader.split(';')) {
      const separatorIndex = cookiePart.indexOf('=')
      if (separatorIndex < 0) continue

      const name = decodeURIComponent(cookiePart.slice(0, separatorIndex).trim())
      const value = decodeURIComponent(cookiePart.slice(separatorIndex + 1).trim())
      if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) return {}

      cookies[name] = value
    }

    return cookies
  } catch {
    return {}
  }
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const token = parseCookieHeader(request.headers.get('Cookie'))[SESSION_COOKIE_NAME]
  return token || null
}
