import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@comments-api.toktickit.test'

let requesterA: { id: number; fullName: string }
let requesterB: { id: number }
let staff: { id: number; fullName: string }
let admin: { id: number }
let noteAuthor: { id: number; fullName: string }
let categoryId: number
let relatedSystemId: number
let counter = 0

async function createUser(key: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR', fullName = `Comments ${key}`) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
  })
  await signIn(user.id)
  return user
}

const createTicket = async (requesterId = requesterA.id) =>
  prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-MSG-${Date.now()}-${(counter += 1)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Comments fixture ticket ${counter}`,
      description: 'Created by the comments and notes API suite.',
      requestedPriority: 'MEDIUM',
      itPriority: 'MEDIUM',
    },
  })

const as = (userId: number, req: request.Test) => req.set('Cookie', asUser(userId))
const comments = (ticketId: number | string) => `/api/tickets/${ticketId}/comments`
const notes = (ticketId: number | string) => `/api/staff/tickets/${ticketId}/internal-notes`
const flag = (ticketId: number | string) => `/api/tickets/${ticketId}/appears-resolved`
const messageCount = (ticketId: number) => prisma.ticketMessage.count({ where: { ticketId } })

beforeAll(async () => {
  requesterA = await createUser('requester-a', 'REQUESTER')
  requesterB = await createUser('requester-b', 'REQUESTER')
  staff = await createUser('staff', 'IT_STAFF')
  admin = await createUser('admin', 'ADMINISTRATOR')
  noteAuthor = await createUser('note-author', 'IT_STAFF', 'Vendor Liaison Staffer')
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id
})

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  // Messages cascade with their Ticket; the author foreign key is Restrict, so Tickets go first.
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

const messageShape = (overrides: object) => ({
  id: expect.any(Number),
  visibility: 'PUBLIC',
  body: expect.any(String),
  isSystem: false,
  author: expect.any(Object),
  createdAt: expect.any(String),
  ...overrides,
})

describe('API-68 the owning Requester posts a Public Comment (AC-45, BR-43)', () => {
  it('stores the trimmed body with the session user as author and a backend timestamp', async () => {
    const ticket = await createTicket()
    const before = Date.now()

    const res = await as(requesterA.id, request(app).post(comments(ticket.id))).send({
      body: '  The laptop restarted again this morning.  ',
    })

    expect(res.status).toBe(201)
    expect(res.body).toEqual(
      messageShape({
        body: 'The laptop restarted again this morning.',
        author: { id: requesterA.id, fullName: requesterA.fullName, role: 'REQUESTER' },
      }),
    )
    const createdAt = new Date(res.body.createdAt).getTime()
    expect(createdAt).toBeGreaterThanOrEqual(before - 1000)
    expect(createdAt).toBeLessThanOrEqual(Date.now() + 1000)

    const stored = await prisma.ticketMessage.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored).toMatchObject({ ticketId: ticket.id, authorId: requesterA.id, visibility: 'PUBLIC', isSystem: false })
    const refreshed = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    expect(refreshed.updatedAt.getTime()).toBeGreaterThan(ticket.updatedAt.getTime())
  })
})

describe('API-69 IT Staff comment reaches the Requester (AC-46)', () => {
  it('is returned to the owning Requester, oldest first, with the staff author', async () => {
    const ticket = await createTicket()
    await as(requesterA.id, request(app).post(comments(ticket.id))).send({ body: 'First, from the requester.' })
    const posted = await as(staff.id, request(app).post(comments(ticket.id))).send({ body: 'We have replaced the VPN profile.' })
    expect(posted.status).toBe(201)

    const res = await as(requesterA.id, request(app).get(comments(ticket.id)))

    expect(res.status).toBe(200)
    expect(res.body.map((message: { body: string }) => message.body)).toEqual([
      'First, from the requester.',
      'We have replaced the VPN profile.',
    ])
    expect(res.body[1].author).toEqual({ id: staff.id, fullName: staff.fullName, role: 'IT_STAFF' })
  })
})

describe('API-70 a Requester never receives Internal Notes (AC-47, BR-40, exit criterion)', () => {
  it('returns exactly the two Public Comments, with no internal body, author, id, or count anywhere', async () => {
    const ticket = await createTicket()
    await prisma.ticketMessage.createMany({
      data: [
        { ticketId: ticket.id, authorId: staff.id, visibility: 'PUBLIC', body: 'Public: looking into it.' },
        { ticketId: ticket.id, authorId: requesterA.id, visibility: 'PUBLIC', body: 'Public: thank you.' },
      ],
    })
    const internal = await Promise.all(
      ['Internal: vendor case 118822.', 'Internal: suspect the docking station.', 'Internal: escalate on Friday.'].map(
        (body) => prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: noteAuthor.id, visibility: 'INTERNAL', body } }),
      ),
    )

    const res = await as(requesterA.id, request(app).get(comments(ticket.id)))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body.every((message: { visibility: string }) => message.visibility === 'PUBLIC')).toBe(true)
    for (const note of internal) {
      expect(res.text).not.toContain(note.body)
      expect(res.body.map((message: { id: number }) => message.id)).not.toContain(note.id)
    }
    expect(res.text).not.toContain(noteAuthor.fullName)
    expect(res.text).not.toContain('INTERNAL')
    // A bare array: no wrapper object that could carry a total or a hidden count.
    expect(Array.isArray(res.body)).toBe(true)

    // The predicate is PUBLIC for every caller of this route, including staff who may read notes elsewhere.
    const staffView = await as(staff.id, request(app).get(comments(ticket.id)))
    expect(staffView.body).toHaveLength(2)
  })
})

describe('API-71 IT Staff and Administrators read Internal Notes (AC-48)', () => {
  it('returns every note, oldest first, with authors and timestamps', async () => {
    const ticket = await createTicket()
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: staff.id, visibility: 'PUBLIC', body: 'A public one.' } })
    for (const body of ['Note one.', 'Note two.', 'Note three.']) {
      const posted = await as(staff.id, request(app).post(notes(ticket.id))).send({ body })
      expect(posted.status).toBe(201)
      expect(posted.body).toEqual(
        messageShape({ visibility: 'INTERNAL', body, author: { id: staff.id, fullName: staff.fullName, role: 'IT_STAFF' } }),
      )
    }

    for (const reader of [staff.id, admin.id]) {
      const res = await as(reader, request(app).get(notes(ticket.id)))
      expect(res.status).toBe(200)
      expect(res.body.map((message: { body: string }) => message.body)).toEqual(['Note one.', 'Note two.', 'Note three.'])
      for (const message of res.body) {
        expect(message).toEqual(messageShape({ visibility: 'INTERNAL', author: { id: staff.id, fullName: staff.fullName, role: 'IT_STAFF' } }))
      }
    }
  })

  it('answers an unknown Ticket 404 for staff, and a bad id 400', async () => {
    expect((await as(staff.id, request(app).get(notes(999_999_999)))).body.error.code).toBe('TICKET_NOT_FOUND')
    expect((await as(staff.id, request(app).get(notes('abc')))).body.error.code).toBe('INVALID_PATH_PARAMETER')
  })
})

describe('API-72 body length and whitespace (AC-49, BR-44)', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', '   \n\t '],
    ['2001 characters', 'x'.repeat(2001)],
  ])('rejects a %s body on both routes and stores nothing', async (_label, body) => {
    const ticket = await createTicket()

    const comment = await as(requesterA.id, request(app).post(comments(ticket.id))).send({ body })
    const note = await as(staff.id, request(app).post(notes(ticket.id))).send({ body })

    expect(comment.status).toBe(400)
    expect(comment.body.error).toEqual({
      code: 'VALIDATION_FAILED',
      message: expect.any(String),
      fields: [{ field: 'body', message: 'Enter a comment of up to 2000 characters.' }],
    })
    expect(note.status).toBe(400)
    expect(note.body.error.fields).toEqual([{ field: 'body', message: 'Enter a note of up to 2000 characters.' }])
    expect(await messageCount(ticket.id)).toBe(0)
  })

  it('accepts the 1- and 2000-character boundaries, and rejects a missing body', async () => {
    const ticket = await createTicket()

    expect((await as(requesterA.id, request(app).post(comments(ticket.id))).send({ body: 'x' })).status).toBe(201)
    expect((await as(staff.id, request(app).post(notes(ticket.id))).send({ body: 'y'.repeat(2000) })).status).toBe(201)
    expect((await as(staff.id, request(app).post(notes(ticket.id))).send({})).status).toBe(400)
  })
})

describe('API-73 author, timestamp, and visibility are server-owned (BR-43)', () => {
  it.each([
    ['author', { author: { id: 1 } }],
    ['createdAt', { createdAt: '2001-01-01T00:00:00Z' }],
    ['visibility', { visibility: 'INTERNAL' }],
  ])('rejects a comment body carrying %s rather than ignoring it', async (field, extra) => {
    const ticket = await createTicket()

    const res = await as(requesterA.id, request(app).post(comments(ticket.id))).send({ body: 'Legitimate text.', ...extra })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.fields).toContainEqual({ field, message: expect.any(String) })
    expect(await messageCount(ticket.id)).toBe(0)
  })

  it('rejects the same on an Internal Note', async () => {
    const ticket = await createTicket()

    const res = await as(staff.id, request(app).post(notes(ticket.id))).send({ body: 'Note.', authorId: requesterA.id })

    expect(res.status).toBe(400)
    expect(res.body.error.fields).toContainEqual({ field: 'authorId', message: expect.any(String) })
    expect(await messageCount(ticket.id)).toBe(0)
  })
})

describe('API-74 another Requester’s Ticket (BR-19)', () => {
  it('answers reading and posting 404 TICKET_NOT_FOUND, identical to an unknown id, and stores nothing', async () => {
    const ticket = await createTicket()

    const foreignRead = await as(requesterB.id, request(app).get(comments(ticket.id)))
    const unknownRead = await as(requesterB.id, request(app).get(comments(999_999_999)))
    const foreignPost = await as(requesterB.id, request(app).post(comments(ticket.id))).send({ body: 'Not mine.' })

    expect(foreignRead.status).toBe(404)
    expect(foreignRead.text).toBe(unknownRead.text)
    expect(foreignRead.body.error.code).toBe('TICKET_NOT_FOUND')
    expect(foreignPost.status).toBe(404)
    expect(await messageCount(ticket.id)).toBe(0)
    expect((await as(requesterA.id, request(app).get(comments('abc')))).body.error.code).toBe('INVALID_PATH_PARAMETER')
  })
})

describe('API-75 and API-76 "Problem Appears Resolved" (AC-50, BR-46)', () => {
  it('API-75 sets the flag, appends one system Public Comment, and leaves the status unchanged', async () => {
    const ticket = await createTicket()
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'WAITING_FOR_REQUESTER', assigneeId: staff.id } })
    const before = Date.now()

    const res = await as(requesterA.id, request(app).post(flag(ticket.id))).send({ note: '  Stable since yesterday.  ' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ticket.id,
      status: 'WAITING_FOR_REQUESTER',
      requesterResolvedFlaggedAt: expect.any(String),
      assignee: { id: staff.id, fullName: staff.fullName },
    })
    expect(new Date(res.body.requesterResolvedFlaggedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    expect(stored.status).toBe('WAITING_FOR_REQUESTER')
    expect(stored.requesterResolvedFlaggedAt).not.toBeNull()

    const messages = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ visibility: 'PUBLIC', isSystem: true, authorId: requesterA.id })
    expect(messages[0].body).toContain('reported that the problem appears resolved')
    expect(messages[0].body).toContain('Stable since yesterday.')

    // The system comment is part of the public conversation both sides read.
    const thread = await as(requesterA.id, request(app).get(comments(ticket.id)))
    expect(thread.body).toEqual([messageShape({ isSystem: true, author: { id: requesterA.id, fullName: requesterA.fullName, role: 'REQUESTER' } })])
  })

  it('API-76 refuses a second flag with 409 ALREADY_FLAGGED and writes nothing more', async () => {
    const ticket = await createTicket()
    expect((await as(requesterA.id, request(app).post(flag(ticket.id)))).status).toBe(200)
    const first = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })

    const again = await as(requesterA.id, request(app).post(flag(ticket.id)))

    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_FLAGGED')
    expect(await messageCount(ticket.id)).toBe(1)
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })
    expect(after.requesterResolvedFlaggedAt).toEqual(first.requesterResolvedFlaggedAt)
  })

  it('API-76 lets exactly one of two simultaneous flags succeed', async () => {
    const ticket = await createTicket()

    const results = await Promise.all([
      as(requesterA.id, request(app).post(flag(ticket.id))),
      as(requesterA.id, request(app).post(flag(ticket.id))),
    ])

    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    expect(await prisma.ticketMessage.count({ where: { ticketId: ticket.id, isSystem: true } })).toBe(1)
  })

  it('rejects an over-length note and a foreign Ticket without writing', async () => {
    const ticket = await createTicket()

    const long = await as(requesterA.id, request(app).post(flag(ticket.id))).send({ note: 'x'.repeat(2001) })
    const foreign = await as(requesterB.id, request(app).post(flag(ticket.id)))

    expect(long.status).toBe(400)
    expect(long.body.error.fields).toEqual([{ field: 'note', message: 'Enter a note of up to 2000 characters.' }])
    expect(foreign.status).toBe(404)
    expect(foreign.body.error.code).toBe('TICKET_NOT_FOUND')
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).requesterResolvedFlaggedAt).toBeNull()
    expect(await messageCount(ticket.id)).toBe(0)
  })
})

describe('API-77 staff cannot flag a Ticket resolved (BR-46, matrix)', () => {
  it.each(['staff', 'admin'])('%s is refused 403 FORBIDDEN and nothing changes', async (key) => {
    const ticket = await createTicket()
    const caller = key === 'staff' ? staff.id : admin.id

    const res = await as(caller, request(app).post(flag(ticket.id)))

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).requesterResolvedFlaggedAt).toBeNull()
    expect(await messageCount(ticket.id)).toBe(0)
  })
})

describe('API-78 Comments and Notes are append-only (BR-42)', () => {
  it('has no route to edit or delete a message, and the message is untouched', async () => {
    const ticket = await createTicket()
    const comment = await as(requesterA.id, request(app).post(comments(ticket.id))).send({ body: 'Original comment.' })
    const note = await as(staff.id, request(app).post(notes(ticket.id))).send({ body: 'Original note.' })

    const attempts = [
      request(app).patch(`${comments(ticket.id)}/${comment.body.id}`).send({ body: 'Edited.' }),
      request(app).delete(`${comments(ticket.id)}/${comment.body.id}`),
      request(app).put(`${comments(ticket.id)}/${comment.body.id}`).send({ body: 'Edited.' }),
      request(app).patch(`${notes(ticket.id)}/${note.body.id}`).send({ body: 'Edited.' }),
      request(app).delete(`${notes(ticket.id)}/${note.body.id}`),
      request(app).delete(comments(ticket.id)),
      request(app).delete(notes(ticket.id)),
    ]
    for (const attempt of attempts) {
      // Signed in as an Administrator, so neither the gate nor a role guard is what refuses it.
      expect((await attempt.set('Cookie', asUser(admin.id))).status).toBe(404)
    }

    const stored = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { id: 'asc' } })
    expect(stored.map((message) => message.body)).toEqual(['Original comment.', 'Original note.'])
  })
})
