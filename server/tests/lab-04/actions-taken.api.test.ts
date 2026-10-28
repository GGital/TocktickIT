import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma, TicketStatus, UserRole } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@actions-taken-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
const HOUR = 60 * 60 * 1000
const LONG_AGO = new Date('2000-01-01T00:00:00.000Z')

type Person = { id: number; fullName: string; role: UserRole }

let requesterA: Person
let requesterB: Person
let owner: Person
let other: Person
let third: Person
let admin: Person
let categoryId: number
let relatedSystemId: number
let ticketId: number
let staffId: number
let counter = 0

async function createUser(key: string, role: UserRole) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName: `Actions ${key}`, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
    select: { id: true, fullName: true, role: true },
  })
  await signIn(user.id)
  return user
}

/** A Ticket created two days ago, so any recent actionAt is valid (BR-06). */
async function makeTicket(status: TicketStatus = 'IN_PROGRESS', assigneeId: number | null = owner.id, requesterId = requesterA.id) {
  counter += 1
  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-ACT-${RUN}-${String(counter).padStart(3, '0')}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Actions fixture ${counter}`,
      description: 'Holds Actions Taken under test.',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      status,
      assigneeId,
      createdAt: new Date(Date.now() - 48 * HOUR),
    },
  })
}

/** An action written straight to the database, for states the API path is not the subject of. */
async function makeAction(ticket: number, data: Partial<Prisma.ActionTakenUncheckedCreateInput> = {}) {
  counter += 1
  return prisma.actionTaken.create({
    data: {
      ticketId: ticket,
      clientRequestId: randomUUID(),
      actionAt: new Date(Date.now() - HOUR),
      description: `Fixture action ${counter}`,
      result: 'Fixture result',
      followUpRequired: false,
      performedById: owner.id,
      ...data,
    },
  })
}

const createBody = (overrides: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  actionAt: new Date(Date.now() - HOUR).toISOString(),
  description: 'Replaced the VPN client profile and cleared cached credentials.',
  result: 'Connection stable for 30 minutes in testing.',
  followUpRequired: false,
  ...overrides,
})

const as = (user: Person) => (req: request.Test) => req.set('Cookie', asUser(user.id))
const base = (ticket: number) => `/api/staff/tickets/${ticket}/actions`
const create = (user: Person, ticket: number, body: object) => as(user)(request(app).post(base(ticket)).send(body))
const edit = (user: Person, ticket: number, action: number, body: object) =>
  as(user)(request(app).patch(`${base(ticket)}/${action}`).send(body))
const complete = (user: Person, ticket: number, action: number, expectedVersion: number) =>
  as(user)(request(app).post(`${base(ticket)}/${action}/complete-follow-up`).send({ expectedVersion }))
const voidAction = (user: Person, ticket: number, action: number, expectedVersion: number, reason = 'Recorded on the wrong ticket.') =>
  as(user)(request(app).post(`${base(ticket)}/${action}/void`).send({ expectedVersion, reason }))
const staffList = (user: Person, ticket: number) => as(user)(request(app).get(base(ticket)))
const requesterList = (user: Person, ticket: number) => as(user)(request(app).get(`/api/tickets/${ticket}/actions`))

const actionCount = (ticket: number) => prisma.actionTaken.count({ where: { ticketId: ticket } })
const ticketState = (ticket: number) =>
  prisma.ticket.findUniqueOrThrow({ where: { id: ticket }, select: { version: true, publicActivityAt: true, assigneeId: true, updatedAt: true } })

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow()).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow()).id
  requesterA = await createUser('requester-a', 'REQUESTER')
  requesterB = await createUser('requester-b', 'REQUESTER')
  owner = await createUser('owner', 'IT_STAFF')
  other = await createUser('other', 'IT_STAFF')
  third = await createUser('third', 'IT_STAFF')
  admin = await createUser('admin', 'ADMINISTRATOR')
  staffId = owner.id
  ticketId = (await makeTicket()).id
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('creating an Action Taken (api-spec §3.3)', () => {
  it('API-01 saves a valid action under the Ticket with the session user as performer (AC-01)', async () => {
    const ticket = await makeTicket()
    await prisma.ticket.update({ where: { id: ticket.id }, data: { publicActivityAt: LONG_AGO } })
    const before = await ticketState(ticket.id)
    const body = createBody({ followUpRequired: true, followUpNote: 'Confirm after Monday.', attachmentNotes: 'See vpn-log.txt' })

    const res = await create(owner, ticket.id, body)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId: ticket.id,
      description: body.description,
      result: body.result,
      followUpRequired: true,
      followUpNote: 'Confirm after Monday.',
      followUpOutstanding: true,
      followUpCompletedAt: null,
      followUpCompletedBy: null,
      attachmentNotes: 'See vpn-log.txt',
      performedBy: { id: owner.id, fullName: owner.fullName, role: 'IT_STAFF' },
      lastEditedBy: null,
      voided: false,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      version: 1,
      canEdit: true,
    })
    expect(new Date(res.body.actionAt)).toEqual(new Date(body.actionAt))
    expect(res.body).not.toHaveProperty('clientRequestId')

    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored).toMatchObject({ ticketId: ticket.id, performedById: owner.id, version: 1, clientRequestId: body.clientRequestId })
    const after = await ticketState(ticket.id)
    expect(after.version).toBe(before.version + 1)
    expect(after.publicActivityAt.getTime()).toBeGreaterThan(LONG_AGO.getTime())
  })

  it('API-02 records a non-owner as performer and leaves the Ticket Owner unchanged (AC-05, BR-02)', async () => {
    const ticket = await makeTicket()

    const res = await create(other, ticket.id, createBody())

    expect(res.status).toBe(201)
    expect(res.body.performedBy.id).toBe(other.id)
    expect((await ticketState(ticket.id)).assigneeId).toBe(owner.id)
  })

  it('API-03 rejects client-supplied performer, timestamps, and Ticket id, naming each (AC-02, BR-03)', async () => {
    const ticket = await makeTicket()

    const res = await create(owner, ticket.id, createBody({ performedById: other.id, createdAt: '2001-01-01T00:00:00Z', ticketId: 1 }))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.fields.map((f: { field: string }) => f.field)).toEqual(
      expect.arrayContaining(['performedById', 'createdAt', 'ticketId']),
    )
    expect(await actionCount(ticket.id)).toBe(0)
  })

  it('API-04 enforces the follow-up note pairing both ways (AC-03)', async () => {
    const ticket = await makeTicket()

    for (const body of [createBody({ followUpRequired: true }), createBody({ followUpRequired: false, followUpNote: 'Lost text' })]) {
      const res = await create(owner, ticket.id, body)
      expect(res.status).toBe(400)
      expect(res.body.error.fields.map((f: { field: string }) => f.field)).toEqual(['followUpNote'])
    }
    expect(await actionCount(ticket.id)).toBe(0)
  })

  it('API-05 reports every broken bound in one response (AC-04, BR-13)', async () => {
    const ticket = await makeTicket()

    const res = await create(
      owner,
      ticket.id,
      createBody({
        description: '   ',
        result: 'r'.repeat(1001),
        attachmentNotes: 'a'.repeat(501),
        actionAt: new Date(Date.now() + HOUR).toISOString(),
      }),
    )

    expect(res.status).toBe(400)
    expect(res.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual(
      ['actionAt', 'attachmentNotes', 'description', 'result'],
    )
  })

  it('rejects an actionAt before the Ticket was created, once the Ticket is known (BR-06)', async () => {
    const ticket = await makeTicket()

    const res = await create(owner, ticket.id, createBody({ actionAt: new Date(ticket.createdAt.getTime() - HOUR).toISOString() }))

    expect(res.status).toBe(400)
    expect(res.body.error.fields).toEqual([
      { field: 'actionAt', message: 'The action time cannot be before the ticket was created.' },
    ])
  })

  it('API-06 refuses a NEW Ticket: claim or assign it first (AC-06)', async () => {
    const ticket = await makeTicket('NEW', null)

    const res = await create(owner, ticket.id, createBody())

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TICKET_NOT_ACTIONABLE')
    expect(res.body.error.message).toContain('Claim or assign this ticket first')
    expect(await actionCount(ticket.id)).toBe(0)
  })

  it('API-07 refuses an unassigned OPEN Ticket (AC-06)', async () => {
    const ticket = await makeTicket('OPEN', null)

    const res = await create(owner, ticket.id, createBody())

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TICKET_NOT_ACTIONABLE')
    expect(res.body.error.message).toContain('Claim or assign this ticket first')
  })

  it('answers 404 for a Ticket that does not exist', async () => {
    const res = await create(owner, 2_000_000_000, createBody())

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('TICKET_NOT_FOUND')
  })

  it('answers 400 INVALID_PATH_PARAMETER for a malformed id', async () => {
    expect((await create(owner, 'abc' as unknown as number, createBody())).body.error.code).toBe('INVALID_PATH_PARAMETER')
    expect((await edit(owner, ticketId, 'x' as unknown as number, { expectedVersion: 1, result: 'x' })).body.error.code).toBe(
      'INVALID_PATH_PARAMETER',
    )
  })
})

describe('API-08 every write refused on RESOLVED, CLOSED, and CANCELLED Tickets (AC-06, BR-14)', () => {
  for (const status of ['RESOLVED', 'CLOSED', 'CANCELLED'] as const) {
    it(`refuses create, edit, complete, and void on ${status}`, async () => {
      const ticket = await makeTicket(status, status === 'CANCELLED' ? null : owner.id)
      const action = await makeAction(ticket.id, { followUpRequired: true, followUpNote: 'Outstanding' })
      const before = await ticketState(ticket.id)

      const responses = [
        await create(owner, ticket.id, createBody()),
        await edit(owner, ticket.id, action.id, { expectedVersion: 1, result: 'Changed' }),
        await complete(owner, ticket.id, action.id, 1),
        await voidAction(admin, ticket.id, action.id, 1),
      ]

      for (const res of responses) {
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('TICKET_NOT_ACTIONABLE')
        if (status !== 'CANCELLED') expect(res.body.error.message).toContain('Reopen this ticket to record more work')
      }
      expect(await prisma.actionTaken.findMany({ where: { ticketId: ticket.id } })).toEqual([action])
      expect((await ticketState(ticket.id)).version).toBe(before.version)
    })
  }
})

describe('reading and idempotency (BR-23, BR-24)', () => {
  it('API-09 orders by actionAt then id, identically on every read (AC-07)', async () => {
    const ticket = await makeTicket()
    const shared = new Date(Date.now() - 3 * HOUR)
    for (const hoursAgo of [1, 5, 3, 2]) {
      await makeAction(ticket.id, { actionAt: hoursAgo === 3 ? shared : new Date(Date.now() - hoursAgo * HOUR) })
    }
    await makeAction(ticket.id, { actionAt: shared })

    const first = await staffList(owner, ticket.id)
    const second = await staffList(owner, ticket.id)

    expect(first.status).toBe(200)
    expect(second.body).toEqual(first.body)
    const keys = first.body.map((a: { actionAt: string; id: number }) => [new Date(a.actionAt).getTime(), a.id])
    expect(keys).toEqual([...keys].sort((x, y) => x[0] - y[0] || x[1] - y[1]))
    expect(keys).toHaveLength(5)
  })

  it('API-10 answers a sequential replay 200 with the original action and stores one row (AC-08)', async () => {
    const ticket = await makeTicket()
    const body = createBody()

    const first = await create(owner, ticket.id, body)
    const second = await create(owner, ticket.id, body)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.id).toBe(first.body.id)
    expect(await actionCount(ticket.id)).toBe(1)
  })

  it('API-11 stores exactly one row for two concurrent identical creates (AC-08)', async () => {
    const ticket = await makeTicket()
    const body = createBody()

    const responses = await Promise.all([create(owner, ticket.id, body), create(owner, ticket.id, body)])

    expect(responses.map((res) => res.status).sort()).toEqual([200, 201])
    expect(responses[0].body.id).toBe(responses[1].body.id)
    expect(await actionCount(ticket.id)).toBe(1)
  })

  it('API-12 refuses a clientRequestId replayed by another user (BR-24)', async () => {
    const ticket = await makeTicket()
    const body = createBody()
    expect((await create(owner, ticket.id, body)).status).toBe(201)

    const res = await create(other, ticket.id, body)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_SUBMISSION')
    expect(await actionCount(ticket.id)).toBe(1)
  })
})

describe('editing (api-spec §3.4, BR-17 – BR-19, BR-25)', () => {
  it('API-13 lets the performer, the Ticket Owner, and an Administrator edit in turn (AC-09)', async () => {
    const ticket = await makeTicket()
    const created = await create(other, ticket.id, createBody())
    const original = await prisma.actionTaken.findUniqueOrThrow({ where: { id: created.body.id } })

    const editors = [other, owner, admin]
    for (const [index, editor] of editors.entries()) {
      const res = await edit(editor, ticket.id, original.id, { expectedVersion: index + 1, result: `Edited by ${editor.fullName}` })
      expect(res.status).toBe(200)
      expect(res.body.version).toBe(index + 2)
      expect(res.body.lastEditedBy).toEqual({ id: editor.id, fullName: editor.fullName, role: editor.role })
      expect(res.body.performedBy.id).toBe(other.id)
    }

    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: original.id } })
    expect(stored).toMatchObject({ version: 4, performedById: other.id, lastEditedById: admin.id, createdAt: original.createdAt })
  })

  it('API-14 forbids edit by staff who is neither performer nor owner (AC-10, BR-18)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { performedById: other.id })

    const res = await edit(third, ticket.id, action.id, { expectedVersion: 1, result: 'Not mine' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } })
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).toEqual(action)
  })

  it('API-15 forbids void by the same staff member (AC-10)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { performedById: other.id })

    const res = await voidAction(third, ticket.id, action.id, 1)

    expect(res.status).toBe(403)
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).voidedAt).toBeNull()
  })

  it('API-16 answers the second of two editors from version 3 with STALE_ACTION (AC-11, BR-25)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { version: 3 })

    const first = await edit(owner, ticket.id, action.id, { expectedVersion: 3, result: 'First editor' })
    const second = await edit(admin, ticket.id, action.id, { expectedVersion: 3, result: 'Second editor' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('STALE_ACTION')
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject({ result: 'First editor', version: 4 })
  })

  it('validates the follow-up pairing on the resulting action', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { followUpRequired: true, followUpNote: 'Needed' })

    const dropFlag = await edit(owner, ticket.id, action.id, { expectedVersion: 1, followUpRequired: false })
    expect(dropFlag.status).toBe(400)
    expect(dropFlag.body.error.fields.map((f: { field: string }) => f.field)).toEqual(['followUpNote'])

    const both = await edit(owner, ticket.id, action.id, { expectedVersion: 1, followUpRequired: false, followUpNote: null })
    expect(both.status).toBe(200)
    expect(both.body).toMatchObject({ followUpRequired: false, followUpNote: null, followUpOutstanding: false })
  })

  it('refuses an edit with a forbidden key or no editable field', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id)

    for (const body of [{ expectedVersion: 1, performedById: other.id }, { expectedVersion: 1 }, { result: 'No version' }]) {
      const res = await edit(owner, ticket.id, action.id, body)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
    }
    expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).version).toBe(1)
  })

  it('API-23 refuses an action addressed through a Ticket it does not belong to (BR-01)', async () => {
    const home = await makeTicket()
    const elsewhere = await makeTicket()
    const action = await makeAction(home.id)

    const res = await edit(admin, elsewhere.id, action.id, { expectedVersion: 1, result: 'Moved?' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ACTION_NOT_FOUND')
    expect(await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } })).toEqual(action)
  })
})

describe('follow-up completion and void (BR-16, BR-17, BR-20 – BR-22)', () => {
  it('API-17 lets any staff member complete an outstanding follow-up once (AC-12)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { followUpRequired: true, followUpNote: 'Call back' })

    const res = await complete(third, ticket.id, action.id, 1)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      followUpOutstanding: false,
      followUpCompletedBy: { id: third.id, fullName: third.fullName, role: 'IT_STAFF' },
      version: 2,
    })
    expect(res.body.followUpCompletedAt).not.toBeNull()

    const again = await complete(third, ticket.id, action.id, 2)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('FOLLOW_UP_NOT_OUTSTANDING')
  })

  it('refuses to complete a follow-up that was never required', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id)

    expect((await complete(owner, ticket.id, action.id, 1)).body.error.code).toBe('FOLLOW_UP_NOT_OUTSTANDING')
  })

  it('API-18 freezes the follow-up fields once completed; other fields stay editable (AC-13)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, {
      followUpRequired: true,
      followUpNote: 'Call back',
      followUpCompletedAt: new Date(),
      followUpCompletedById: owner.id,
    })

    const note = await edit(owner, ticket.id, action.id, { expectedVersion: 1, followUpNote: 'Rewritten' })
    expect(note.status).toBe(409)
    expect(note.body.error.code).toBe('FOLLOW_UP_NOT_OUTSTANDING')

    const result = await edit(owner, ticket.id, action.id, { expectedVersion: 1, result: 'Still fine a week later' })
    expect(result.status).toBe(200)
    expect(result.body.result).toBe('Still fine a week later')
  })

  it('API-19 voids with a reason: kept for staff, hidden from the Requester, closed to further writes (AC-14)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id, { followUpRequired: true, followUpNote: 'Outstanding' })
    const kept = await makeAction(ticket.id)

    const res = await voidAction(owner, ticket.id, action.id, 1, 'Recorded on the wrong ticket; see TKT-2026-000044.')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      voided: true,
      voidReason: 'Recorded on the wrong ticket; see TKT-2026-000044.',
      voidedBy: { id: owner.id, fullName: owner.fullName, role: 'IT_STAFF' },
      followUpOutstanding: false,
      canEdit: false,
      version: 2,
    })

    const staff = await staffList(owner, ticket.id)
    expect(staff.body.find((a: { id: number }) => a.id === action.id)).toMatchObject({ voided: true, voidReason: expect.any(String) })
    const requester = await requesterList(requesterA, ticket.id)
    expect(requester.body.map((a: { id: number }) => a.id)).toEqual([kept.id])

    for (const again of [
      await edit(owner, ticket.id, action.id, { expectedVersion: 2, result: 'x' }),
      await complete(owner, ticket.id, action.id, 2),
      await voidAction(owner, ticket.id, action.id, 2),
    ]) {
      expect(again.status).toBe(409)
      expect(again.body.error.code).toBe('ACTION_ALREADY_VOIDED')
    }
  })

  it('requires a void reason of 1 – 500 characters', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id)

    for (const reason of ['   ', 'r'.repeat(501)]) {
      const res = await voidAction(owner, ticket.id, action.id, 1, reason)
      expect(res.status).toBe(400)
      expect(res.body.error.fields).toEqual([
        { field: 'reason', message: 'Explain why this action is being voided (up to 500 characters).' },
      ])
    }
  })

  it('API-20 has no DELETE route on any action path (AC-15, BR-21)', async () => {
    const ticket = await makeTicket()
    const action = await makeAction(ticket.id)

    for (const path of [
      `${base(ticket.id)}/${action.id}`,
      base(ticket.id),
      `/api/tickets/${ticket.id}/actions`,
      `/api/tickets/${ticket.id}/actions/${action.id}`,
    ]) {
      expect((await as(admin)(request(app).delete(path))).status).toBe(404)
    }
    expect(await actionCount(ticket.id)).toBe(1)
  })
})

describe('Requester visibility (BR-42, BR-43)', () => {
  it('API-21 returns the Requester projection exactly (AC-16)', async () => {
    const ticket = await makeTicket()
    await makeAction(ticket.id, { followUpRequired: true, followUpNote: 'Check Monday', attachmentNotes: 'log.txt', lastEditedById: owner.id })
    await makeAction(ticket.id, { voidedAt: new Date(), voidedById: owner.id, voidReason: 'Wrong' })

    const res = await requesterList(requesterA, ticket.id)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(Object.keys(res.body[0]).sort()).toEqual(
      [
        'actionAt',
        'attachmentNotes',
        'createdAt',
        'description',
        'edited',
        'followUpCompleted',
        'followUpNote',
        'followUpRequired',
        'id',
        'performedBy',
        'result',
        'updatedAt',
      ].sort(),
    )
    expect(res.body[0]).toMatchObject({
      followUpRequired: true,
      followUpNote: 'Check Monday',
      followUpCompleted: false,
      attachmentNotes: 'log.txt',
      edited: true,
      performedBy: { fullName: owner.fullName, role: 'IT_STAFF' },
    })
    expect(Object.keys(res.body[0].performedBy).sort()).toEqual(['fullName', 'role'])
  })

  it('API-22 answers another Requester and a missing Ticket with identical 404s (AC-17)', async () => {
    const ticket = await makeTicket()
    await makeAction(ticket.id)

    const foreign = await requesterList(requesterB, ticket.id)
    const missing = await requesterList(requesterB, 2_000_000_000)

    expect(foreign.status).toBe(404)
    expect(foreign.body.error.code).toBe('TICKET_NOT_FOUND')
    expect(foreign.body).toEqual(missing.body)
  })

  it('answers the staff list 404 for a Ticket that does not exist', async () => {
    const res = await staffList(owner, 2_000_000_000)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('TICKET_NOT_FOUND')
  })
})

describe('API-25 Ticket version and publicActivityAt (BR-26, BR-29, BR-45)', () => {
  it('advance on every action write; a Public Comment moves only publicActivityAt; an Internal Note moves neither', async () => {
    const ticket = await makeTicket()
    const reset = () => prisma.ticket.update({ where: { id: ticket.id }, data: { publicActivityAt: LONG_AGO } })
    const step = async (write: () => Promise<request.Response>, expected: { version: boolean; publicActivity: boolean }) => {
      await reset()
      const before = await ticketState(ticket.id)
      const res = await write()
      expect(res.status, res.text).toBeLessThan(300)
      const after = await ticketState(ticket.id)
      expect(after.version).toBe(before.version + (expected.version ? 1 : 0))
      expect(after.publicActivityAt.getTime() > LONG_AGO.getTime()).toBe(expected.publicActivity)
      return res
    }

    const created = await step(() => create(owner, ticket.id, createBody({ followUpRequired: true, followUpNote: 'Later' })), {
      version: true,
      publicActivity: true,
    })
    const id = created.body.id
    await step(() => edit(owner, ticket.id, id, { expectedVersion: 1, result: 'Edited' }), { version: true, publicActivity: true })
    await step(() => complete(owner, ticket.id, id, 2), { version: true, publicActivity: true })
    await step(() => voidAction(owner, ticket.id, id, 3), { version: true, publicActivity: true })
    await step(() => as(owner)(request(app).post(`/api/tickets/${ticket.id}/comments`).send({ body: 'Public update' })), {
      version: false,
      publicActivity: true,
    })
    await step(() => as(owner)(request(app).post(`/api/staff/tickets/${ticket.id}/internal-notes`).send({ body: 'Private' })), {
      version: false,
      publicActivity: false,
    })
  })
})

describe('API-24 ActionTaken CHECK constraints reject invalid rows inserted by direct SQL (spec §7.1)', () => {
  type Row = {
    followUpRequired: boolean
    followUpNote?: string | null
    followUpCompletedAt?: Date | null
    voidedAt?: Date | null
    voidedById?: number | null
    voidReason?: string | null
  }

  // Bypasses Prisma's typed client on purpose: the constraint must hold for any code path.
  const insert = (row: Row) => {
    counter += 1
    return prisma.$executeRaw`
      INSERT INTO "ActionTaken" ("ticketId", "clientRequestId", "actionAt", "description", "result",
        "followUpRequired", "followUpNote", "followUpCompletedAt", "performedById",
        "voidedAt", "voidedById", "voidReason", "updatedAt")
      VALUES (${ticketId}, gen_random_uuid(), now(), ${`Direct SQL row ${counter}`}, 'Result',
        ${row.followUpRequired}, ${row.followUpNote ?? null}, ${row.followUpCompletedAt ?? null}, ${staffId},
        ${row.voidedAt ?? null}, ${row.voidedById === undefined ? null : row.voidedById}, ${row.voidReason ?? null}, now())
    `
  }

  const rejected = (row: Row, constraint: string) =>
    expect(insert(row)).rejects.toThrow(new RegExp(`violates check constraint \\\\?"${constraint}\\\\?"`))

  it('accepts valid rows: no follow-up, an outstanding one, a completed one, and a voided action', async () => {
    const now = new Date()
    await expect(insert({ followUpRequired: false })).resolves.toBe(1)
    await expect(insert({ followUpRequired: true, followUpNote: 'Check tomorrow' })).resolves.toBe(1)
    await expect(insert({ followUpRequired: true, followUpNote: 'Checked', followUpCompletedAt: now })).resolves.toBe(1)
    await expect(insert({ followUpRequired: false, voidedAt: now, voidedById: staffId, voidReason: 'Wrong ticket' })).resolves.toBe(1)
  })

  it('rejects a follow-up note without a required follow-up, and a required follow-up without a note (BR-10)', async () => {
    await rejected({ followUpRequired: false, followUpNote: 'Orphan note' }, 'ActionTaken_followUp_pairing_check')
    await rejected({ followUpRequired: true, followUpNote: null }, 'ActionTaken_followUp_pairing_check')
  })

  it('rejects a completed follow-up that was never required (BR-16)', async () => {
    await rejected({ followUpRequired: false, followUpCompletedAt: new Date() }, 'ActionTaken_followUp_completion_check')
  })

  it('rejects partially voided rows: voidedAt, voidedById, and voidReason are all-or-nothing (BR-20)', async () => {
    const now = new Date()
    await rejected({ followUpRequired: false, voidedAt: now }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidedAt: now, voidedById: staffId }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidedById: staffId, voidReason: 'No time' }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidReason: 'Reason only' }, 'ActionTaken_void_fields_check')
  })
})
