import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { UserRole } from '@prisma/client'
import { applyUserUpdate } from '../../src/adminUsers.js'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@users-admin-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const TAG = `UTAG${RUN}`
// Test fixtures, not real passwords (BR-12).
const INITIAL_PASSWORD = 'fixture-initial-2026'
const SUMMARY_KEYS = ['createdAt', 'email', 'fullName', 'id', 'isActive', 'mustChangePassword', 'role']

type Fixture = { id: number; fullName: string; email: string }
let admin: Fixture
let counter = 0

async function createUser(values: { role?: UserRole; fullName?: string; email?: string; isActive?: boolean; department?: string } = {}) {
  counter += 1
  return prisma.user.create({
    data: {
      email: values.email ?? `user-${counter}-${RUN.toLowerCase()}${DOMAIN}`,
      fullName: values.fullName ?? `Fixture User ${counter} ${TAG}`,
      role: values.role ?? 'REQUESTER',
      isActive: values.isActive ?? true,
      department: values.department ?? null,
      passwordHash: 'unusable-fixture',
      mustChangePassword: false,
    },
  })
}

const as = (userId: number, req: request.Test) => req.set('Cookie', asUser(userId))
const list = (query = '', userId = admin.id) => as(userId, request(app).get(`/api/admin/users${query}`))
const create = (body: object, userId = admin.id) => as(userId, request(app).post('/api/admin/users')).send(body)
const edit = (id: number | string, body: object, userId = admin.id) => as(userId, request(app).patch(`/api/admin/users/${id}`)).send(body)
const resetPassword = (id: number | string, body: object, userId = admin.id) =>
  as(userId, request(app).post(`/api/admin/users/${id}/initial-password`)).send(body)
const row = (id: number) => prisma.user.findUniqueOrThrow({ where: { id } })
const sessionCount = (userId: number) => prisma.session.count({ where: { userId } })
const protectedCall = (cookie: string) => request(app).get('/api/auth/me').set('Cookie', cookie)

const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status, res.text).toBe(status)
  expect(res.body.error).toMatchObject({ code, message: expect.any(String) })
}

const unknownUserId = async () => (await prisma.user.findFirstOrThrow({ orderBy: { id: 'desc' } })).id + 1000

beforeAll(async () => {
  admin = await createUser({ role: 'ADMINISTRATOR', fullName: `Admin Caller ${TAG}` })
  await signIn(admin.id)
})

afterAll(async () => {
  // Case-insensitive: a run with a broken normaliser (a mutation check, say) stores addresses as typed.
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN, mode: 'insensitive' } } })
  await prisma.$disconnect()
})

