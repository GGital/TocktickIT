import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RequestedPriority, TicketStatus } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@staff-ops-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()

const STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

// Specification BR-35, transcribed so the endpoint is checked against the document.
const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

type Person = { id: number; fullName: string }

let requester: Person
let staff: Person
let staff2: Person
let admin: Person
let inactiveStaff: Person
let categoryId: number
let relatedSystemId: number
let counter = 0

async function createUser(key: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR', fullName: string, isActive = true) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName, role, isActive, passwordHash: 'unusable-fixture', mustChangePassword: false },
  })
  if (isActive) await signIn(user.id)
  return user
}

const ticketData = (values: { status?: TicketStatus; assigneeId?: number | null; flagged?: boolean; requestedPriority?: RequestedPriority }) => {
  counter += 1
  return {
    ticketNumber: `TKT-TEST-OPS-${RUN}-${String(counter).padStart(3, '0')}`,
    requesterId: requester.id,
    categoryId,
    relatedSystemId,
    summary: `Staff operations fixture ${counter}`,
    description: 'Created by the staff ticket operations API suite.',
    requestedPriority: values.requestedPriority ?? 'MEDIUM',
    itPriority: values.requestedPriority ?? 'MEDIUM',
    status: values.status ?? 'NEW',
    assigneeId: values.assigneeId ?? null,
    requesterResolvedFlaggedAt: values.flagged ? new Date() : null,
  }
}

const createTicket = (values: Parameters<typeof ticketData>[0] = {}) => prisma.ticket.create({ data: ticketData(values) })
const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } })

const as = (userId: number, req: request.Test) => req.set('Cookie', asUser(userId))
const detail = (id: number | string, userId = staff.id) => as(userId, request(app).get(`/api/staff/tickets/${id}`))
const patch = (id: number | string, action: 'assignment' | 'priority' | 'status', body: unknown, userId = staff.id) =>
  as(userId, request(app).patch(`/api/staff/tickets/${id}/${action}`)).send(body as object)

const unknownTicketId = async () => (await prisma.ticket.findFirstOrThrow({ orderBy: { id: 'desc' } })).id + 1000
const unknownUserId = async () => (await prisma.user.findFirstOrThrow({ orderBy: { id: 'desc' } })).id + 1000

const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status, res.text).toBe(status)
  expect(res.body.error).toMatchObject({ code, message: expect.any(String) })
}

beforeAll(async () => {
  requester = await createUser('requester', 'REQUESTER', `Rattana Requester ${RUN}`)
  staff = await createUser('staff', 'IT_STAFF', `Ops Alpha Staff ${RUN}`)
  staff2 = await createUser('staff-2', 'IT_STAFF', `Ops Bravo Staff ${RUN}`)
  admin = await createUser('admin', 'ADMINISTRATOR', `Ops Charlie Admin ${RUN}`)
  inactiveStaff = await createUser('inactive-staff', 'IT_STAFF', `Ops Delta Former ${RUN}`, false)
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id
})

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  // The assignee foreign key is Restrict, so Tickets go before their owners.
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

describe('API-55 IT Staff opens any Requester’s Ticket (AC-28, BR-21)', () => {
  it('returns the detail shape with both priorities, owner, requester, and the resolution flag', async () => {
    const ticket = await createTicket({ status: 'IN_PROGRESS', assigneeId: staff2.id, flagged: true, requestedPriority: 'LOW' })
    await prisma.ticket.update({ where: { id: ticket.id }, data: { itPriority: 'HIGH' } })

    for (const userId of [staff.id, admin.id]) {
      const res = await detail(ticket.id, userId)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requestedPriority: 'LOW',
        itPriority: 'HIGH',
        status: 'IN_PROGRESS',
        assignee: { id: staff2.id, fullName: staff2.fullName },
        requester: { id: requester.id, fullName: requester.fullName },
        requesterResolvedFlaggedAt: expect.any(String),
        attachments: [],
      })
      // Comments and Internal Notes are separate, separately authorized reads (api-spec §2.6).
      expect(res.body).not.toHaveProperty('comments')
      expect(res.body).not.toHaveProperty('internalNotes')
    }
  })

  it('is 404 for an unknown Ticket and 400 for a malformed id', async () => {
    expectError(await detail(await unknownTicketId()), 404, 'TICKET_NOT_FOUND')
    expectError(await detail('abc'), 400, 'INVALID_PATH_PARAMETER')
  })
})

