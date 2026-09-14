import { randomBytes } from 'node:crypto'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import app from '../../src/app.js'
import { hashPassword } from '../../src/password.js'
import { prisma } from '../../src/prisma.js'

// Test fixtures, not real passwords (BR-12). Every account lives on the .test domain and is removed afterwards.
const PASSWORD = 'fixture-password-1'
const NEW_PASSWORD = 'fixture-password-new-1'
const INVALID_MESSAGE = 'Email or password is incorrect, or the account is not active.'
const DOMAIN = '@auth-api.toktickit.test'

let counter = 0

/** A fresh user per test, so throttle counters and sessions never leak between tests. */
async function createUser(overrides: { isActive?: boolean; mustChangePassword?: boolean } = {}) {
  counter += 1
  return prisma.user.create({
    data: {
      email: `user-${counter}${DOMAIN}`,
      fullName: `Auth Fixture ${counter}`,
      role: 'IT_STAFF',
      passwordHash: await hashPassword(PASSWORD),
      isActive: overrides.isActive ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
    },
  })
}

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password })

/** `toktickit.sid=<id>` from a login response, ready for a Cookie header. */
const sessionCookie = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0]
const sessionId = (cookie: string) => cookie.split('=')[1]

async function signIn(email: string, password = PASSWORD) {
  const res = await login(email, password)
  expect(res.status).toBe(200)
  return sessionCookie(res)
}

const me = (cookie?: string) => {
  const req = request(app).get('/api/auth/me')
  return cookie ? req.set('Cookie', cookie) : req
}

const changePassword = (cookie: string, body: object) =>
  request(app).post('/api/auth/change-password').set('Cookie', cookie).send(body)

afterEach(() => vi.restoreAllMocks())

afterAll(async () => {
  // Sessions cascade with their user.
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-01 valid login (AC-01)', () => {
  it('opens a session with an HttpOnly, SameSite=Lax cookie and returns only the AuthenticatedUser', async () => {
    const user = await createUser()
    const res = await login(user.email, PASSWORD)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'IT_STAFF',
      mustChangePassword: false,
    })

    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(setCookie).toMatch(/^toktickit\.sid=[A-Za-z0-9_-]{43};/)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=28800')
    expect(setCookie).not.toContain('Secure')

    const id = sessionId(sessionCookie(res))
    expect(res.text).not.toContain(id)
    expect(res.text).not.toContain('scrypt$')

    // BR-02: one row, 32 random bytes, absolute expiry eight hours after creation.
    const sessions = await prisma.session.findMany({ where: { userId: user.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(id)
    expect(Buffer.from(id, 'base64url')).toHaveLength(32)
    expect(sessions[0].expiresAt.getTime() - sessions[0].createdAt.getTime()).toBeGreaterThanOrEqual(8 * 3600_000 - 1000)
    expect(sessions[0].expiresAt.getTime() - sessions[0].createdAt.getTime()).toBeLessThanOrEqual(8 * 3600_000 + 1000)
  })

  it('marks the cookie Secure when NODE_ENV is production (BR-03)', async () => {
    const user = await createUser()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const res = await login(user.email, PASSWORD)
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('Secure')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('API-02 – API-04 indistinguishable login failures (AC-02, BR-01)', () => {
  it('API-02 answers a wrong password 401 INVALID_CREDENTIALS with no session and no cookie', async () => {
    const user = await createUser()
    const res = await login(user.email, 'fixture-password-wrong')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: INVALID_MESSAGE } })
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
  })

  it('API-03 and API-04 answer an unknown email and an inactive account byte-identically', async () => {
    const active = await createUser()
    const inactive = await createUser({ isActive: false })

    const wrongPassword = await login(active.email, 'fixture-password-wrong')
    const unknownEmail = await login(`nobody${DOMAIN}`, PASSWORD)
    const inactiveAccount = await login(inactive.email, PASSWORD)

    for (const res of [unknownEmail, inactiveAccount]) {
      expect(res.status).toBe(401)
      expect(res.text).toBe(wrongPassword.text)
      expect(res.headers['content-length']).toBe(wrongPassword.headers['content-length'])
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    expect(await prisma.session.count({ where: { userId: inactive.id } })).toBe(0)
  })
})

describe('API-05 missing credentials (BR-01)', () => {
  it('answers 400 VALIDATION_FAILED naming every missing field', async () => {
    const both = await request(app).post('/api/auth/login').send({})
    expect(both.status).toBe(400)
    expect(both.body.error.code).toBe('VALIDATION_FAILED')
    expect(both.body.error.fields).toEqual([
      { field: 'email', message: 'Enter a valid email address.' },
      { field: 'password', message: 'Enter your password.' },
    ])

    const passwordOnly = await login(`someone${DOMAIN}`, '   ')
    expect(passwordOnly.status).toBe(400)
    expect(passwordOnly.body.error.fields).toEqual([{ field: 'password', message: 'Enter your password.' }])
  })

  it('answers a body that is not JSON 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "x", "password": ')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('API-06 email normalisation (BR-49)', () => {
  it('signs in with the email in mixed case and surrounding spaces', async () => {
    const user = await createUser()
    const res = await login(`  ${user.email.toUpperCase()}  `, PASSWORD)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(user.id)
  })
})

describe('API-07 login throttle (AC-08, BR-08)', () => {
  it('answers the sixth attempt 429 TOO_MANY_ATTEMPTS, even with the right password, and locks nothing', async () => {
    const user = await createUser()

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(user.email, 'fixture-password-wrong')).status).toBe(401)
    }

    const sixth = await login(user.email, PASSWORD)
    expect(sixth.status).toBe(429)
    expect(sixth.body).toEqual({
      error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please wait a few minutes and try again.' },
    })
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)

    // No lock is written to the account, and another address from the same client is unaffected.
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.isActive).toBe(true)
    const other = await createUser()
    expect((await login(other.email, PASSWORD)).status).toBe(200)
  })

  it('reopens on its own once the 15-minute window has passed', async () => {
    const user = await createUser()
    const start = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(start)
    for (let attempt = 1; attempt <= 5; attempt += 1) await login(user.email, 'fixture-password-wrong')
    expect((await login(user.email, PASSWORD)).status).toBe(429)

    vi.spyOn(Date, 'now').mockReturnValue(start + 15 * 60_000 + 1)
    expect((await login(user.email, PASSWORD)).status).toBe(200)
  })
})

