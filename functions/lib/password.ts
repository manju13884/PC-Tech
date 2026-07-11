const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

export interface PasswordHash {
  hash: string
  salt: string
}

/** Hashes a password with a unique salt using Workers-compatible Web Crypto. */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    passwordKey,
    HASH_BYTES * 8,
  )

  return {
    hash: bytesToBase64(new Uint8Array(derivedBits)),
    salt: bytesToBase64(salt),
  }
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

  if (!value || value.length % 4 !== 0 || !base64Pattern.test(value)) {
    return null
  }

  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return bytesToBase64(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }

  return difference === 0
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const expectedHash = base64ToBytes(storedHash)
  const salt = base64ToBytes(storedSalt)

  if (!expectedHash || expectedHash.length !== HASH_BYTES || !salt || salt.length !== SALT_BYTES) {
    return false
  }

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    passwordKey,
    HASH_BYTES * 8,
  )

  return constantTimeEqual(new Uint8Array(derivedBits), expectedHash)
}