describe('API-56 claiming an unassigned NEW Ticket (AC-36, BR-29)', () => {
  it('makes the caller the owner and moves the Ticket to OPEN in the same response', async () => {
    const ticket = await createTicket()

    const res = await patch(ticket.id, 'assignment', { assigneeId: 'me' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, assignee: { id: staff.id, fullName: staff.fullName }, status: 'OPEN' })
    expect(await row(ticket.id)).toMatchObject({ assigneeId: staff.id, status: 'OPEN' })
  })

  it('assigning a NEW Ticket to someone else also moves it to OPEN', async () => {
    const ticket = await createTicket()

    const res = await patch(ticket.id, 'assignment', { assigneeId: admin.id })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ assignee: { id: admin.id }, status: 'OPEN' })
  })

  it('claiming a Ticket owned by someone else takes it over and leaves a non-NEW status alone (BR-28)', async () => {
    const ticket = await createTicket({ status: 'WAITING_FOR_REQUESTER', assigneeId: staff2.id })

    const res = await patch(ticket.id, 'assignment', { assigneeId: 'me' }, admin.id)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ assignee: { id: admin.id }, status: 'WAITING_FOR_REQUESTER' })
  })
})

describe('API-57 reassigning an owned Ticket (AC-37, BR-28)', () => {
  it('stores the new owner', async () => {
    const ticket = await createTicket({ status: 'IN_PROGRESS', assigneeId: staff.id })

    const res = await patch(ticket.id, 'assignment', { assigneeId: staff2.id })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ assignee: { id: staff2.id, fullName: staff2.fullName }, status: 'IN_PROGRESS' })
    expect((await row(ticket.id)).assigneeId).toBe(staff2.id)
  })
})

describe('API-58 unassigning an owned Ticket (BR-28)', () => {
  it('clears the owner and leaves the status unchanged', async () => {
    const ticket = await createTicket({ status: 'IN_PROGRESS', assigneeId: staff.id })

    const res = await patch(ticket.id, 'assignment', { assigneeId: null })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ assignee: null, status: 'IN_PROGRESS' })
    expect(await row(ticket.id)).toMatchObject({ assigneeId: null, status: 'IN_PROGRESS' })
  })
})

describe('API-59 an ineligible owner (AC-38, BR-27)', () => {
  it('is 409 INVALID_ASSIGNEE for a Requester, an inactive staff user, and an unknown id, and the owner is unchanged', async () => {
    const ticket = await createTicket({ status: 'NEW', assigneeId: staff.id })
    const before = await row(ticket.id)

    for (const assigneeId of [requester.id, inactiveStaff.id, await unknownUserId()]) {
      expectError(await patch(ticket.id, 'assignment', { assigneeId }), 409, 'INVALID_ASSIGNEE')
    }

    expect(await row(ticket.id)).toEqual(before)
  })

  it('a missing Ticket is 404 before the assignee is judged', async () => {
    expectError(await patch(await unknownTicketId(), 'assignment', { assigneeId: requester.id }), 404, 'TICKET_NOT_FOUND')
  })
})

describe('API-60 a malformed assignment body (api-spec §3.11)', () => {
  it('is 400 VALIDATION_FAILED when the assigneeId key is absent — unassigning is never expressed by omission', async () => {
    const ticket = await createTicket({ status: 'OPEN', assigneeId: staff.id })

    const res = await patch(ticket.id, 'assignment', {})

    expectError(res, 400, 'VALIDATION_FAILED')
    expect(res.body.error.fields).toEqual([{ field: 'assigneeId', message: 'Choose who should own this ticket.' }])
    expect((await row(ticket.id)).assigneeId).toBe(staff.id)
  })

  it.each([[String(1)], [0], [-4], [1.5], ['you'], [true], [[2]]])('rejects assigneeId %j', async (assigneeId) => {
    const ticket = await createTicket({ status: 'OPEN', assigneeId: staff.id })
    expectError(await patch(ticket.id, 'assignment', { assigneeId }), 400, 'VALIDATION_FAILED')
    expect((await row(ticket.id)).assigneeId).toBe(staff.id)
  })

  it('checks the path before the body', async () => {
    expectError(await patch('0', 'assignment', {}), 400, 'INVALID_PATH_PARAMETER')
  })
})

describe('API-61 setting the IT Priority (AC-39, BR-31, BR-32)', () => {
  it('changes itPriority and leaves requestedPriority untouched', async () => {
    const ticket = await createTicket({ status: 'OPEN', assigneeId: staff.id, requestedPriority: 'LOW' })

    const res = await patch(ticket.id, 'priority', { itPriority: 'URGENT' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, itPriority: 'URGENT', requestedPriority: 'LOW' })
    expect(await row(ticket.id)).toMatchObject({ itPriority: 'URGENT', requestedPriority: 'LOW' })
  })

  it('is 404 for an unknown Ticket', async () => {
    expectError(await patch(await unknownTicketId(), 'priority', { itPriority: 'HIGH' }), 404, 'TICKET_NOT_FOUND')
  })
})

