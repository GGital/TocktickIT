import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

const emailA = 'detail-a@toktickit.test'
const emailB = 'detail-b@toktickit.test'

let requesterA: number
let requesterB: number
let ownedTicket: number
let foreignTicket: number
let activeAttachment: number

const get = (id: number, requesterId: number) =>
  request(app).get(`/api/tickets/${id}`).set('X-Requester-Id', String(requesterId))

let counter = 0

async function createTicket(requesterId: number) {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-DETAIL-${(counter += 1)}-${requesterId}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Detail fixture ticket for the API suite',
      description: 'Created by the ticket-detail suite so the endpoint has something to return.',
      requestedPriority: 'HIGH',
    },
  })

  return ticket.id
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.requesterUser.upsert({
      where: { email: emailA },
      update: { isActive: true },
      create: { email: emailA, fullName: 'Detail Owner A', department: 'QA' },
    }),
    prisma.requesterUser.upsert({
      where: { email: emailB },
      update: { isActive: true },
      create: { email: emailB, fullName: 'Detail Owner B', department: 'QA' },
    }),
  ])
  requesterA = a.id
  requesterB = b.id

  ownedTicket = await createTicket(requesterA)
  foreignTicket = await createTicket(requesterB)

  const active = await prisma.attachment.create({
    data: {
      ticketId: ownedTicket,
      originalFilename: 'battery-report.pdf',
      storedFilename: `detail-${ownedTicket}-active.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 248,
      uploadedById: requesterA,
    },
  })
  activeAttachment = active.id

  await prisma.attachment.create({
    data: {
      ticketId: ownedTicket,
      originalFilename: 'wrong-screenshot.png',
      storedFilename: `detail-${ownedTicket}-removed.png`,
      mimeType: 'image/png',
      sizeBytes: 812,
      uploadedById: requesterA,
      removedAt: new Date(),
      removalReason: 'Uploaded the wrong screenshot',
      removedById: requesterA,
    },
  })
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  await prisma.$disconnect()
})

describe('API-30 the owner fetches an owned ticket (AC-43)', () => {
  it('returns the full detail shape with its attachments', async () => {
    const res = await get(ownedTicket, requesterA)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: ownedTicket,
      ticketNumber: expect.any(String),
      summary: 'Detail fixture ticket for the API suite',
      requestedPriority: 'HIGH',
      status: 'NEW',
      category: { id: expect.any(Number), name: expect.any(String) },
      relatedSystem: { id: expect.any(Number), name: expect.any(String) },
      requester: { id: requesterA, fullName: 'Detail Owner A' },
    })
    expect(res.body.attachments).toHaveLength(2)
  })
})

describe('API-31 / API-32 ownership is indistinguishable from absence (AC-41, AC-44, BR-13)', () => {
  it('answers another requester ticket exactly as it answers an unknown id', async () => {
    const foreign = await get(foreignTicket, requesterA)
    const unknown = await get(999_999, requesterA)

    expect(foreign.status).toBe(404)
    expect(foreign.body.error.code).toBe('TICKET_NOT_FOUND')
    // Byte-identical: no message or field may confirm the ticket exists elsewhere.
    expect(foreign.body).toEqual(unknown.body)
    expect(foreign.status).toBe(unknown.status)
  })
})

describe('API-33 invalid path parameter (api-spec §1)', () => {
  it.each(['abc', '0'])('rejects /api/tickets/%s', async (id) => {
    const res = await request(app)
      .get(`/api/tickets/${id}`)
      .set('X-Requester-Id', String(requesterA))

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PATH_PARAMETER')
  })
})

describe('API-34 removed attachments are listed as metadata (AC-27, BR-32)', () => {
  it('marks the removed one and gives it no download URL', async () => {
    const res = await get(ownedTicket, requesterA)

    const active = res.body.attachments.find(
      (item: { id: number }) => item.id === activeAttachment,
    )
    const removed = res.body.attachments.find((item: { isRemoved: boolean }) => item.isRemoved)

    expect(active.downloadUrl).toBe(`/api/attachments/${activeAttachment}/download`)
    expect(removed).toMatchObject({
      isRemoved: true,
      removalReason: 'Uploaded the wrong screenshot',
      downloadUrl: null,
      removedBy: { id: requesterA, fullName: 'Detail Owner A' },
    })
    expect(removed.removedAt).toEqual(expect.any(String))
    // The internal storage name never leaves the server (BR-27).
    expect(removed).not.toHaveProperty('storedFilename')
  })
})
