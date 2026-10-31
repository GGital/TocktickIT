import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, TicketStatus, UserRole } from '@prisma/client'
import app from '../../src/app.js'
import { UPLOADS_ROOT } from '../../src/attachments.js'
import { prisma } from '../../src/prisma.js'
import { testHooks } from '../../src/statusTransition.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@lab4-workflow-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const HOUR = 60 * 60 * 1000
const LONG_AGO = new Date('2000-01-01T00:00:00.000Z')

const STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']

// Specification BR-33, transcribed so the endpoint is checked against the document.
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

type Person = { id: number; fullName: string; role: UserRole }
type Op = 'status' | 'assignment' | 'priority'

let requester: Person
let owner: Person
let other: Person
let inactive: Person
let categoryId: number
let relatedSystemId: number
let counter = 0

async function createUser(key: string, role: UserRole, isActive = true) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName: `Workflow ${key}`, role, isActive, passwordHash: 'unusable-fixture', mustChangePassword: false },
    select: { id: true, fullName: true, role: true },
  })
  if (isActive) await signIn(user.id)
  return user
}

type TicketValues = { status?: TicketStatus; assigneeId?: number | null; flagged?: boolean; resolvedAt?: Date | null }

const ticketData = ({ status = 'IN_PROGRESS', assigneeId = owner.id, flagged = false, resolvedAt = null }: TicketValues = {}) => {
  counter += 1
  return {
    ticketNumber: `TKT-TEST-WF-${RUN}-${String(counter).padStart(3, '0')}`,
    requesterId: requester.id,
    categoryId,
    relatedSystemId,
    summary: `Workflow fixture ${counter}`,
    description: 'Created by the Lab 4 ticket workflow API suite.',
    requestedPriority: 'MEDIUM' as const,
    itPriority: 'MEDIUM' as const,
    status,
    assigneeId,
    resolvedAt,
    requesterResolvedFlaggedAt: flagged ? new Date() : null,
    createdAt: new Date(Date.now() - 48 * HOUR),
  }
}

const makeTicket = (values?: TicketValues) => prisma.ticket.create({ data: ticketData(values) })

/** An action written straight to the database; the gate reads the table, not the API that filled it. */
const actionData = (ticketId: number, data: Partial<Prisma.ActionTakenUncheckedCreateInput> = {}) => ({
  ticketId,
  clientRequestId: randomUUID(),
  actionAt: new Date(Date.now() - HOUR),
  description: 'Fixture action.',
  result: 'Fixture result.',
  followUpRequired: false,
  performedById: owner.id,
  // The CHECK constraints pair each timestamp with its actor.
  ...(data.voidedAt ? { voidedById: owner.id } : {}),
  ...(data.followUpCompletedAt ? { followUpCompletedById: owner.id } : {}),
  ...data,
})
const makeAction = (ticketId: number, data?: Partial<Prisma.ActionTakenUncheckedCreateInput>) =>
  prisma.actionTaken.create({ data: actionData(ticketId, data) })
const outstanding = { followUpRequired: true, followUpNote: 'Call back on Monday.' }
const voided = { voidedAt: new Date(), voidReason: 'Wrong ticket.' }

const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } })
const as = (user: Person, req: request.Test) => req.set('Cookie', asUser(user.id))
const patch = (id: number, op: Op, body: object, user = owner) =>
  as(user, request(app).patch(`/api/staff/tickets/${id}/${op}`)).send(body)
const setStatus = (id: number, status: TicketStatus, expectedVersion = 1, user = owner) =>
  patch(id, 'status', { status, expectedVersion }, user)
const detail = (id: number, user = owner) => as(user, request(app).get(`/api/staff/tickets/${id}`))

const expectError = (res: request.Response, status: number, code: string) => {
  expect(res.status, res.text).toBe(status)
  expect(res.body.error).toMatchObject({ code, message: expect.any(String) })
}

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
  requester = await createUser('requester', 'REQUESTER')
  owner = await createUser('owner', 'IT_STAFF')
  other = await createUser('other', 'IT_STAFF')
  inactive = await createUser('inactive', 'IT_STAFF', false)
})