describe('API-62 a priority body containing requestedPriority (BR-31)', () => {
  it('is 400 VALIDATION_FAILED and neither priority changes', async () => {
    const ticket = await createTicket({ status: 'OPEN', requestedPriority: 'LOW' })
    const before = await row(ticket.id)

    const res = await patch(ticket.id, 'priority', { itPriority: 'HIGH', requestedPriority: 'URGENT' })

    expectError(res, 400, 'VALIDATION_FAILED')
    expect(res.body.error.fields.map((field: { field: string }) => field.field)).toContain('requestedPriority')
    expect(await row(ticket.id)).toEqual(before)
  })

  it.each([[{}], [{ itPriority: 'CRITICAL' }], [{ itPriority: 'high' }], [{ itPriority: null }]])('rejects %j', async (body) => {
    const ticket = await createTicket()
    const res = await patch(ticket.id, 'priority', body)
    expectError(res, 400, 'VALIDATION_FAILED')
    expect(res.body.error.fields).toEqual([{ field: 'itPriority', message: 'Choose an IT priority.' }])
  })
})

describe('API-63 OPEN → IN_PROGRESS on an assigned Ticket (AC-41, BR-35)', () => {
  it('stores and returns the new status', async () => {
    const ticket = await createTicket({ status: 'OPEN', assigneeId: staff.id })

    const res = await patch(ticket.id, 'status', { status: 'IN_PROGRESS' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: ticket.id, status: 'IN_PROGRESS' })
    expect((await row(ticket.id)).status).toBe('IN_PROGRESS')
  })
})

