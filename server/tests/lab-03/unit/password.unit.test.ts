import * as crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { hashPassword, validateNewPassword, verifyPassword } from '../../../src/password.js'

// Wrap the real timingSafeEqual so a test can prove the comparison goes through it (BR-10).
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})

// Test fixtures, not real passwords.
const PASSWORD = 'fixture-password-1'
const EMAIL = 'ada.chaiyawat@toktickit.test'
const context = { currentPassword: 'fixture-current-1', email: EMAIL }

describe('UNIT-01 hash encoding (BR-09, AC-09)', () => {
  it('encodes scrypt$N$r$p$salt$hash with the documented parameters and no plaintext', async () => {
    const stored = await hashPassword(PASSWORD)

    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/)
    const [, , , , salt, hash] = stored.split('$')
    expect(Buffer.from(salt, 'base64')).toHaveLength(16)
    expect(Buffer.from(hash, 'base64')).toHaveLength(64)
    expect(stored).not.toContain(PASSWORD)
  })
})

describe('UNIT-02 verify the correct password (BR-10)', () => {
  it('returns true', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true)
  })
})

describe('UNIT-03 wrong password and tampered hash (BR-10)', () => {
  it('returns false for a wrong password, comparing with timingSafeEqual', async () => {
    const stored = await hashPassword(PASSWORD)
    vi.mocked(crypto.timingSafeEqual).mockClear()

    expect(await verifyPassword('fixture-password-2', stored)).toBe(false)
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1)
  })

  it('returns false when the stored parameters have been tampered with', async () => {
    const stored = await hashPassword(PASSWORD)

    expect(await verifyPassword(PASSWORD, stored.replace('scrypt$32768$', 'scrypt$16384$'))).toBe(false)
    // Not a power of two: scrypt itself refuses, which must still be a plain false.
    expect(await verifyPassword(PASSWORD, stored.replace('scrypt$32768$', 'scrypt$3$'))).toBe(false)
    expect(await verifyPassword(PASSWORD, stored.replace(/^scrypt/, 'bcrypt'))).toBe(false)
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false)
  })
})

describe('UNIT-04 per-user salt (BR-09)', () => {
  it('hashes the same password to two different strings', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)])

    expect(first).not.toBe(second)
    expect(await verifyPassword(PASSWORD, second)).toBe(true)
  })
})

describe('UNIT-05 password length boundaries (BR-11, AC-12)', () => {
  it('rejects 9 and 129 characters and accepts 10 and 128', () => {
    expect(validateNewPassword('a'.repeat(9), context)).toBe('Use at least 10 characters.')
    expect(validateNewPassword('a'.repeat(10), context)).toBeNull()
    expect(validateNewPassword('a'.repeat(128), context)).toBeNull()
    expect(validateNewPassword('a'.repeat(129), context)).toBe('Use no more than 128 characters.')
  })

  it('does not trim: surrounding spaces count toward the length', () => {
    expect(validateNewPassword(' ninechars', context)).toBeNull()
  })
})

describe('UNIT-06 whitespace-only, same as current, and email candidates (BR-11)', () => {
  it('rejects each with its own message', () => {
    const messages = [
      validateNewPassword(' '.repeat(12), context),
      validateNewPassword(context.currentPassword, context),
      validateNewPassword('ada.chaiyawat', { ...context, email: 'ada.chaiyawat@toktickit.test' }),
      validateNewPassword(EMAIL, context),
    ]

    expect(messages).toEqual([
      'Your password cannot be only spaces.',
      'Choose a password you have not used here before.',
      'Your password cannot be your email address.',
      'Your password cannot be your email address.',
    ])
    expect(new Set(messages.slice(0, 3)).size).toBe(3)
  })

  it('compares against the email case-insensitively', () => {
    expect(validateNewPassword('Ada.Chaiyawat', context)).toBe('Your password cannot be your email address.')
  })
})
