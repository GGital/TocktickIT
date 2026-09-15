import { readFileSync } from 'node:fs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../src/app.js'
import { hashPassword } from '../../src/password.js'
import { prisma } from '../../src/prisma.js'
import { signIn } from '../helpers/session.js'

/**
 * "Hiding a button is not authorization": every refusal here is produced by calling the API directly with
 * no session, the wrong role, or a password-change-outstanding session (tests.md §1.4).
 */

const DOMAIN = '@authz-api.toktickit.test'
// Test fixtures, not real passwords (BR-12).
const PASSWORD = 'fixture-password-1'
const NEW_PASSWORD = 'fixture-password-new-1'

/** Every protected endpoint in api-spec §3 — asserted against the document itself in API-31. */
const PROTECTED_ROUTES = [
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'GET /api/categories',
  'GET /api/related-systems',
  'POST /api/tickets',
  'GET /api/tickets',
  'GET /api/tickets/:id',
  'POST /api/tickets/:id/attachments',
  'GET /api/tickets/:id/attachments',
  'GET /api/attachments/:id/download',
  'DELETE /api/attachments/:id',
  'GET /api/tickets/:id/comments',
  'POST /api/tickets/:id/comments',
  'POST /api/tickets/:id/appears-resolved',
  'GET /api/staff/tickets',
  'GET /api/staff/tickets/:id',
  'PATCH /api/staff/tickets/:id/assignment',
  'PATCH /api/staff/tickets/:id/priority',
  'PATCH /api/staff/tickets/:id/status',
  'GET /api/staff/tickets/:id/internal-notes',
  'POST /api/staff/tickets/:id/internal-notes',
  'GET /api/staff/assignees',
  'GET /api/admin/users',
  'POST /api/admin/users',
  'PATCH /api/admin/users/:id',
  'POST /api/admin/users/:id/initial-password',
]

const GATE_EXEMPT = ['GET /api/auth/me', 'POST /api/auth/change-password', 'POST /api/auth/logout']
const ADMIN_ROUTES = PROTECTED_ROUTES.filter((route) => route.includes(' /api/admin/'))
const STAFF_ROUTES = PROTECTED_ROUTES.filter((route) => route.includes(' /api/staff/'))
const REQUESTER_ONLY = ['POST /api/tickets', 'POST /api/tickets/:id/appears-resolved']

/** The authorization matrix (specification §5): every route each role is refused with 403 FORBIDDEN. */
const FORBIDDEN_FOR = {
  REQUESTER: [...STAFF_ROUTES, ...ADMIN_ROUTES],
  IT_STAFF: [...ADMIN_ROUTES, ...REQUESTER_ONLY],
  ADMINISTRATOR: REQUESTER_ONLY,
} as const

let requesterA: { id: number; fullName: string }
let requesterB: { id: number }
let staff: { id: number; fullName: string }
let admin: { id: number }
let gatedAdmin: { id: number }
let gatedRequester: { id: number }
let ticketId: number
const cookie: Record<string, string> = {}

const notes = [
  'Internal: vendor case opened for the replacement unit.',
  'Internal: requester was rude on the phone, handle with care.',
  'Internal: firmware rollback scheduled for Friday.',
]

/** Calls "METHOD /path/:id" with an optional session cookie and a JSON body. */
function call(route: string, options: { cookie?: string; id?: number; body?: object } = {}) {
  const [method, path] = route.split(' ')
  const verb = method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'
  const req = request(app)[verb](path.replace(':id', String(options.id ?? ticketId)))
  if (options.cookie) req.set('Cookie', options.cookie)
  return method === 'GET' ? req : req.send(options.body ?? {})
}

async function createUser(key: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR', mustChangePassword = false) {
  const user = await prisma.user.create({
    data: {
      email: `${key}${DOMAIN}`,
      fullName: `Authz ${key}`,
      role,
      mustChangePassword,
      passwordHash: await hashPassword(PASSWORD),
    },
  })
  cookie[key] = await signIn(user.id)
  return user
}

const ticketRow = () => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

