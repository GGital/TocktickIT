import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// A-04: N = 2^15, r = 8, p = 1, 16-byte salt, 64-byte key. N·r·128 bytes = 32 MiB, which is
// exactly Node's default maxmem, so the ceiling is raised or every hash would throw.
const N = 32768
const r = 8
const p = 1
const KEY_LENGTH = 64

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 128 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  )

/** `scrypt$N$r$p$<base64 salt>$<base64 hash>` — the parameters travel with the hash (BR-09). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`
}

/** Compares derived keys with timingSafeEqual, never `===` (BR-10). A malformed hash never verifies. */
export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, rr, pp, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false

  const expected = Buffer.from(hash, 'base64')
  try {
    const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(rr), p: Number(pp) })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    // Tampered parameters (e.g. N not a power of two) are a failed verification, not a crash.
    return false
  }
}
