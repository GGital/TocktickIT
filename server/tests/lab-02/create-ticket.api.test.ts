import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

const emailA = 'create-ticket-a@toktickit.test'
const emailB = 'create-ticket-b@toktickit.test'
const inactiveCategoryName = 'ZZ Inactive Create-Ticket Category'

let requesterA: number
let requesterB: number
let categoryId: number
let relatedSystemId: number
let inactiveCategoryId: number

let counter = 0
const uniqueSummary = () => `Laptop battery drains fast case ${(counter += 1)}`

const validBody = (overrides: Record<string, unknown> = {}) => ({
  summary: uniqueSummary(),
  description: 'The battery drops from 100% to 15% within half an hour of light use.',
  categoryId,
  relatedSystemId,
  requestedPriority: 'HIGH',
  ...overrides,
})

const post = (body: object, requesterId: number = requesterA) =>
  request(app).post('/api/tickets').set('X-Requester-Id', String(requesterId)).send(body)

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.requesterUser.upsert({
      where: { email: emailA },
      update: { isActive: true },
      create: { email: emailA, fullName: 'Test Requester A', department: 'QA' },
    }),
    prisma.requesterUser.upsert({
      where: { email: emailB },
      update: { isActive: true },
      create: { email: emailB, fullName: 'Test Requester B', department: 'QA' },
    }),
  ])
  requesterA = a.id
  requesterB = b.id

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  categoryId = category.id
  relatedSystemId = relatedSystem.id

  const inactive = await prisma.category.upsert({
    where: { name: inactiveCategoryName },
    update: { isActive: false },
    create: { name: inactiveCategoryName, isActive: false },
  })
  inactiveCategoryId = inactive.id
})

afterEach(() => vi.restoreAllMocks())

afterAll(async () => {
  // Tickets first: the requester foreign key is Restrict.
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  await prisma.category.deleteMany({ where: { name: inactiveCategoryName } })
  await prisma.$disconnect()
})

describe('API-09 create a valid ticket (AC-08, AC-09)', () => {
  it('persists one ticket with server-assigned number, status, and requester', async () => {
    const body = validBody()
    const res = await post(body)

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
    expect(res.body.status).toBe('NEW')
    expect(res.body.requester.id).toBe(requesterA)
    expect(res.body.attachments).toEqual([])
    expect(res.body.category).toEqual({ id: categoryId, name: expect.any(String) })
    expect(res.headers.location).toBe(`/api/tickets/${res.body.id}`)

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.requesterId).toBe(requesterA)
    expect(stored.status).toBe('NEW')
    expect(stored.summary).toBe(body.summary)
  })
})

describe('API-10 ticket numbers are unique and increasing (BR-01, BR-03)', () => {
  it('issues a strictly larger sequence to the second ticket of the year', async () => {
    const first = await post(validBody())
    const second = await post(validBody())

    expect(first.body.ticketNumber).not.toBe(second.body.ticketNumber)

    const sequence = (ticketNumber: string) => Number(ticketNumber.slice(-6))
    expect(sequence(second.body.ticketNumber)).toBeGreaterThan(
      sequence(first.body.ticketNumber),
    )
  })
})

describe('API-11 client cannot set server-assigned values (BR-01, BR-04)', () => {
  it('ignores ticketNumber, status, and createdAt in the body', async () => {
    const res = await post(
      validBody({
        ticketNumber: 'TKT-1999-000001',
        status: 'CLOSED',
        createdAt: '1999-01-01T00:00:00.000Z',
      }),
    )

    expect(res.status).toBe(201)
    expect(res.body.ticketNumber).not.toBe('TKT-1999-000001')
    expect(res.body.status).toBe('NEW')
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThan(2000)
  })
})

describe('API-12 requester comes from the header (AC-17, BR-05)', () => {
  it('ignores a foreign requesterId in the body', async () => {
    const res = await post(validBody({ requesterId: requesterB }))

    expect(res.status).toBe(201)
    expect(res.body.requester.id).toBe(requesterA)

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.requesterId).toBe(requesterA)
  })
})

