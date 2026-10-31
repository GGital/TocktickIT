import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { UserRole } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@lab4-authorization-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const MISSING_ID = 2_000_000_000

let requester: number
let staff: number
let otherStaff: number
let pending: number
let ticketId: number
let actionId: number

type Route = { method: 'get' | 'post' | 'patch'; path: (ticket: number, action: number) => string; body?: object }

const createBody = () => ({
  clientRequestId: randomUUID(),
  actionAt: new Date(Date.now() - 60_000).toISOString(),
  description: 'Authorization probe.',
  result: 'Should never be stored.',
  followUpRequired: false,
})

// Every Lab 4 route under /api/staff; with the two below, every protected Lab 4 route.
const STAFF_ACTION_ROUTES: Route[] = [
  { method: 'get', path: (t) => `/api/staff/tickets/${t}/actions` },
  { method: 'post', path: (t) => `/api/staff/tickets/${t}/actions`, body: createBody() },
  { method: 'patch', path: (t, a) => `/api/staff/tickets/${t}/actions/${a}`, body: { expectedVersion: 1, result: 'Changed' } },
  { method: 'post', path: (t, a) => `/api/staff/tickets/${t}/actions/${a}/complete-follow-up`, body: { expectedVersion: 1 } },
  { method: 'post', path: (t, a) => `/api/staff/tickets/${t}/actions/${a}/void`, body: { expectedVersion: 1, reason: 'Probe' } },
  { method: 'get', path: () => '/api/staff/dashboard' },
]
const LAB4_ROUTES: Route[] = [
  { method: 'get', path: (t) => `/api/tickets/${t}/actions` },
  { method: 'get', path: () => '/api/dashboard/requester' },
  ...STAFF_ACTION_ROUTES,
]

const call = (route: Route, ticket: number, action: number, cookie?: string) => {
  const req = request(app)[route.method](route.path(ticket, action))
  if (cookie) req.set('Cookie', cookie)
  return route.body ? req.send(route.body) : req
}

const label = (route: Route) => `${route.method.toUpperCase()} ${route.path(0, 0)}`

async function createUser(key: string, role: UserRole, mustChangePassword = false) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName: `Authorization ${key}`, role, passwordHash: 'unusable-fixture', mustChangePassword },
  })
  await signIn(user.id)
  return user.id
}

const snapshot = () =>
  Promise.all([
    prisma.actionTaken.findMany({ where: { ticketId }, orderBy: { id: 'asc' } }),
    prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { version: true, publicActivityAt: true } }),
  ])

beforeAll(async () => {
  requester = await createUser('requester', 'REQUESTER')
  staff = await createUser('staff', 'IT_STAFF')
  otherStaff = await createUser('other-staff', 'IT_STAFF')
  pending = await createUser('pending', 'IT_STAFF', true)

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-L4AUTH-${RUN}`,
      requesterId: requester,
      categoryId: (await prisma.category.findFirstOrThrow()).id,
      relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow()).id,
      summary: 'Lab 4 authorization fixture',
      description: 'The Requester owns this Ticket.',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      status: 'IN_PROGRESS',
      assigneeId: staff,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  })
  ticketId = ticket.id
  const action = await prisma.actionTaken.create({
    data: {
      ticketId,
      clientRequestId: randomUUID(),
      actionAt: new Date(Date.now() - 60 * 60 * 1000),
      description: 'Existing action.',
      result: 'Existing result.',
      followUpRequired: true,
      followUpNote: 'Outstanding',
      performedById: staff,
    },
  })
  actionId = action.id
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('Lab 4 authorization (BR-72, AC-18)', () => {
  it('API-64 refuses a Requester on every staff route, including the actions of their own Ticket, writing nothing', async () => {
    const before = await snapshot()

    for (const route of STAFF_ACTION_ROUTES) {
      const res = await call(route, ticketId, actionId, asUser(requester))
      expect(res.status, label(route)).toBe(403)
      expect(res.body.error.code, label(route)).toBe('FORBIDDEN')
    }
    expect(await snapshot()).toEqual(before)
  })

  it('API-65 answers 401 on every Lab 4 route without a session', async () => {
    for (const route of LAB4_ROUTES) {
      const res = await call(route, ticketId, actionId)
      expect(res.status, label(route)).toBe(401)
      expect(res.body.error.code, label(route)).toBe('UNAUTHENTICATED')
    }
  })

  it('API-66 answers 403 PASSWORD_CHANGE_REQUIRED on every Lab 4 route before the password is changed', async () => {
    for (const route of LAB4_ROUTES) {
      const res = await call(route, ticketId, actionId, asUser(pending))
      expect(res.status, label(route)).toBe(403)
      expect(res.body.error.code, label(route)).toBe('PASSWORD_CHANGE_REQUIRED')
    }
  })

  it('API-67 returns only the error envelope in every Lab 4 403', async () => {
    const responses = [
      ...(await Promise.all(STAFF_ACTION_ROUTES.map((route) => call(route, ticketId, actionId, asUser(requester))))),
      // The performer / owner / Administrator rule (BR-18), the one 403 a handler sends.
      await call(STAFF_ACTION_ROUTES[2], ticketId, actionId, asUser(otherStaff)),
      await call(STAFF_ACTION_ROUTES[4], ticketId, actionId, asUser(otherStaff)),
    ]

    for (const res of responses) {
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } })
    }
  })

  it('API-68 answers a Requester 403, not 404, on a staff action route for a Ticket that does not exist', async () => {
    for (const route of STAFF_ACTION_ROUTES) {
      const res = await call(route, MISSING_ID, MISSING_ID, asUser(requester))
      expect(res.status, label(route)).toBe(403)
    }
  })
})