describe('API-08 a successful login clears the counter (BR-08)', () => {
  it('lets four failures, a success, and five more failures through before throttling', async () => {
    const user = await createUser()

    for (let attempt = 1; attempt <= 4; attempt += 1) await login(user.email, 'fixture-password-wrong')
    expect((await login(user.email, PASSWORD)).status).toBe(200)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(user.email, 'fixture-password-wrong')).status).toBe(401)
    }
    expect((await login(user.email, 'fixture-password-wrong')).status).toBe(429)
  })
})

describe('API-09 current user (AC-03)', () => {
  it('returns exactly the AuthenticatedUser shape', async () => {
    const user = await createUser({ mustChangePassword: true })
    const res = await me(await signIn(user.email))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'IT_STAFF',
      mustChangePassword: true,
    })
  })
})

describe('API-10 and API-11 unauthenticated requests (AC-04)', () => {
  const unauthenticated = { error: { code: 'UNAUTHENTICATED', message: expect.any(String) } }

  it('API-10 answers no cookie 401 UNAUTHENTICATED', async () => {
    const res = await me()

    expect(res.status).toBe(401)
    expect(res.body).toEqual(unauthenticated)
  })

  it('API-11 answers a malformed and an unknown session id 401 UNAUTHENTICATED', async () => {
    const malformed = await me('toktickit.sid=not-a-session')
    const unknown = await me(`toktickit.sid=${randomBytes(32).toString('base64url')}`)

    for (const res of [malformed, unknown]) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual(unauthenticated)
    }
  })
})

describe('API-12 logout invalidates the session (AC-05, BR-05)', () => {
  it('deletes the row, clears the cookie, and refuses the replayed cookie', async () => {
    const user = await createUser()
    const cookie = await signIn(user.email)

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    const cleared = (res.headers['set-cookie'] as unknown as string[])[0]
    expect(cleared).toMatch(/^toktickit\.sid=;/)
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970')

    expect(await prisma.session.findUnique({ where: { id: sessionId(cookie) } })).toBeNull()
    expect((await me(cookie)).status).toBe(401)
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(401)
  })
})

