import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, TicketStatus, UserRole } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@lab4-requester-dashboard.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ACTIVE: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']

type Person = { id: number; role: UserRole }

let requesterA: Person
let requesterB: Person
let empty: Person
let staff: Person
let admin: Person
let categoryId: number
let relatedSystemId: number
let counter = 0

async function createUser(key: string, role: UserRole) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName: `Dashboard ${key}`, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
    select: { id: true, role: true },
  })
  await signIn(user.id)
  return user
}

function makeTicket(requester: Person, data: Partial<Prisma.TicketUncheckedCreateInput> = {}) {
  counter += 1
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-RDASH-${RUN}-${String(counter).padStart(3, '0')}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: `Requester dashboard fixture ${counter}`,
      description: 'Private description that a dashboard must never return.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      status: 'OPEN',
      ...data,
    },
  })
}

const dashboard = (user: Person) => request(app).get('/api/dashboard/requester').set('Cookie', asUser(user.id))
const withoutClock = ({ generatedAt: _, ...body }: Record<string, unknown>) => body

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
  requesterA = await createUser('requester-a', 'REQUESTER')
  requesterB = await createUser('requester-b', 'REQUESTER')
  empty = await createUser('empty', 'REQUESTER')
  staff = await createUser('staff', 'IT_STAFF')
  admin = await createUser('admin', 'ADMINISTRATOR')

  // Requester A: every metric non-zero, more than five Tickets so the list caps are exercised.
  const now = Date.now()
  for (const status of [...ACTIVE, 'WAITING_FOR_REQUESTER', 'CANCELLED'] as TicketStatus[]) {
    await makeTicket(requesterA, { status, publicActivityAt: new Date(now - counter * HOUR) })
  }
  await makeTicket(requesterA, { status: 'RESOLVED', resolvedAt: new Date(now - 2 * DAY) })
  await makeTicket(requesterA, { status: 'CLOSED', resolvedAt: new Date(now - 3 * DAY) })
  await makeTicket(requesterA, { status: 'CLOSED', resolvedAt: new Date(now - 30 * DAY) })
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-43 the dashboard is scoped to the caller (AC-29)', () => {
  it('is identical before and after another Requester gains three Tickets, and never names them', async () => {
    const before = await dashboard(requesterA)
    expect(before.status).toBe(200)

    const theirs = [
      await makeTicket(requesterB, { status: 'WAITING_FOR_REQUESTER' }),
      await makeTicket(requesterB, { status: 'RESOLVED', resolvedAt: new Date() }),
      await makeTicket(requesterB, { status: 'OPEN', publicActivityAt: new Date(Date.now() + HOUR) }),
    ]
    const after = await dashboard(requesterA)

    expect(withoutClock(after.body)).toEqual(withoutClock(before.body))
    const ids = [...after.body.recentlyUpdated, ...after.body.recentlyResolved].map((item: { id: number }) => item.id)
    for (const ticket of theirs) {
      expect(ids).not.toContain(ticket.id)
      expect(after.text).not.toContain(ticket.ticketNumber)
    }
  })
})

describe('API-44 counts match independent queries (BR-53 – BR-55, BR-57)', () => {
  it('equals prisma.ticket.count for each predicate', async () => {
    const res = await dashboard(requesterA)
    const requesterId = requesterA.id
    const since = new Date(new Date(res.body.generatedAt).getTime() - 7 * DAY)

    expect(res.body.metrics).toMatchObject({
      openTickets: { count: await prisma.ticket.count({ where: { requesterId, status: { in: ACTIVE } } }) },
      waitingForMe: { count: await prisma.ticket.count({ where: { requesterId, status: 'WAITING_FOR_REQUESTER' } }) },
      resolvedAwaitingClosure: { count: await prisma.ticket.count({ where: { requesterId, status: 'RESOLVED' } }) },
      recentlyResolved: {
        count: await prisma.ticket.count({ where: { requesterId, status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: since } } }),
      },
    })
    expect(res.body.metrics.openTickets.count).toBe(6)
    expect(res.body.metrics.waitingForMe.count).toBe(2)
    expect(res.body.metrics.recentlyResolved.count).toBe(2)
    expect(res.body).toMatchObject({ timeZone: 'Asia/Bangkok', windows: { recentDays: 7 } })
    expect(res.body.recentlyUpdated).toHaveLength(5)
  })
})