afterAll(async () => {
  const tickets = await prisma.ticket.findMany({ where: { requester: { email: { endsWith: DOMAIN } } }, select: { id: true } })
  for (const { id } of tickets) await rm(path.join(UPLOADS_ROOT, String(id)), { recursive: true, force: true })
  await prisma.ticket.deleteMany({ where: { id: { in: tickets.map((t) => t.id) } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-26 the status endpoint enforces every pair of the matrix (AC-19, BR-33)', () => {
  it('permits exactly the 21 pairs on owned Tickets with recorded work; every other pair is 409 naming both statuses', async () => {
    const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const))
    const data = pairs.map(([from]) => ticketData({ status: from, resolvedAt: from === 'RESOLVED' || from === 'CLOSED' ? new Date() : null }))
    await prisma.ticket.createMany({ data })
    const tickets = await prisma.ticket.findMany({ where: { ticketNumber: { in: data.map((t) => t.ticketNumber) } }, select: { id: true, ticketNumber: true } })
    const idOf = new Map(tickets.map((t) => [t.ticketNumber, t.id]))
    await prisma.actionTaken.createMany({ data: tickets.map((t) => actionData(t.id)) })

    const failures: string[] = []
    for (const [index, [from, to]] of pairs.entries()) {
      const id = idOf.get(data[index].ticketNumber)!
      const res = await setStatus(id, to)
      const stored = (await row(id)).status
      const ok = MATRIX[from].includes(to)
        ? res.status === 200 && res.body.status === to && stored === to
        : res.status === 409 &&
          res.body.error.code === 'INVALID_STATUS_TRANSITION' &&
          res.body.error.message.includes(from) &&
          res.body.error.message.includes(to) &&
          stored === from
      if (!ok) failures.push(`${from} → ${to}: HTTP ${res.status} ${res.body.error?.code ?? ''}, stored ${stored}`)
    }

    expect(failures).toEqual([])
    expect(pairs.filter(([from, to]) => MATRIX[from].includes(to))).toHaveLength(21)
  }, 60_000)
})

describe('API-27 the owner condition on a work-in-progress target (AC-19, BR-34)', () => {
  it('REOPENED → IN_PROGRESS on an unassigned Ticket is refused "until it has an owner"', async () => {
    const ticket = await makeTicket({ status: 'REOPENED', assigneeId: null })
    const before = await row(ticket.id)

    const res = await setStatus(ticket.id, 'IN_PROGRESS')

    expectError(res, 409, 'INVALID_STATUS_TRANSITION')
    expect(res.body.error.message).toContain('until it has an owner')
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('the resolution gate (BR-35, AC-20 – AC-23)', () => {
  const expectBlocked = async (id: number, blockers: string[], expectedVersion = 1) => {
    const before = await row(id)
    const res = await setStatus(id, 'RESOLVED', expectedVersion)
    expect(res.status, res.text).toBe(409)
    expect(res.body).toEqual({ error: { code: 'RESOLUTION_BLOCKED', message: 'This ticket cannot be resolved yet.', blockers } })
    expect(await row(id)).toEqual(before)
  }

  it('API-28 an owned Ticket with zero actions is blocked by NO_ACTIONS (AC-20)', async () => {
    await expectBlocked((await makeTicket()).id, ['NO_ACTIONS'])
  })

  it('API-29 voided actions do not count (AC-21)', async () => {
    const ticket = await makeTicket({ status: 'OPEN' })
    await makeAction(ticket.id, voided)
    await makeAction(ticket.id, { ...voided, ...outstanding })
    await expectBlocked(ticket.id, ['NO_ACTIONS'])
  })

  it('API-30 an outstanding follow-up blocks until completed, then the resolve sets resolvedAt (AC-22, BR-38)', async () => {
    const ticket = await makeTicket({ status: 'WAITING_FOR_REQUESTER' })
    const action = await makeAction(ticket.id, outstanding)
    await expectBlocked(ticket.id, ['OUTSTANDING_FOLLOW_UPS'])

    const completed = await as(owner, request(app).post(`/api/staff/tickets/${ticket.id}/actions/${action.id}/complete-follow-up`)).send({ expectedVersion: 1 })
    expect(completed.status, completed.text).toBe(200)

    const startedAt = Date.now()
    const res = await setStatus(ticket.id, 'RESOLVED', 2)
    expect(res.status, res.text).toBe(200)
    expect(res.body).toMatchObject({ status: 'RESOLVED', version: 3, resolutionBlockers: [], allowedTransitions: ['CLOSED', 'REOPENED'] })
    const stored = await row(ticket.id)
    expect(stored.resolvedAt!.getTime()).toBeGreaterThanOrEqual(startedAt - 1000)
    expect(res.body.resolvedAt).toBe(stored.resolvedAt!.toISOString())
  })

  it('API-31 lists every failure in the documented order', async () => {
    await expectBlocked((await makeTicket({ status: 'OPEN', assigneeId: null })).id, ['UNASSIGNED', 'NO_ACTIONS'])

    const ticket = await makeTicket({ status: 'OPEN', assigneeId: null })
    await makeAction(ticket.id, outstanding)
    await expectBlocked(ticket.id, ['UNASSIGNED', 'OUTSTANDING_FOLLOW_UPS'])
  })

  it('API-32 the Requester flag is advisory: a flagged Ticket failing the gate stays blocked and flagged (AC-23, BR-39)', async () => {
    const ticket = await makeTicket({ flagged: true })
    await expectBlocked(ticket.id, ['NO_ACTIONS'])
    expect((await row(ticket.id)).requesterResolvedFlaggedAt).not.toBeNull()
  })
})

describe('resolvedAt and the flag across RESOLVED, CLOSED, REOPENED (BR-38, BR-39)', () => {
  it('API-33 reopening clears resolvedAt and the flag, and work can be recorded again (AC-24)', async () => {
    const ticket = await makeTicket({ status: 'RESOLVED', resolvedAt: new Date(Date.now() - HOUR), flagged: true })
    await makeAction(ticket.id)

    const res = await setStatus(ticket.id, 'REOPENED')
    expect(res.status, res.text).toBe(200)
    expect(res.body).toMatchObject({ status: 'REOPENED', resolvedAt: null, requesterResolvedFlaggedAt: null })

    const action = await as(owner, request(app).post(`/api/staff/tickets/${ticket.id}/actions`)).send({
      clientRequestId: randomUUID(),
      actionAt: new Date(Date.now() - 60_000).toISOString(),
      description: 'Checked the fix again after the reopen.',
      result: 'Problem reproduced; replacing the cable.',
      followUpRequired: false,
    })
    expect(action.status, action.text).toBe(201)
  })

  it('API-34 RESOLVED → CLOSED keeps resolvedAt and clears the flag', async () => {
    const resolvedAt = new Date('2026-10-01T04:00:00.000Z')
    const ticket = await makeTicket({ status: 'RESOLVED', resolvedAt, flagged: true })

    const res = await setStatus(ticket.id, 'CLOSED')

    expect(res.status, res.text).toBe(200)
    expect(res.body).toMatchObject({ status: 'CLOSED', resolvedAt: resolvedAt.toISOString(), requesterResolvedFlaggedAt: null })
    expect((await row(ticket.id)).resolvedAt).toEqual(resolvedAt)
  })
})

describe('API-35 a Requester changing the status (AC-25, BR-32)', () => {
  it('is 403 FORBIDDEN and the Ticket is unchanged', async () => {
    const ticket = await makeTicket()
    await makeAction(ticket.id)
    const before = await row(ticket.id)

    expectError(await setStatus(ticket.id, 'RESOLVED', 1, requester), 403, 'FORBIDDEN')
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('optimistic concurrency on Ticket writes (BR-28, AC-26, AC-27)', () => {
  it('API-36 a status write from a stale version loses to the priority write that came first', async () => {
    const ticket = await makeTicket()
    await prisma.ticket.update({ where: { id: ticket.id }, data: { version: 5 } })

    const a = await patch(ticket.id, 'priority', { itPriority: 'URGENT', expectedVersion: 5 })
    expect(a.status, a.text).toBe(200)
    expect(a.body.version).toBe(6)

    const b = await patch(ticket.id, 'status', { status: 'WAITING_FOR_REQUESTER', expectedVersion: 5 }, other)
    expectError(b, 409, 'STALE_TICKET')
    expect(await row(ticket.id)).toMatchObject({ status: 'IN_PROGRESS', itPriority: 'URGENT', version: 6 })
  })

  it('a stale assignment and a stale priority are 409 STALE_TICKET and change nothing', async () => {
    const ticket = await makeTicket()
    await prisma.ticket.update({ where: { id: ticket.id }, data: { version: 2 } })
    const before = await row(ticket.id)

    expectError(await patch(ticket.id, 'assignment', { assigneeId: other.id, expectedVersion: 1 }), 409, 'STALE_TICKET')
    expectError(await patch(ticket.id, 'priority', { itPriority: 'LOW', expectedVersion: 1 }), 409, 'STALE_TICKET')
    expectError(await setStatus(ticket.id, 'RESOLVED', 1), 409, 'STALE_TICKET')
    expect(await row(ticket.id)).toEqual(before)
  })

  it('API-37 an action committed between the gate and the write makes the resolve 409 STALE_TICKET (AC-27)', async () => {
    const ticket = await makeTicket()
    await makeAction(ticket.id)
    let inserted = 0

    testHooks!.beforeStatusWrite = async (id) => {
      if (id !== ticket.id) return
      const res = await as(other, request(app).post(`/api/staff/tickets/${id}/actions`)).send({
        clientRequestId: randomUUID(),
        actionAt: new Date(Date.now() - 60_000).toISOString(),
        description: 'Found one more affected laptop.',
        result: 'Needs a second look.',
        followUpRequired: true,
        followUpNote: 'Check the second laptop.',
      })
      expect(res.status, res.text).toBe(201)
      inserted += 1
    }
    try {
      expectError(await setStatus(ticket.id, 'RESOLVED', 1), 409, 'STALE_TICKET')
    } finally {
      testHooks!.beforeStatusWrite = undefined
    }

    expect(inserted).toBe(1)
    expect(await row(ticket.id)).toMatchObject({ status: 'IN_PROGRESS', resolvedAt: null, version: 2 })
  })
})

describe('API-38 the staff detail reports the workflow the status endpoint enforces (AC-28, BR-40)', () => {
  const scenarios: [string, TicketValues, Partial<Prisma.ActionTakenUncheckedCreateInput>[], object][] = [
    ['no actions', { status: 'IN_PROGRESS' }, [], {
      actionSummary: { total: 0, voided: 0, outstandingFollowUps: 0 },
      allowedTransitions: ['OPEN', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
      resolutionBlockers: ['NO_ACTIONS'],
    }],
    ['only voided', { status: 'OPEN' }, [voided], {
      actionSummary: { total: 1, voided: 1, outstandingFollowUps: 0 },
      allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
      resolutionBlockers: ['NO_ACTIONS'],
    }],
    ['outstanding follow-up', { status: 'WAITING_FOR_REQUESTER' }, [{}, outstanding, { ...outstanding, ...voided }], {
      actionSummary: { total: 3, voided: 1, outstandingFollowUps: 1 },
      allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
      resolutionBlockers: ['OUTSTANDING_FOLLOW_UPS'],
    }],
    ['unassigned', { status: 'OPEN', assigneeId: null }, [], {
      allowedTransitions: ['CANCELLED'],
      resolutionBlockers: ['UNASSIGNED', 'NO_ACTIONS'],
    }],
    ['passing gate', { status: 'REOPENED' }, [{}, voided, { ...outstanding, followUpCompletedAt: new Date() }], {
      actionSummary: { total: 3, voided: 1, outstandingFollowUps: 0 },
      allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
      resolutionBlockers: [],
    }],
    ['RESOLVED current status', { status: 'RESOLVED', resolvedAt: new Date('2026-10-02T00:00:00.000Z') }, [], {
      resolvedAt: '2026-10-02T00:00:00.000Z',
      allowedTransitions: ['CLOSED', 'REOPENED'],
      resolutionBlockers: [],
    }],
  ]

  it.each(scenarios)('%s', async (_name, values, actions, expected) => {
    const ticket = await makeTicket(values)
    for (const data of actions) await makeAction(ticket.id, data)

    const res = await detail(ticket.id)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ version: 1, publicActivityAt: ticket.publicActivityAt.toISOString(), resolvedAt: null, ...expected })
  })

  it('the Requester detail and list gain only resolvedAt', async () => {
    const resolvedAt = new Date('2026-10-03T00:00:00.000Z')
    const ticket = await makeTicket({ status: 'RESOLVED', resolvedAt })
    const forbidden = ['version', 'publicActivityAt', 'actionSummary', 'allowedTransitions', 'resolutionBlockers']

    const own = await as(requester, request(app).get(`/api/tickets/${ticket.id}`))
    expect(own.status).toBe(200)
    expect(own.body.resolvedAt).toBe(resolvedAt.toISOString())
    for (const key of forbidden) expect(own.body).not.toHaveProperty(key)

    const list = await as(requester, request(app).get('/api/tickets').query({ search: ticket.ticketNumber }))
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].resolvedAt).toBe(resolvedAt.toISOString())
    for (const key of forbidden) expect(list.body.data[0]).not.toHaveProperty(key)
  })
})

describe('API-39 expectedVersion is required on all three writes (BR-78)', () => {
  const bodies: [Op, object][] = [
    ['assignment', { assigneeId: 'me' }],
    ['priority', { itPriority: 'HIGH' }],
    ['status', { status: 'WAITING_FOR_REQUESTER' }],
  ]

  it.each(bodies)('%s without it, or with a malformed one, is 400 VALIDATION_FAILED on expectedVersion', async (op, body) => {
    const ticket = await makeTicket()
    const before = await row(ticket.id)

    for (const expectedVersion of [undefined, 0, -1, 1.5, '1', null]) {
      const res = await patch(ticket.id, op, { ...body, expectedVersion })
      expectError(res, 400, 'VALIDATION_FAILED')
      expect(res.body.error.fields).toEqual([{ field: 'expectedVersion', message: 'Reload the ticket and try again.' }])
    }
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('API-40 cancelling is not gated (BR-37)', () => {
  it('cancels an OPEN Ticket with no actions and one with an outstanding follow-up', async () => {
    const empty = await makeTicket({ status: 'OPEN' })
    const pending = await makeTicket({ status: 'OPEN' })
    await makeAction(pending.id, outstanding)

    for (const ticket of [empty, pending]) {
      const res = await setStatus(ticket.id, 'CANCELLED')
      expect(res.status, res.text).toBe(200)
      expect(res.body.status).toBe('CANCELLED')
    }
  })
})

describe('API-41 claiming a NEW Ticket (BR-41)', () => {
  it('moves it to OPEN with the caller as owner and advances version exactly once', async () => {
    const ticket = await makeTicket({ status: 'NEW', assigneeId: null })

    const res = await patch(ticket.id, 'assignment', { assigneeId: 'me', expectedVersion: 1 }, other)

    expect(res.status, res.text).toBe(200)
    expect(res.body).toMatchObject({ status: 'OPEN', assignee: { id: other.id }, version: 2 })
    expect(await row(ticket.id)).toMatchObject({ status: 'OPEN', assigneeId: other.id, version: 2 })
  })
})

describe('API-42 an inactive assignee with a correct expectedVersion (Lab 3 BR-27, A-20)', () => {
  it('is 409 INVALID_ASSIGNEE; owner and version unchanged', async () => {
    const ticket = await makeTicket()
    const before = await row(ticket.id)

    expectError(await patch(ticket.id, 'assignment', { assigneeId: inactive.id, expectedVersion: 1 }), 409, 'INVALID_ASSIGNEE')
    expect(await row(ticket.id)).toEqual(before)
  })
})

describe('publicActivityAt moves only on what a Requester can see (BR-45)', () => {
  const resetActivity = (id: number) => prisma.ticket.update({ where: { id }, data: { publicActivityAt: LONG_AGO } })
  const activity = async (id: number) => (await row(id)).publicActivityAt

  it('a status change moves it; assignment, IT Priority, and an Internal Note do not', async () => {
    const ticket = await makeTicket()
    await resetActivity(ticket.id)

    expect((await patch(ticket.id, 'assignment', { assigneeId: other.id, expectedVersion: 1 })).status).toBe(200)
    expect((await patch(ticket.id, 'priority', { itPriority: 'HIGH', expectedVersion: 2 })).status).toBe(200)
    const note = await as(owner, request(app).post(`/api/staff/tickets/${ticket.id}/internal-notes`)).send({ body: 'Vendor case opened.' })
    expect(note.status).toBe(201)
    expect(await activity(ticket.id)).toEqual(LONG_AGO)

    expect((await setStatus(ticket.id, 'WAITING_FOR_REQUESTER', 3)).status).toBe(200)
    expect(await activity(ticket.id)).not.toEqual(LONG_AGO)
  })

  it('an attachment upload and its removal each move it, without advancing version (BR-29)', async () => {
    const ticket = await makeTicket()
    await resetActivity(ticket.id)
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56, 7)])

    const uploaded = await as(requester, request(app).post(`/api/tickets/${ticket.id}/attachments`)).attach('file', png, 'screen.png')
    expect(uploaded.status, uploaded.text).toBe(201)
    expect(await activity(ticket.id)).not.toEqual(LONG_AGO)

    await resetActivity(ticket.id)
    const removed = await as(requester, request(app).delete(`/api/attachments/${uploaded.body.id}`)).send({ removalReason: 'Wrong screenshot.' })
    expect(removed.status, removed.text).toBe(200)
    expect(await row(ticket.id)).toMatchObject({ version: 1 })
    expect(await activity(ticket.id)).not.toEqual(LONG_AGO)
  })
})