describe('API-64 NEW → CLOSED (AC-42, BR-36)', () => {
  it('is 409 INVALID_STATUS_TRANSITION naming both statuses, and the Ticket is unchanged', async () => {
    const ticket = await createTicket({ status: 'NEW', assigneeId: staff.id })
    const before = await row(ticket.id)

    const res = await patch(ticket.id, 'status', { status: 'CLOSED' })

    expectError(res, 409, 'INVALID_STATUS_TRANSITION')
    expect(res.body.error.message).toContain('NEW')
    expect(res.body.error.message).toContain('CLOSED')
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('API-65 setting the status a Ticket already holds (BR-36)', () => {
  it('is 409 INVALID_STATUS_TRANSITION, not a silent success', async () => {
    const ticket = await createTicket({ status: 'IN_PROGRESS', assigneeId: staff.id })
    const before = await row(ticket.id)

    expectError(await patch(ticket.id, 'status', { status: 'IN_PROGRESS' }), 409, 'INVALID_STATUS_TRANSITION')
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('API-66 the Requester-resolution flag (AC-43, BR-46)', () => {
  it('RESOLVED → REOPENED on a flagged Ticket changes the status and clears requesterResolvedFlaggedAt', async () => {
    const ticket = await createTicket({ status: 'RESOLVED', assigneeId: staff.id, flagged: true })

    const res = await patch(ticket.id, 'status', { status: 'REOPENED' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'REOPENED', requesterResolvedFlaggedAt: null })
    expect(await row(ticket.id)).toMatchObject({ status: 'REOPENED', requesterResolvedFlaggedAt: null })
  })

  it.each([
    ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'CLOSED'],
  ] as const)('%s → %s also clears the flag', async (from, to) => {
    const ticket = await createTicket({ status: from, assigneeId: staff.id, flagged: true })
    const res = await patch(ticket.id, 'status', { status: to })
    expect(res.status).toBe(200)
    expect(res.body.requesterResolvedFlaggedAt).toBeNull()
  })

  it.each([
    ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'],
    ['OPEN', 'CANCELLED'],
  ] as const)('%s → %s keeps the flag', async (from, to) => {
    const ticket = await createTicket({ status: from, assigneeId: staff.id, flagged: true })
    const res = await patch(ticket.id, 'status', { status: to })
    expect(res.status).toBe(200)
    expect(res.body.requesterResolvedFlaggedAt).toEqual(expect.any(String))
  })

  it('a refused transition leaves the flag in place', async () => {
    const ticket = await createTicket({ status: 'CANCELLED', assigneeId: staff.id, flagged: true })
    expectError(await patch(ticket.id, 'status', { status: 'REOPENED' }), 409, 'INVALID_STATUS_TRANSITION')
    expect((await row(ticket.id)).requesterResolvedFlaggedAt).not.toBeNull()
  })
})

describe('API-67 an unassigned Ticket (BR-30)', () => {
  it('NEW → IN_PROGRESS is 409 INVALID_STATUS_TRANSITION and the Ticket is unchanged', async () => {
    const ticket = await createTicket()
    const before = await row(ticket.id)

    const res = await patch(ticket.id, 'status', { status: 'IN_PROGRESS' })

    expectError(res, 409, 'INVALID_STATUS_TRANSITION')
    expect(res.body.error.message).toContain('NEW')
    expect(res.body.error.message).toContain('IN_PROGRESS')
    expect(await row(ticket.id)).toEqual(before)
  })

  it.each(['OPEN', 'CANCELLED'] as const)('NEW → %s still succeeds and leaves the Ticket unassigned', async (status) => {
    const ticket = await createTicket()
    const res = await patch(ticket.id, 'status', { status })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status, assignee: null })
  })
})

describe('status body validation (api-spec §3.13)', () => {
  it.each([[{}], [{ status: 'DONE' }], [{ status: 'open' }], [{ status: 3 }], [{ status: 'OPEN', assigneeId: 'me' }]])(
    'rejects %j with 400 VALIDATION_FAILED before looking at the Ticket',
    async (body) => {
      const ticket = await createTicket({ status: 'NEW', assigneeId: staff.id })
      expectError(await patch(ticket.id, 'status', body), 400, 'VALIDATION_FAILED')
      expect((await row(ticket.id)).status).toBe('NEW')
      expectError(await patch(await unknownTicketId(), 'status', body), 400, 'VALIDATION_FAILED')
    },
  )

  it('a known status on an unknown Ticket is 404', async () => {
    expectError(await patch(await unknownTicketId(), 'status', { status: 'OPEN' }), 404, 'TICKET_NOT_FOUND')
  })
})

describe('the status endpoint enforces every pair of the matrix (BR-35, BR-36, exit criterion)', () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const))

  it('permits exactly the documented pairs on assigned Tickets and leaves every refused Ticket unchanged', async () => {
    const data = pairs.map(([from]) => ticketData({ status: from, assigneeId: staff.id }))
    await prisma.ticket.createMany({ data })
    const tickets = await prisma.ticket.findMany({
      where: { ticketNumber: { in: data.map((ticket) => ticket.ticketNumber) } },
      select: { id: true, ticketNumber: true },
    })
    const idOf = new Map(tickets.map((ticket) => [ticket.ticketNumber, ticket.id]))

    const outcomes: string[] = []
    for (const [index, [from, to]] of pairs.entries()) {
      const id = idOf.get(data[index].ticketNumber)!
      const res = await patch(id, 'status', { status: to })
      const stored = (await row(id)).status
      const permitted = MATRIX[from].includes(to)
      const ok = permitted
        ? res.status === 200 && res.body.status === to && stored === to
        : res.status === 409 && res.body.error.code === 'INVALID_STATUS_TRANSITION' && stored === from
      if (!ok) outcomes.push(`${from} → ${to}: HTTP ${res.status}, stored ${stored}`)
    }

    expect(outcomes).toEqual([])
    expect(pairs.filter(([from, to]) => MATRIX[from].includes(to))).toHaveLength(21)
  }, 60_000)
})

describe('GET /api/staff/assignees (api-spec §3.16, BR-27)', () => {
  it('lists active IT Staff and Administrators only, by full name, as { id, fullName, role }', async () => {
    for (const userId of [staff.id, admin.id]) {
      const res = await as(userId, request(app).get('/api/staff/assignees'))

      expect(res.status).toBe(200)
      const ours = res.body.filter((option: { fullName: string }) => option.fullName.endsWith(RUN))
      expect(ours).toEqual([
        { id: staff.id, fullName: staff.fullName, role: 'IT_STAFF' },
        { id: staff2.id, fullName: staff2.fullName, role: 'IT_STAFF' },
        { id: admin.id, fullName: admin.fullName, role: 'ADMINISTRATOR' },
      ])
      for (const option of res.body) expect(Object.keys(option).sort()).toEqual(['fullName', 'id', 'role'])
      expect(res.body.map((option: { role: string }) => option.role)).not.toContain('REQUESTER')
      expect(res.body.map((option: { id: number }) => option.id)).not.toContain(inactiveStaff.id)
      expect(res.text).not.toContain(DOMAIN)
    }
  })
})