describe('API-45 recentlyUpdated follows public activity only (AC-34, BR-45, BR-56)', () => {
  it('a Public Comment moves its Ticket to the top; an Internal Note moves nothing', async () => {
    const before = (await dashboard(requesterA)).body.recentlyUpdated.map((item: { id: number }) => item.id)
    const [x, y] = [before[0], before[3]]

    const note = await request(app).post(`/api/staff/tickets/${x}/internal-notes`).set('Cookie', asUser(staff.id)).send({ body: 'Internal only.' })
    expect(note.status).toBe(201)
    expect((await dashboard(requesterA)).body.recentlyUpdated.map((item: { id: number }) => item.id)).toEqual(before)

    const comment = await request(app)
      .post(`/api/tickets/${y}/comments`)
      .set('Cookie', asUser(requesterA.id))
      .send({ body: 'Still broken this morning.' })
    expect(comment.status).toBe(201)

    const after = (await dashboard(requesterA)).body.recentlyUpdated.map((item: { id: number }) => item.id)
    expect(after[0]).toBe(y)
    expect(after.indexOf(x)).toBe(1)
  })
})

describe('API-46 the rolling 7-day window (AC-33, BR-57)', () => {
  it('includes now − 6 d 23 h and excludes now − 7 d 1 h', async () => {
    const own = await createUser('window', 'REQUESTER')
    const inside = await makeTicket(own, { status: 'RESOLVED', resolvedAt: new Date(Date.now() - 7 * DAY + HOUR) })
    await makeTicket(own, { status: 'CLOSED', resolvedAt: new Date(Date.now() - 7 * DAY - HOUR) })

    const res = await dashboard(own)

    expect(res.body.metrics.recentlyResolved.count).toBe(1)
    expect(res.body.recentlyResolved).toEqual([
      { id: inside.id, ticketNumber: inside.ticketNumber, summary: inside.summary, status: 'RESOLVED', at: inside.resolvedAt!.toISOString() },
    ])
  })
})

describe('API-47 an account with nothing (AC-31, BR-51)', () => {
  it('returns every count as 0 and every list as [], with every key present', async () => {
    const res = await dashboard(empty)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      generatedAt: expect.any(String),
      timeZone: 'Asia/Bangkok',
      windows: { recentDays: 7 },
      metrics: {
        waitingForMe: { count: 0, href: '/tickets?status=WAITING_FOR_REQUESTER' },
        openTickets: { count: 0, href: '/tickets?status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED' },
        resolvedAwaitingClosure: { count: 0, href: '/tickets?status=RESOLVED' },
        recentlyResolved: { count: 0, href: '/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc' },
      },
      recentlyUpdated: [],
      recentlyResolved: [],
    })
  })
})

describe('API-48 staff roles are refused (AC-36)', () => {
  it.each(['staff', 'admin'])('%s gets 403 FORBIDDEN and no metric', async (key) => {
    const res = await dashboard(key === 'staff' ? staff : admin)

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } })
  })

  it('401 without a session', async () => {
    expect((await request(app).get('/api/dashboard/requester')).status).toBe(401)
  })
})

describe('API-49 each count reconciles with the list its href opens (AC-37, FR-23)', () => {
  it('replays every href except recentlyResolved against GET /api/tickets', async () => {
    const { metrics } = (await dashboard(requesterA)).body
    for (const key of ['waitingForMe', 'openTickets', 'resolvedAwaitingClosure'] as const) {
      const { count, href } = metrics[key]
      expect(href).toMatch(/^\/tickets\?/)
      const list = await request(app).get(`/api${href}`).set('Cookie', asUser(requesterA.id))
      expect(list.status, `${key} ${list.text}`).toBe(200)
      expect(list.body.meta.totalItems, key).toBe(count)
    }
  })
})

describe('API-50 list items carry summary fields only (BR-52)', () => {
  it('has exactly id, ticketNumber, summary, status, at', async () => {
    const res = await dashboard(requesterA)
    const items = [...res.body.recentlyUpdated, ...res.body.recentlyResolved]

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) expect(Object.keys(item).sort()).toEqual(['at', 'id', 'status', 'summary', 'ticketNumber'])
    expect(res.text).not.toContain('Private description')
  })
})