beforeAll(async () => {
  requesterA = await createUser('requester-a', 'REQUESTER')
  requesterB = await createUser('requester-b', 'REQUESTER')
  staff = await createUser('staff', 'IT_STAFF')
  admin = await createUser('admin', 'ADMINISTRATOR')
  gatedAdmin = await createUser('gated-admin', 'ADMINISTRATOR', true)
  gatedRequester = await createUser('gated-requester', 'REQUESTER', true)

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-AUTHZ-${Date.now()}`,
      requesterId: requesterA.id,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Authorization fixture ticket',
      description: 'Owned by requester A; carries public comments and internal notes.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
    },
  })
  ticketId = ticket.id

  await prisma.ticketMessage.createMany({
    data: [
      { ticketId, authorId: staff.id, visibility: 'PUBLIC', body: 'Public: we are looking into it.' },
      { ticketId, authorId: requesterA.id, visibility: 'PUBLIC', body: 'Public: thank you.' },
      ...notes.map((body) => ({ ticketId, authorId: staff.id, visibility: 'INTERNAL' as const, body })),
    ],
  })
}, 60_000)

afterAll(async () => {
  // Messages cascade with the Ticket; sessions cascade with their users.
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

/** A 403 carries a code and a message and nothing else: no record, identifier, or count (BR-24). */
function expectBare403(res: request.Response, code: 'FORBIDDEN' | 'PASSWORD_CHANGE_REQUIRED') {
  expect(res.status).toBe(403)
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } })
  expect(res.body.error.message).not.toMatch(/\d/)
}

describe('API-19 Requester calls the Ticket Queue (AC-17, AC-19)', () => {
  it('is 403 FORBIDDEN, not 404, with no Ticket data and no count', async () => {
    const res = await call('GET /api/staff/tickets', { cookie: cookie['requester-a'] })

    expectBare403(res, 'FORBIDDEN')
    expect(res.text).not.toContain('Authorization fixture ticket')
  })
})

describe('API-20 Requester calls the staff detail route for their own Ticket (AC-19)', () => {
  it('is 403 — the route is forbidden to the role regardless of ownership', async () => {
    expectBare403(await call('GET /api/staff/tickets/:id', { cookie: cookie['requester-a'] }), 'FORBIDDEN')
  })
})

describe('API-21 Requester calls assignment, priority, and status (AC-40, BR-32, BR-34)', () => {
  it('is 403 on all three and the Ticket row is unchanged', async () => {
    const before = await ticketRow()

    for (const [route, body] of [
      ['PATCH /api/staff/tickets/:id/assignment', { assigneeId: requesterA.id }],
      ['PATCH /api/staff/tickets/:id/priority', { itPriority: 'URGENT' }],
      ['PATCH /api/staff/tickets/:id/status', { status: 'RESOLVED' }],
    ] as const) {
      expectBare403(await call(route, { cookie: cookie['requester-a'], body }), 'FORBIDDEN')
    }

    expect(await ticketRow()).toEqual(before)
  })
})

describe('API-22 Requester reads Internal Notes on a Ticket holding three (AC-16, BR-24)', () => {
  it('is 403 with no note body, no author, and no count anywhere in the response', async () => {
    const res = await call('GET /api/staff/tickets/:id/internal-notes', { cookie: cookie['requester-a'] })

    expectBare403(res, 'FORBIDDEN')
    for (const body of notes) expect(res.text).not.toContain(body)
    expect(res.text).not.toContain(staff.fullName)
  })
})

describe('API-23 Requester posts an Internal Note (AC-16)', () => {
  it('is 403 and no TicketMessage row is created', async () => {
    const before = await prisma.ticketMessage.count({ where: { ticketId } })

    const res = await call('POST /api/staff/tickets/:id/internal-notes', {
      cookie: cookie['requester-a'],
      body: { body: 'Requester trying to write privately.' },
    })

    expectBare403(res, 'FORBIDDEN')
    expect(await prisma.ticketMessage.count({ where: { ticketId } })).toBe(before)
  })
})

describe('API-24 and API-25 Requester and IT Staff call every Administrator route (AC-17, AC-18)', () => {
  it.each(['requester-a', 'staff'])('%s is refused 403 on each, with no user data', async (key) => {
    for (const route of ADMIN_ROUTES) {
      const res = await call(route, {
        cookie: cookie[key],
        id: requesterB.id,
        body: { fullName: 'Escalated', email: `escalated${DOMAIN}`, role: 'ADMINISTRATOR', password: NEW_PASSWORD },
      })
      expectBare403(res, 'FORBIDDEN')
      expect(res.text).not.toContain(DOMAIN)
    }
    expect(await prisma.user.count({ where: { email: `escalated${DOMAIN}` } })).toBe(0)
  })
})

describe('API-26 IT Staff and Administrator create a Ticket (BR-25, matrix)', () => {
  it.each(['staff', 'admin'])('%s is refused 403 and no Ticket is created', async (key) => {
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })

    const res = await call('POST /api/tickets', {
      cookie: cookie[key],
      body: {
        summary: 'Staff should not be able to raise this',
        description: 'Creating a Ticket is a Requester operation.',
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority: 'LOW',
      },
    })

    expectBare403(res, 'FORBIDDEN')
    expect(await prisma.ticket.count({ where: { requesterId: { in: [staff.id, admin.id] } } })).toBe(0)
  })
})

describe('API-27 Requester B requests Requester A’s Ticket (AC-20, BR-19)', () => {
  it('is 404 with a body identical to a Ticket that does not exist', async () => {
    const highest = await prisma.ticket.findFirstOrThrow({ orderBy: { id: 'desc' } })

    const foreign = await call('GET /api/tickets/:id', { cookie: cookie['requester-b'] })
    const missing = await call('GET /api/tickets/:id', { cookie: cookie['requester-b'], id: highest.id + 1000 })

    expect(foreign.status).toBe(404)
    expect(foreign.text).toBe(missing.text)
    expect(foreign.body.error.code).toBe('TICKET_NOT_FOUND')
  })
})

describe('API-28 IT Staff and Administrator pass the staff role guard (A-01, BR-25)', () => {
  // The detail, assignment, priority, and status handlers arrive in #54, which tightens those rows to the
  // documented 200. Internal Notes (#51) and the Queue (#52) are asserted at their documented status already.
  it.each(['staff', 'admin'])('%s is neither 401 nor 403 on detail, assignment, priority, and status', async (key) => {
    for (const [route, body] of [
      ['GET /api/staff/tickets/:id', undefined],
      ['PATCH /api/staff/tickets/:id/assignment', { assigneeId: 'me' }],
      ['PATCH /api/staff/tickets/:id/priority', { itPriority: 'HIGH' }],
      ['PATCH /api/staff/tickets/:id/status', { status: 'OPEN' }],
      ['GET /api/staff/assignees', undefined],
    ] as const) {
      const res = await call(route, { cookie: cookie[key], body })
      expect([401, 403], `${key} ${route}`).not.toContain(res.status)
    }
  })

  it.each(['staff', 'admin'])('%s reads the Ticket Queue with 200', async (key) => {
    const res = await call('GET /api/staff/tickets', { cookie: cookie[key] })
    expect(res.status).toBe(200)
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20 })
  })

  it.each(['staff', 'admin'])('%s reads Internal Notes with 200 and appends one with 201', async (key) => {
    expect((await call('GET /api/staff/tickets/:id/internal-notes', { cookie: cookie[key] })).status).toBe(200)
    const posted = await call('POST /api/staff/tickets/:id/internal-notes', { cookie: cookie[key], body: { body: 'Staff note.' } })
    expect(posted.status).toBe(201)
    expect(posted.body.visibility).toBe('INTERNAL')
  })

  it.each(['staff', 'admin'])('%s reads their own Ticket list like any authenticated role', async (key) => {
    const res = await call('GET /api/tickets', { cookie: cookie[key] })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

describe('API-29 a password change outstanding blocks everything else (AC-11, BR-15, BR-16)', () => {
  it('refuses the queue, a Ticket route, and an admin route to an Administrator with the gate open', async () => {
    for (const route of ['GET /api/staff/tickets', 'GET /api/tickets', 'GET /api/admin/users']) {
      expectBare403(await call(route, { cookie: cookie['gated-admin'] }), 'PASSWORD_CHANGE_REQUIRED')
    }
  })

  it('performs nothing: a gated Requester cannot create a Ticket their role would otherwise allow', async () => {
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })

    const res = await call('POST /api/tickets', {
      cookie: cookie['gated-requester'],
      body: {
        summary: 'Gated requester ticket',
        description: 'Must not be created before the password change.',
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority: 'LOW',
      },
    })

    expectBare403(res, 'PASSWORD_CHANGE_REQUIRED')
    expect(await prisma.ticket.count({ where: { requesterId: gatedRequester.id } })).toBe(0)
  })

  it('applies to every protected route, including one added after this test was written (BR-16)', async () => {
    for (const route of [...PROTECTED_ROUTES.filter((r) => !GATE_EXEMPT.includes(r)), 'GET /api/a-future-route']) {
      const res = await call(route, { cookie: cookie['gated-admin'], id: requesterB.id })
      expectBare403(res, 'PASSWORD_CHANGE_REQUIRED')
    }
  })
})

describe('API-30 the gate leaves one way forward and one way out (AC-11, BR-15)', () => {
  it('lets the gated session reach me, logout, and change-password', async () => {
    const other = await signIn(gatedRequester.id)
    const current = cookie['gated-requester']

    const me = await call('GET /api/auth/me', { cookie: current })
    expect(me.status).toBe(200)
    expect(me.body.mustChangePassword).toBe(true)

    expect((await call('POST /api/auth/logout', { cookie: other })).status).toBe(204)

    const changed = await call('POST /api/auth/change-password', {
      cookie: current,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    })
    expect(changed.status).toBe(200)
    expect(changed.body.mustChangePassword).toBe(false)

    // With the gate closed the same session reaches the application.
    expect((await call('GET /api/tickets', { cookie: current })).status).toBe(200)
  })
})

describe('API-31 every protected route refuses a request with no session (AC-04)', () => {
  it('lists exactly the protected endpoints documented in api-spec §3', () => {
    const doc = readFileSync('../docs/lab-03/api-spec.md', 'utf8')
    const section = doc.slice(doc.indexOf('## 3. Endpoints'), doc.indexOf('## 4. '))
    const documented = [...section.matchAll(/^(?:### 3\.\d+ |\| )`((?:GET|POST|PATCH|DELETE) \/api\/[^`]+)`/gm)]
      .map((match) => match[1])
      .filter((route) => route !== 'POST /api/auth/login')

    expect([...PROTECTED_ROUTES].sort()).toEqual([...new Set(documented)].sort())
  })

  it.each(PROTECTED_ROUTES)('%s answers 401 UNAUTHENTICATED', async (route) => {
    const res = await call(route)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) } })
  })

  it('does not accept the retired X-Requester-Id header as identity (BR-57)', async () => {
    const res = await request(app).get('/api/tickets').set('X-Requester-Id', String(requesterA.id))

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('API-32 every wrong-role refusal is a bare 403 (BR-23, BR-24)', () => {
  it.each(Object.keys(FORBIDDEN_FOR) as (keyof typeof FORBIDDEN_FOR)[])(
    '%s is refused on every route the matrix forbids, with no record, identifier, or count',
    async (role) => {
      const key = { REQUESTER: 'requester-a', IT_STAFF: 'staff', ADMINISTRATOR: 'admin' }[role]
      const messages = new Set<string>()

      for (const route of FORBIDDEN_FOR[role]) {
        const res = await call(route, { cookie: cookie[key], id: route.includes('/admin/') ? requesterB.id : ticketId })
        expectBare403(res, 'FORBIDDEN')
        expect(res.text).not.toContain(String(ticketId))
        expect(res.text).not.toContain(DOMAIN)
        messages.add(res.body.error.message)
      }

      // One fixed message: the wording cannot vary with what the caller was refused.
      expect(messages.size).toBe(1)
    },
  )
})
