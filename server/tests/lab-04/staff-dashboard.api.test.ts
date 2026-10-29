import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Prisma, TicketStatus, UserRole } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@lab4-staff-dashboard.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const HOUR = 60 * 60 * 1000
const ACTIVE: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const STATUSES: TicketStatus[] = [...ACTIVE.slice(0, 4), 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const ACTIVE_QUERY = ACTIVE.map((status) => `status=${status}`).join('&')
const outstanding = { followUpRequired: true, followUpNote: 'Call back.', followUpCompletedAt: null, voidedAt: null }

type Person = { id: number; role: UserRole }

let me: Person
let other: Person
let admin: Person
let requester: Person
let categoryId: number
let relatedSystemId: number
let counter = 0

async function createUser(key: string, role: UserRole) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName: `Staff dashboard ${key}`, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
    select: { id: true, role: true },
  })
  await signIn(user.id)
  return user
}

function makeTicket(data: Partial<Prisma.TicketUncheckedCreateInput> = {}) {
  counter += 1
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-SDASH-${RUN}-${String(counter).padStart(3, '0')}`,
      requesterId: requester.id,
      categoryId,
      relatedSystemId,
      summary: `Staff dashboard fixture ${counter}`,
      description: 'Private description that a dashboard must never return.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
      status: 'OPEN',
      ...data,
    },
  })
}

function makeAction(ticketId: number, performer: Person, data: Partial<Prisma.ActionTakenUncheckedCreateInput> = {}) {
  counter += 1
  return prisma.actionTaken.create({
    data: {
      ticketId,
      clientRequestId: randomUUID(),
      actionAt: new Date(Date.now() - HOUR),
      description: `Fixture action ${counter}`,
      result: 'Fixture result.',
      followUpRequired: false,
      performedById: performer.id,
      ...(data.voidedAt ? { voidedById: performer.id, voidReason: 'Wrong ticket.' } : {}),
      ...data,
    },
  })
}

const dashboard = (user: Person) => request(app).get('/api/staff/dashboard').set('Cookie', asUser(user.id))
const queue = (user: Person, query: string) => request(app).get(`/api/staff/tickets?${query}`).set('Cookie', asUser(user.id))
const replay = (user: Person, href: string) => {
  expect(href).toMatch(/^\/staff\/tickets\?/)
  return request(app).get(`/api${href}`).set('Cookie', asUser(user.id))
}

const outstandingFor = (performedById?: number): Prisma.TicketWhereInput => ({
  status: { not: 'CANCELLED' },
  actions: { some: { ...outstanding, followUpNote: undefined, ...(performedById ? { performedById } : {}) } },
})

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
  me = await createUser('me', 'IT_STAFF')
  other = await createUser('other', 'IT_STAFF')
  admin = await createUser('admin', 'ADMINISTRATOR')
  requester = await createUser('requester', 'REQUESTER')

  // Every metric has at least one Ticket of this suite behind it.
  await makeTicket({ status: 'NEW' })
  await makeTicket({ status: 'IN_PROGRESS', assigneeId: me.id, itPriority: 'URGENT' })
  await makeTicket({ status: 'WAITING_FOR_REQUESTER', assigneeId: other.id, requesterResolvedFlaggedAt: new Date() })
  await makeTicket({ status: 'CANCELLED', requesterResolvedFlaggedAt: new Date() })
  const followed = await makeTicket({ status: 'OPEN', assigneeId: other.id })
  await makeAction(followed.id, me, outstanding)
})

afterAll(async () => {
  vi.useRealTimers()
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-51 every metric equals an independent count (AC-30)', () => {
  it('matches prisma.ticket.count for all six', async () => {
    const res = await dashboard(me)
    expect(res.status).toBe(200)
    const todayStartsAt = new Date(res.body.windows.todayStartsAt)
    const generatedAt = new Date(res.body.generatedAt)

    const expected = {
      unassigned: await prisma.ticket.count({ where: { status: { in: ACTIVE }, assigneeId: null } }),
      myOpen: await prisma.ticket.count({ where: { status: { in: ACTIVE }, assigneeId: me.id } }),
      urgentActive: await prisma.ticket.count({ where: { status: { in: ACTIVE }, itPriority: 'URGENT' } }),
      requesterFlagged: await prisma.ticket.count({ where: { status: { in: ACTIVE }, requesterResolvedFlaggedAt: { not: null } } }),
      myOutstandingFollowUps: await prisma.ticket.count({ where: outstandingFor(me.id) }),
      newToday: await prisma.ticket.count({ where: { createdAt: { gte: todayStartsAt, lte: generatedAt } } }),
    }
    for (const [key, count] of Object.entries(expected)) expect(res.body.metrics[key].count, key).toBe(count)
    expect(res.body.metrics.myOpen.count).toBe(1)
    expect(res.body.metrics.myOutstandingFollowUps.count).toBe(1)
    expect(res.body.timeZone).toBe('Asia/Bangkok')
  })
})

describe('API-52 each filtered metric reconciles with the Queue its href opens (AC-30, BR-71)', () => {
  it('replays every href except newToday against GET /api/staff/tickets', async () => {
    const { metrics } = (await dashboard(me)).body

    expect(metrics.unassigned.href).toBe(`/staff/tickets?assignee=unassigned&${ACTIVE_QUERY}`)
    expect(metrics.myOpen.href).toBe(`/staff/tickets?assignee=me&${ACTIVE_QUERY}`)
    expect(metrics.urgentActive.href).toBe(`/staff/tickets?itPriority=URGENT&${ACTIVE_QUERY}`)
    expect(metrics.myOutstandingFollowUps.href).toBe('/staff/tickets?followUp=mine')
    expect(metrics.newToday.href).toBe('/staff/tickets?sortBy=createdAt&sortOrder=desc')

    for (const key of ['unassigned', 'myOpen', 'urgentActive', 'requesterFlagged', 'myOutstandingFollowUps']) {
      const list = await replay(me, metrics[key].href)
      expect(list.status, `${key} ${list.text}`).toBe(200)
      expect(list.body.meta.totalItems, key).toBe(metrics[key].count)
    }
  })
})

describe('API-53 byStatus (BR-64, BR-71)', () => {
  it('has all 8 keys, sums to the Ticket total, and each equals its ?status= list', async () => {
    const { byStatus } = (await dashboard(me)).body

    expect(Object.keys(byStatus)).toEqual(STATUSES)
    const sum = STATUSES.reduce((total, status) => total + byStatus[status].count, 0)
    expect(sum).toBe(await prisma.ticket.count())
    for (const status of STATUSES) {
      expect(byStatus[status].href).toBe(`/staff/tickets?status=${status}`)
      expect((await replay(me, byStatus[status].href)).body.meta.totalItems, status).toBe(byStatus[status].count)
    }
  })
})

describe('API-54 byItPriority counts active Tickets only (BR-65)', () => {
  it('has all 4 keys and ignores a CLOSED URGENT Ticket', async () => {
    const before = (await dashboard(me)).body.byItPriority
    await makeTicket({ status: 'CLOSED', itPriority: 'URGENT', resolvedAt: new Date() })
    const { byItPriority } = (await dashboard(me)).body

    expect(Object.keys(byItPriority)).toEqual(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])
    expect(byItPriority).toEqual(before)
    for (const priority of PRIORITIES) {
      expect(byItPriority[priority].count).toBe(await prisma.ticket.count({ where: { status: { in: ACTIVE }, itPriority: priority } }))
      expect(byItPriority[priority].href).toBe(`/staff/tickets?itPriority=${priority}&${ACTIVE_QUERY}`)
      expect((await replay(me, byItPriority[priority].href)).body.meta.totalItems, priority).toBe(byItPriority[priority].count)
    }
  })
})

describe('API-55 newToday starts at 00:00 Bangkok (AC-32, BR-63)', () => {
  it('counts a Ticket from 00:10 today but not one from 23:30 yesterday', async () => {
    // A clock far from real data, so only this test's Tickets fall in "today".
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2099-01-15T05:00:00.000Z'))
    try {
      await makeTicket({ createdAt: new Date('2099-01-14T16:30:00.000Z') }) // 23:30 on 14 Jan in Bangkok
      await makeTicket({ createdAt: new Date('2099-01-14T17:10:00.000Z') }) // 00:10 on 15 Jan in Bangkok
      await signIn(me.id)

      const res = await dashboard(me)

      expect(res.status).toBe(200)
      expect(res.body.generatedAt).toBe('2099-01-15T05:00:00.000Z')
      expect(res.body.windows.todayStartsAt).toBe('2099-01-14T17:00:00.000Z')
      expect(res.body.metrics.newToday.count).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('API-56 myOutstandingFollowUps counts Tickets, not actions (BR-62, AC-30)', () => {
  it('is 2 for two follow-ups on one Ticket, one on another, and one on a cancelled Ticket', async () => {
    const follower = await createUser('follower', 'IT_STAFF')
    const first = await makeTicket({ status: 'IN_PROGRESS', assigneeId: other.id })
    const second = await makeTicket({ status: 'REOPENED', assigneeId: follower.id })
    const cancelled = await makeTicket({ status: 'CANCELLED' })
    await makeAction(first.id, follower, outstanding)
    await makeAction(first.id, follower, outstanding)
    await makeAction(second.id, follower, outstanding)
    await makeAction(cancelled.id, follower, outstanding)

    const res = await dashboard(follower)
    expect(res.body.metrics.myOutstandingFollowUps.count).toBe(2)

    const list = await replay(follower, res.body.metrics.myOutstandingFollowUps.href)
    expect(list.body.meta.totalItems).toBe(2)
    const rows = new Map(list.body.data.map((row: { id: number; outstandingFollowUps: number }) => [row.id, row.outstandingFollowUps]))
    expect(rows).toEqual(new Map([[first.id, 2], [second.id, 1]]))
  })
})

describe('API-57 an IT Staff account with nothing of its own (AC-31, BR-51)', () => {
  it('returns 0 for its own metrics, [] for its actions, and every key', async () => {
    const quiet = await createUser('quiet', 'IT_STAFF')
    const res = await dashboard(quiet)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['byItPriority', 'byStatus', 'generatedAt', 'metrics', 'myRecentActions', 'recentlyUpdated', 'timeZone', 'windows'])
    expect(Object.keys(res.body.metrics).sort()).toEqual(['myOpen', 'myOutstandingFollowUps', 'newToday', 'requesterFlagged', 'unassigned', 'urgentActive'])
    expect(res.body.metrics.myOpen.count).toBe(0)
    expect(res.body.metrics.myOutstandingFollowUps.count).toBe(0)
    expect(res.body.myRecentActions).toEqual([])
    for (const metric of [...Object.values(res.body.metrics), ...Object.values(res.body.byStatus), ...Object.values(res.body.byItPriority)]) {
      expect(Number.isInteger((metric as { count: number }).count)).toBe(true)
    }
  })
})

describe('the administration block (AC-35, BR-68 – BR-70)', () => {
  it('API-58 is absent for IT Staff', async () => {
    expect((await dashboard(me)).body).not.toHaveProperty('administration')
  })

  it('API-59 is present for an Administrator, with counts matching Prisma', async () => {
    const res = await dashboard(admin)
    const count = (where: Prisma.UserWhereInput) => prisma.user.count({ where })

    expect(res.body.administration).toEqual({
      users: {
        activeByRole: {
          REQUESTER: { count: await count({ isActive: true, role: 'REQUESTER' }), href: '/admin/users?role=REQUESTER' },
          IT_STAFF: { count: await count({ isActive: true, role: 'IT_STAFF' }), href: '/admin/users?role=IT_STAFF' },
          ADMINISTRATOR: { count: await count({ isActive: true, role: 'ADMINISTRATOR' }), href: '/admin/users?role=ADMINISTRATOR' },
        },
        inactive: { count: await count({ isActive: false }), href: '/admin/users' },
        mustChangePassword: { count: await count({ isActive: true, mustChangePassword: true }), href: '/admin/users' },
      },
    })
  })
})

describe('API-60 a Requester is refused (AC-36)', () => {
  it('gets 403 FORBIDDEN and no metric', async () => {
    const res = await dashboard(requester)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } })
  })
})

describe('API-61 voided actions are excluded (BR-22, BR-67)', () => {
  it('a voided outstanding follow-up is not counted, and a voided latest action is not listed', async () => {
    const voider = await createUser('voider', 'IT_STAFF')
    const ticket = await makeTicket({ status: 'IN_PROGRESS', assigneeId: voider.id })
    const live = await makeAction(ticket.id, voider, { description: 'd'.repeat(100), createdAt: new Date(Date.now() - HOUR) })
    await makeAction(ticket.id, voider, { ...outstanding, voidedAt: new Date(), createdAt: new Date() })

    const res = await dashboard(voider)

    expect(res.body.metrics.myOutstandingFollowUps.count).toBe(0)
    expect(res.body.myRecentActions).toEqual([
      {
        id: live.id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        actionAt: live.actionAt.toISOString(),
        description: `${'d'.repeat(79)}…`,
        followUpOutstanding: false,
        createdAt: live.createdAt.toISOString(),
      },
    ])
  })
})

describe('API-62 follow-ups on a cancelled Ticket count nowhere (BR-50)', () => {
  it('is excluded from ?followUp=outstanding', async () => {
    const cancelled = await makeTicket({ status: 'CANCELLED' })
    const open = await makeTicket({ status: 'OPEN' })
    await makeAction(cancelled.id, other, outstanding)
    await makeAction(open.id, other, outstanding)

    expect((await queue(me, `followUp=outstanding&search=${cancelled.ticketNumber}`)).body.meta.totalItems).toBe(0)
    expect((await queue(me, `followUp=outstanding&search=${open.ticketNumber}`)).body.meta.totalItems).toBe(1)
    expect((await queue(me, 'followUp=outstanding')).body.meta.totalItems).toBe(await prisma.ticket.count({ where: outstandingFor() }))
  })
})

describe('API-63 an unknown followUp value (Lab 3 BR-63, FR-23)', () => {
  it('is 400 INVALID_QUERY_PARAMETER naming followUp', async () => {
    const res = await queue(me, 'followUp=all')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_QUERY_PARAMETER')
    expect(res.body.error.message).toContain('followUp')
  })
})

describe('the lists carry summary fields only (BR-52, BR-66)', () => {
  it('recentlyUpdated is the 8 most recently updated Tickets, summary fields only', async () => {
    const res = await dashboard(me)
    const top = await prisma.ticket.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 8, select: { id: true } })

    expect(res.body.recentlyUpdated.map((item: { id: number }) => item.id)).toEqual(top.map((t) => t.id))
    for (const item of res.body.recentlyUpdated) {
      expect(Object.keys(item).sort()).toEqual(['at', 'id', 'itPriority', 'status', 'summary', 'ticketNumber'])
    }
    expect(res.text).not.toContain('Private description')
  })
})