describe('API-13 expired session (AC-07, BR-04)', () => {
  it('answers 401 and deletes the expired row', async () => {
    const user = await createUser()
    const cookie = await signIn(user.email)
    await prisma.session.update({ where: { id: sessionId(cookie) }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const res = await me(cookie)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(await prisma.session.findUnique({ where: { id: sessionId(cookie) } })).toBeNull()
  })
})

describe('API-14 valid password change (AC-13, BR-14)', () => {
  it('clears mustChangePassword, retires the old password, and accepts the new one', async () => {
    const user = await createUser({ mustChangePassword: true })
    const cookie = await signIn(user.email)

    const res = await changePassword(cookie, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: 'IT_STAFF',
      mustChangePassword: false,
    })
    expect((await login(user.email, PASSWORD)).status).toBe(401)
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200)
  })
})

describe('API-15 and API-16 rejected password changes (AC-12, BR-11)', () => {
  async function expectRejected(body: object, field: string, message: string) {
    const user = await createUser({ mustChangePassword: true })
    const cookie = await signIn(user.email)

    const res = await changePassword(cookie, body)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.fields).toEqual([{ field, message }])
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).toBe(user.passwordHash)
    expect(stored.mustChangePassword).toBe(true)
  }

  it('API-15 rejects a 9-character password on newPassword', () =>
    expectRejected(
      { currentPassword: PASSWORD, newPassword: 'short-pw1', confirmPassword: 'short-pw1' },
      'newPassword',
      'Use at least 10 characters.',
    ))

  it('API-15 rejects a mismatched confirmation on confirmPassword', () =>
    expectRejected(
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: `${NEW_PASSWORD}x` },
      'confirmPassword',
      'The two passwords do not match.',
    ))

  it('API-15 rejects a new password equal to the current one on newPassword', () =>
    expectRejected(
      { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD },
      'newPassword',
      'Choose a password you have not used here before.',
    ))

  it('API-16 rejects a wrong current password with 400 on currentPassword, not 401', () =>
    expectRejected(
      { currentPassword: 'fixture-password-wrong', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      'currentPassword',
      'Your current password is incorrect.',
    ))

  it('names every missing field in a malformed body', async () => {
    const user = await createUser()
    const res = await changePassword(await signIn(user.email), {})

    expect(res.status).toBe(400)
    expect(res.body.error.fields.map((error: { field: string }) => error.field)).toEqual([
      'currentPassword',
      'newPassword',
      'confirmPassword',
    ])
  })

  it('requires a session', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('API-17 a password change revokes the other sessions (AC-14, BR-06)', () => {
  it('signs out the second session and keeps the first', async () => {
    const user = await createUser()
    const first = await signIn(user.email)
    const second = await signIn(user.email)

    const res = await changePassword(first, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(200)
    expect((await me(second)).status).toBe(401)
    expect((await me(first)).status).toBe(200)
  })
})

describe('API-18 no password, hash, or session id in storage, responses, or logs (AC-09, BR-12)', () => {
  it('stores a scrypt hash and never writes a secret to a response or a log line', async () => {
    const logged: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((arg) => (arg instanceof Error ? `${arg.stack} ${JSON.stringify(arg)}` : JSON.stringify(arg) ?? String(arg))).join(' '))
      })
    }

    const user = await createUser({ mustChangePassword: true })
    const loginRes = await login(user.email, PASSWORD)
    const cookie = sessionCookie(loginRes)
    const responses = [
      loginRes,
      await login(user.email, 'fixture-password-wrong'),
      await me(cookie),
      await changePassword(cookie, { currentPassword: 'fixture-password-wrong', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      // A malformed body is where a JSON parser would otherwise echo the raw password into an error log.
      await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(`{"email":"${user.email}","password":"${PASSWORD}`),
      await request(app).post('/api/auth/logout').set('Cookie', cookie),
    ]

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).toMatch(/^scrypt\$/)
    expect(stored.passwordHash).not.toBe(NEW_PASSWORD)

    const secrets = [PASSWORD, NEW_PASSWORD, user.passwordHash, stored.passwordHash, sessionId(cookie), 'scrypt$']
    const everything = [...responses.map((res) => res.text), ...logged].join('\n')
    for (const secret of secrets) expect(everything).not.toContain(secret)
  })
})