describe('API-13 empty body (AC-13, BR-18)', () => {
  it('reports every missing field at once and persists nothing', async () => {
    const before = await prisma.ticket.count({ where: { requesterId: requesterA } })
    const res = await post({})

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.fields.map((field: { field: string }) => field.field).sort()).toEqual([
      'categoryId',
      'description',
      'relatedSystemId',
      'requestedPriority',
      'summary',
    ])
    expect(await prisma.ticket.count({ where: { requesterId: requesterA } })).toBe(before)
  })
})

describe('API-14 length boundaries (AC-12, BR-17)', () => {
  it('rejects 9 characters of summary and accepts 10', async () => {
    const short = await post(validBody({ summary: 'a'.repeat(9) }))
    expect(short.status).toBe(400)
    expect(short.body.error.fields).toContainEqual({
      field: 'summary',
      message: 'Summary must be between 10 and 120 characters.',
    })

    expect((await post(validBody({ summary: 'a'.repeat(10) }))).status).toBe(201)
  })

  it('rejects 19 characters of description and accepts 20', async () => {
    const short = await post(validBody({ description: 'b'.repeat(19) }))
    expect(short.status).toBe(400)
    expect(short.body.error.fields).toContainEqual({
      field: 'description',
      message: 'Description must be between 20 and 2000 characters.',
    })

    expect((await post(validBody({ description: 'b'.repeat(20) }))).status).toBe(201)
  })
})

describe('API-15 input is trimmed before validation and storage (BR-16)', () => {
  it('accepts a 120-character summary padded with whitespace and stores it trimmed', async () => {
    const summary = 'c'.repeat(120)
    const res = await post(validBody({ summary: `   ${summary}   ` }))

    expect(res.status).toBe(201)
    expect(res.body.summary).toBe(summary)

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.summary).toBe(summary)
  })
})

describe('API-16 unknown and inactive references (BR-17, BR-45)', () => {
  it('reports an inactive category exactly as an unknown one', async () => {
    const unknown = await post(validBody({ categoryId: 999_999 }))
    const inactive = await post(validBody({ categoryId: inactiveCategoryId }))

    expect(unknown.status).toBe(400)
    expect(inactive.status).toBe(400)
    expect(inactive.body).toEqual(unknown.body)
    expect(inactive.body.error.fields).toEqual([
      { field: 'categoryId', message: 'Select a valid category.' },
    ])
  })

  it('rejects an unknown related system', async () => {
    const res = await post(validBody({ relatedSystemId: 999_999 }))

    expect(res.status).toBe(400)
    expect(res.body.error.fields).toEqual([
      { field: 'relatedSystemId', message: 'Select a valid related system.' },
    ])
  })
})

describe('API-17 requested priority is never defaulted (BR-06)', () => {
  it.each([undefined, 'CRITICAL', 'low'])('rejects requestedPriority %s', async (priority) => {
    const body = validBody()
    if (priority === undefined) delete (body as Record<string, unknown>).requestedPriority
    else body.requestedPriority = priority

    const res = await post(body)

    expect(res.status).toBe(400)
    expect(res.body.error.fields).toContainEqual({
      field: 'requestedPriority',
      message: 'Select a requested priority.',
    })
  })
})

describe('API-18 duplicate submission window (AC-15, BR-19)', () => {
  it('rejects an identical second submission and keeps exactly one ticket', async () => {
    const body = validBody()

    const first = await post(body)
    const second = await post(body)

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('DUPLICATE_SUBMISSION')

    const count = await prisma.ticket.count({
      where: { requesterId: requesterA, summary: body.summary },
    })
    expect(count).toBe(1)
  })
})

describe('API-19 the duplicate window is per requester (BR-19)', () => {
  it('accepts the identical payload from a different requester', async () => {
    const body = validBody()

    expect((await post(body, requesterA)).status).toBe(201)
    expect((await post(body, requesterB)).status).toBe(201)
  })
})

describe('API-20 unexpected failure stays safe (BR-22)', () => {
  it('returns INTERNAL_ERROR without leaking internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma, '$transaction').mockRejectedValue(
      new Error('Invalid `prisma.ticket.create()` at D:\\server\\src\\tickets.ts:120'),
    )

    const res = await post(validBody())

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|select |insert |\.ts:|\\|\//i)
  })
})