describe('API-79 the user list (AC-51, BR-12)', () => {
  it('returns active and inactive users as UserSummary rows, by name, with no passwordHash anywhere', async () => {
    const inactive = await createUser({ fullName: `Aaron Inactive ${TAG}`, isActive: false })
    const staff = await createUser({ fullName: `Bella Staff ${TAG}`, role: 'IT_STAFF' })

    const res = await list(`?search=${TAG}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).not.toHaveProperty('meta')
    const names = res.body.map((user: Fixture) => user.fullName)
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)))
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: inactive.id, fullName: inactive.fullName, email: inactive.email, role: 'REQUESTER', isActive: false, mustChangePassword: false, createdAt: expect.any(String) },
        expect.objectContaining({ id: staff.id, role: 'IT_STAFF', isActive: true }),
      ]),
    )
    for (const user of res.body) expect(Object.keys(user).sort()).toEqual(SUMMARY_KEYS)
    expect(res.text).not.toMatch(/passwordHash|scrypt\$|unusable-fixture/)
  })

  it('lists every user without a search, with no pagination', async () => {
    const res = await list()
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(await prisma.user.count())
  })
})

describe('API-80 and API-81 search (AC-52)', () => {
  it('matches a name fragment in the opposite letter case', async () => {
    const match = await createUser({ fullName: `Kanokwan Zq${RUN}` })
    await createUser({ fullName: `Somchai Other ${TAG}` })

    const res = await list(`?search=${encodeURIComponent(`kANOKWAN zQ${RUN.toLowerCase()}`)}`)

    expect(res.status).toBe(200)
    expect(res.body.map((user: Fixture) => user.id)).toEqual([match.id])
  })

  it('matches an email fragment', async () => {
    const match = await createUser({ email: `mali.searchable.${RUN.toLowerCase()}${DOMAIN}` })

    const res = await list(`?search=${encodeURIComponent(`  MALI.SEARCHABLE.${RUN}  `)}`)

    expect(res.body.map((user: Fixture) => user.id)).toEqual([match.id])
  })
})

describe('API-82 search combined with a role filter (AC-52)', () => {
  it('returns only users matching both', async () => {
    const both = await createUser({ fullName: `Rolefilter${RUN} Staff`, role: 'IT_STAFF' })
    await createUser({ fullName: `Rolefilter${RUN} Requester`, role: 'REQUESTER' })
    await createUser({ fullName: `Unrelated Staff ${RUN}`, role: 'IT_STAFF' })

    const res = await list(`?search=rolefilter${RUN.toLowerCase()}&role=IT_STAFF`)

    expect(res.status).toBe(200)
    expect(res.body.map((user: Fixture) => user.id)).toEqual([both.id])
  })
})

describe('API-83 an unknown or repeated role filter (BR-50)', () => {
  it.each(['?role=SUPERUSER', '?role=IT_STAFF&role=REQUESTER', '?role=it_staff'])('%s is 400 naming role', async (query) => {
    const res = await list(query)
    expectError(res, 400, 'INVALID_QUERY_PARAMETER')
    expect(res.body.error.message.split(' ')[0]).toBe('role')
  })
})

describe('API-84 creating a user (AC-53, BR-47, BR-13)', () => {
  it('stores one role and the chosen activation, requires a password change, and echoes the password once', async () => {
    const res = await create({ fullName: '  Nara Sukjai  ', email: `  Nara.Created.${RUN}${DOMAIN.toUpperCase()} `, role: 'IT_STAFF', isActive: false, initialPassword: INITIAL_PASSWORD })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      user: {
        id: expect.any(Number),
        fullName: 'Nara Sukjai',
        email: `nara.created.${RUN.toLowerCase()}${DOMAIN}`,
        role: 'IT_STAFF',
        isActive: false,
        mustChangePassword: true,
        createdAt: expect.any(String),
      },
      initialPassword: INITIAL_PASSWORD,
    })

    const stored = await row(res.body.user.id)
    expect(stored.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(stored.passwordHash).not.toContain(INITIAL_PASSWORD)
    // Never retrievable again: neither the list nor an edit response carries it.
    expect((await list(`?search=nara.created.${RUN}`)).text).not.toContain(INITIAL_PASSWORD)
    expect((await edit(stored.id, { fullName: 'Nara S.' })).text).not.toContain(INITIAL_PASSWORD)
  })
})

describe('API-85 the created user signs in with the initial password (AC-53, AC-60)', () => {
  it('logs in, and every other endpoint is gated until the password is changed', async () => {
    const email = `gated.${RUN.toLowerCase()}${DOMAIN}`
    expect((await create({ fullName: 'Gated Newcomer', email, role: 'REQUESTER', isActive: true, initialPassword: INITIAL_PASSWORD })).status).toBe(201)

    const login = await request(app).post('/api/auth/login').send({ email, password: INITIAL_PASSWORD })
    expect(login.status).toBe(200)
    expect(login.body.mustChangePassword).toBe(true)
    const cookie = String(login.headers['set-cookie']).split(';')[0]

    expectError(await request(app).get('/api/tickets').set('Cookie', cookie), 403, 'PASSWORD_CHANGE_REQUIRED')
    expect((await protectedCall(cookie)).status).toBe(200)
  })
})

describe('API-86 creating with an email already used in another letter case (AC-54, BR-49)', () => {
  it('is 409 EMAIL_ALREADY_EXISTS and writes no row', async () => {
    const existing = await createUser({ email: `taken.${RUN.toLowerCase()}${DOMAIN}` })
    const before = await prisma.user.count()

    const res = await create({ fullName: 'Duplicate Person', email: existing.email.toUpperCase(), role: 'REQUESTER', isActive: true, initialPassword: INITIAL_PASSWORD })

    expectError(res, 409, 'EMAIL_ALREADY_EXISTS')
    expect(res.text).not.toContain(INITIAL_PASSWORD)
    expect(await prisma.user.count()).toBe(before)
  })
})

describe('API-87 an invalid create body (AC-55, BR-50)', () => {
  it('is 400 VALIDATION_FAILED naming the unknown role, the empty name, and the 9-character password', async () => {
    const before = await prisma.user.count()

    const res = await create({ fullName: '   ', email: `invalid.${RUN.toLowerCase()}${DOMAIN}`, role: 'SUPERUSER', isActive: true, initialPassword: 'ninechars' })

    expectError(res, 400, 'VALIDATION_FAILED')
    expect(res.body.error.fields.map((field: { field: string }) => field.field).sort()).toEqual(['fullName', 'initialPassword', 'role'])
    expect(res.text).not.toContain('ninechars')
    expect(await prisma.user.count()).toBe(before)
  })

  it('rejects mustChangePassword and a missing isActive rather than defaulting them', async () => {
    const res = await create({ fullName: 'No Defaults', email: `nodefault.${RUN.toLowerCase()}${DOMAIN}`, role: 'REQUESTER', initialPassword: INITIAL_PASSWORD, mustChangePassword: false })
    expectError(res, 400, 'VALIDATION_FAILED')
    expect(res.body.error.fields.map((field: { field: string }) => field.field).sort()).toEqual(['isActive', 'mustChangePassword'])
  })
})

describe('API-88 editing all four fields (AC-56, BR-48)', () => {
  it('changes the four fields and no other column', async () => {
    const target = await createUser({ department: 'Finance' })
    await prisma.user.update({ where: { id: target.id }, data: { mustChangePassword: true } })
    const before = await row(target.id)

    const res = await edit(target.id, { fullName: 'Renamed Person', email: `  Renamed.${RUN}${DOMAIN}`, role: 'IT_STAFF', isActive: false })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: target.id,
      fullName: 'Renamed Person',
      email: `renamed.${RUN.toLowerCase()}${DOMAIN}`,
      role: 'IT_STAFF',
      isActive: false,
      mustChangePassword: true,
      createdAt: before.createdAt.toISOString(),
    })
    const after = await row(target.id)
    expect({ ...after, updatedAt: null }).toEqual({
      ...before,
      fullName: 'Renamed Person',
      email: `renamed.${RUN.toLowerCase()}${DOMAIN}`,
      role: 'IT_STAFF',
      isActive: false,
      updatedAt: null,
    })
  })

  it('keeps a user’s own address valid when only its letter case changes', async () => {
    const target = await createUser()
    const res = await edit(target.id, { email: target.email.toUpperCase() })
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(target.email)
  })
})

describe('API-89 any other key in an edit (BR-48)', () => {
  it.each([[{ passwordHash: 'scrypt$forged' }], [{ mustChangePassword: false }], [{ department: 'IT' }], [{ fullName: 'Fine Name', createdAt: '2020-01-01' }]])(
    '%j is 400 VALIDATION_FAILED and nothing changes',
    async (body) => {
      const target = await createUser()
      const before = await row(target.id)

      const res = await edit(target.id, body)

      expectError(res, 400, 'VALIDATION_FAILED')
      expect(await row(target.id)).toEqual(before)
    },
  )

  it('rejects an empty body, a bad id, and an unknown user in the documented order', async () => {
    expectError(await edit((await createUser()).id, {}), 400, 'VALIDATION_FAILED')
    expectError(await edit('abc', { fullName: 'Whoever' }), 400, 'INVALID_PATH_PARAMETER')
    expectError(await edit(await unknownUserId(), { passwordHash: 'x' }), 400, 'VALIDATION_FAILED')
    expectError(await edit(await unknownUserId(), { fullName: 'Nobody Here' }), 404, 'USER_NOT_FOUND')
  })
})

describe('API-90 editing an email to one another account holds (AC-54)', () => {
  it('is 409 EMAIL_ALREADY_EXISTS and nothing is written', async () => {
    const holder = await createUser()
    const target = await createUser()
    const before = await row(target.id)

    const res = await edit(target.id, { fullName: 'Should Not Stick', email: holder.email.toUpperCase() })

    expectError(res, 409, 'EMAIL_ALREADY_EXISTS')
    expect(await row(target.id)).toEqual(before)
  })
})

describe('API-91 and API-92 deactivation and role change end the user’s sessions (AC-57, BR-07)', () => {
  it('deactivating a signed-in user makes their next request 401', async () => {
    const target = await createUser()
    const cookie = await signIn(target.id)
    expect((await protectedCall(cookie)).status).toBe(200)

    expect((await edit(target.id, { isActive: false })).status).toBe(200)

    expectError(await protectedCall(cookie), 401, 'UNAUTHENTICATED')
    expect(await sessionCount(target.id)).toBe(0)
  })

  it('changing a signed-in user’s role deletes their sessions', async () => {
    const target = await createUser({ role: 'IT_STAFF' })
    const cookie = await signIn(target.id)

    expect((await edit(target.id, { role: 'REQUESTER' })).status).toBe(200)

    expect(await sessionCount(target.id)).toBe(0)
    expectError(await protectedCall(cookie), 401, 'UNAUTHENTICATED')
  })

  it('a name or email edit, or re-sending the same role and activation, keeps the sessions', async () => {
    const target = await createUser({ role: 'IT_STAFF' })
    const cookie = await signIn(target.id)

    expect((await edit(target.id, { fullName: 'Still Signed In', role: 'IT_STAFF', isActive: true })).status).toBe(200)

    expect((await protectedCall(cookie)).status).toBe(200)
  })
})

describe('API-93 an Administrator targeting themselves (AC-58, BR-51)', () => {
  it('is 409 SELF_DEACTIVATION_FORBIDDEN for their own activation and role, and nothing changes', async () => {
    const self = await createUser({ role: 'ADMINISTRATOR' })
    await createUser({ role: 'ADMINISTRATOR' }) // another active Administrator, so only the self rule can refuse
    await signIn(self.id)
    const before = await row(self.id)

    expectError(await edit(self.id, { isActive: false }, self.id), 409, 'SELF_DEACTIVATION_FORBIDDEN')
    expectError(await edit(self.id, { role: 'IT_STAFF', fullName: 'Not Applied' }, self.id), 409, 'SELF_DEACTIVATION_FORBIDDEN')

    expect(await row(self.id)).toEqual(before)
    expect((await protectedCall(asUser(self.id))).status).toBe(200)
  })

  it('still lets them edit their own name and email, even when the form re-sends role and activation', async () => {
    const self = await createUser({ role: 'ADMINISTRATOR' })
    await signIn(self.id)

    const res = await edit(self.id, { fullName: 'Renamed Admin', email: `self.${RUN.toLowerCase()}${DOMAIN}`, role: 'ADMINISTRATOR', isActive: true }, self.id)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ fullName: 'Renamed Admin', role: 'ADMINISTRATOR', isActive: true })
    expect((await protectedCall(asUser(self.id))).status).toBe(200)
  })
})

describe('API-94 the last active Administrator (AC-59, BR-52, exit criterion)', () => {
  // Every other active Administrator — the seed and any fixture — is parked for these tests and restored after, so
  // the two created here really are the last two. Files run one at a time, so no other suite observes the gap.
  let parked: number[] = []

  beforeEach(async () => {
    parked = (await prisma.user.findMany({ where: { role: 'ADMINISTRATOR', isActive: true }, select: { id: true } })).map((user) => user.id)
    await prisma.user.updateMany({ where: { id: { in: parked } }, data: { isActive: false } })
  })

  afterEach(async () => {
    await prisma.user.updateMany({ where: { id: { in: parked } }, data: { isActive: true } })
  })

  const lastTwo = async () => {
    const a = await createUser({ role: 'ADMINISTRATOR', fullName: `Last A ${TAG}` })
    const b = await createUser({ role: 'ADMINISTRATOR', fullName: `Last B ${TAG}` })
    await signIn(a.id)
    await signIn(b.id)
    return [a, b]
  }
  const activeAdministrators = () => prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } })

  it.each([
    ['deactivate', { isActive: false }],
    ['demote', { role: 'IT_STAFF' }],
  ] as const)('two overlapping requests that %s each other still leave one active Administrator', async (_label, change) => {
    for (let round = 0; round < 8; round += 1) {
      const [a, b] = await lastTwo()

      const responses = await Promise.all([edit(b.id, change, a.id), edit(a.id, change, b.id)])

      const statuses = responses.map((res) => res.status).sort()
      expect(statuses.filter((status) => status === 200), `round ${round}: ${statuses}`).toHaveLength(1)
      // The loser is refused by the safety rule, or — if the winner already ended its session — by authentication.
      for (const res of responses.filter((res) => res.status !== 200)) {
        expect(['LAST_ACTIVE_ADMINISTRATOR', 'UNAUTHENTICATED']).toContain(res.body.error.code)
      }
      expect(await activeAdministrators()).toBe(1)

      await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { isActive: false, role: 'ADMINISTRATOR' } })
    }
  }, 60_000)

  it.each([
    ['deactivating', { isActive: false }],
    ['demoting', { role: 'REQUESTER' }],
  ] as const)('refuses %s the only active Administrator with 409 LAST_ACTIVE_ADMINISTRATOR and changes nothing', async (_label, change) => {
    // Over HTTP the caller is always another active Administrator and self-targeting is refused first, so the rule
    // is reached sequentially only through the update itself, called here directly.
    const only = await createUser({ role: 'ADMINISTRATOR', fullName: `Only Admin ${TAG}` })
    const requester = await createUser()
    const before = await row(only.id)

    expect(await applyUserUpdate(requester.id, only.id, change)).toEqual({ outcome: 'last-administrator' })

    expect(await row(only.id)).toEqual(before)
    expect(await activeAdministrators()).toBe(1)
  })
})

describe('API-95 a new initial password (AC-60, BR-54)', () => {
  it('rehashes, requires a change, ends every session, echoes once, and gates the next login', async () => {
    const target = await createUser({ email: `reset.${RUN.toLowerCase()}${DOMAIN}` })
    const cookie = await signIn(target.id)
    const before = await row(target.id)

    const res = await resetPassword(target.id, { initialPassword: 'temporary-2026-09' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      user: { id: target.id, fullName: target.fullName, email: target.email, role: 'REQUESTER', isActive: true, mustChangePassword: true, createdAt: expect.any(String) },
      initialPassword: 'temporary-2026-09',
    })
    const after = await row(target.id)
    expect(after.passwordHash).not.toBe(before.passwordHash)
    expect(after.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(after.mustChangePassword).toBe(true)
    expect(await sessionCount(target.id)).toBe(0)
    expectError(await protectedCall(cookie), 401, 'UNAUTHENTICATED')

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: 'temporary-2026-09' })
    expect(login.status).toBe(200)
    const fresh = String(login.headers['set-cookie']).split(';')[0]
    expectError(await request(app).get('/api/tickets').set('Cookie', fresh), 403, 'PASSWORD_CHANGE_REQUIRED')
  })

  it('rejects a weak or email-derived password, and an unknown user', async () => {
    const target = await createUser({ email: `weakreset${RUN.toLowerCase()}${DOMAIN}` })
    const before = await row(target.id)

    for (const initialPassword of ['short', '            ', `weakreset${RUN.toLowerCase()}`, undefined]) {
      expectError(await resetPassword(target.id, { initialPassword }), 400, 'VALIDATION_FAILED')
    }
    expect(await row(target.id)).toEqual(before)
    expectError(await resetPassword(await unknownUserId(), { initialPassword: 'temporary-2026-09' }), 404, 'USER_NOT_FOUND')
    expectError(await resetPassword('0', { initialPassword: 'temporary-2026-09' }), 400, 'INVALID_PATH_PARAMETER')
  })

  it('an Administrator resetting their own password ends their own session too', async () => {
    const self = await createUser({ role: 'ADMINISTRATOR' })
    const cookie = await signIn(self.id)

    expect((await resetPassword(self.id, { initialPassword: 'temporary-2026-09' }, self.id)).status).toBe(200)

    expectError(await protectedCall(cookie), 401, 'UNAUTHENTICATED')
  })
})

describe('API-96 there is no deletion route (BR-53)', () => {
  it('DELETE /api/admin/users/:id is 404 and the user row survives', async () => {
    const target = await createUser()

    const res = await as(admin.id, request(app).delete(`/api/admin/users/${target.id}`))

    expect(res.status).toBe(404)
    expect(res.text).not.toContain(target.email)
    expect(await row(target.id)).toMatchObject({ id: target.id, isActive: true })
  })
})
