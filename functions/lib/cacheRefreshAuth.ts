export async function isCacheRefreshAuthorized(request: Request, secret?: string): Promise<boolean> {
  if (!secret || secret.length < 32) return false
  const supplied = request.headers.get('Authorization')
  if (!supplied?.startsWith('Bearer ')) return false
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value),
  ))
  const [expected, actual] = await Promise.all([digest(secret), digest(supplied.slice(7))])
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index]
  return difference === 0
}
