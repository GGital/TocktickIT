import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

const emailA = 'my-tickets-a@toktickit.test'
const emailB = 'my-tickets-b@toktickit.test'

let requesterA: number
let requesterB: number
let categories: { id: number; name: string }[]
let systems: { id: number; name: string }[]

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const list = (query = '', requesterId: number = requesterA) =>
  request(app)
    .get(`/api/tickets${query}`)
    .set('X-Requester-Id', String(requesterId))

const ids = (body: { data: { id: number }[] }) => body.data.map((ticket) => ticket.id)

let created = 0

async function seedTicket(
  requesterId: number,
  overrides: {
    summary?: string
    description?: string
    categoryId?: number
    relatedSystemId?: number
    requestedPriority?: (typeof priorities)[number]
    createdAt?: Date
  } = {},
) {
  created += 1

  return prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-LIST-${created}`,
      requesterId,
      categoryId: overrides.categoryId ?? categories[0].id,
      relatedSystemId: overrides.relatedSystemId ?? systems[0].id,
      summary: overrides.summary ?? `Fixture ticket number ${created} for the list suite`,
      description: overrides.description ?? 'Baseline description used by the my-tickets suite.',
      requestedPriority: overrides.requestedPriority ?? 'MEDIUM',
      // createdAt is set explicitly so sorting and paging are deterministic.
      createdAt: overrides.createdAt ?? new Date(Date.UTC(2026, 0, created)),
    },
  })
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.requesterUser.upsert({
      where: { email: emailA },
      update: { isActive: true },
      create: { email: emailA, fullName: 'List Owner A', department: 'QA' },
    }),
    prisma.requesterUser.upsert({
      where: { email: emailB },
      update: { isActive: true },
      create: { email: emailB, fullName: 'List Owner B', department: 'QA' },
    }),
  ])
  requesterA = a.id
  requesterB = b.id

  categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })
  systems = await prisma.relatedSystem.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })

  // 12 tickets for A: enough for two pages at the default page size (AC-36).
  for (let index = 0; index < 12; index += 1) {
    await seedTicket(requesterA, {
      categoryId: categories[index % categories.length].id,
      relatedSystemId: systems[index % systems.length].id,
      requestedPriority: priorities[index % priorities.length],
    })
  }

  // Two tickets for B, which must never appear in A's list.
  await seedTicket(requesterB, { summary: 'Requester B private ticket about printers' })
  await seedTicket(requesterB, { summary: 'Requester B second private ticket' })
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  await prisma.$disconnect()
})

describe('API-21 ownership scope (AC-31, BR-15)', () => {
  it('returns only the calling requester tickets', async () => {
    const mine = await list('?pageSize=50')
    const theirs = await list('?pageSize=50', requesterB)

    expect(mine.status).toBe(200)
    expect(mine.body.data).toHaveLength(12)
    expect(ids(mine.body).some((id) => ids(theirs.body).includes(id))).toBe(false)

    const owners = await prisma.ticket.findMany({
      where: { id: { in: ids(mine.body) } },
      select: { requesterId: true },
    })
    expect(owners.every((ticket) => ticket.requesterId === requesterA)).toBe(true)
  })
})

describe('API-22 pagination (AC-36, BR-38)', () => {
  it('splits 12 tickets into two pages of the default size', async () => {
    const first = await list()
    const second = await list('?page=2')

    expect(first.body.data).toHaveLength(10)
    expect(first.body.meta).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })

    expect(second.body.data).toHaveLength(2)
    expect(second.body.meta.page).toBe(2)
    // No ticket appears on both pages.
    expect(ids(first.body).some((id) => ids(second.body).includes(id))).toBe(false)
  })
})

describe('API-23 a page past the end (BR-40)', () => {
  it('is an empty page, not an error', async () => {
    const res = await list('?page=99')

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.meta).toMatchObject({ page: 99, totalItems: 12, totalPages: 2 })
  })
})

describe('API-24 search (AC-34, BR-35)', () => {
  it('matches ticket number, summary, and description fragments in any case', async () => {
    const target = await seedTicket(requesterA, {
      summary: 'Projector in Lecture Hall flickers badly',
      description: 'The HDMI cable seems loose whenever the projector warms up.',
    })

    const byNumber = await list(`?search=${target.ticketNumber.toLowerCase()}`)
    const bySummary = await list('?search=PROJECTOR')
    const byDescription = await list('?search=hdmi')

    expect(ids(byNumber.body)).toContain(target.id)
    expect(ids(bySummary.body)).toContain(target.id)
    expect(ids(byDescription.body)).toContain(target.id)

    const noMatch = await list('?search=zzzz-nothing-matches-this')
    expect(noMatch.body.data).toEqual([])
    expect(noMatch.body.meta.totalItems).toBe(0)
    expect(noMatch.body.meta.totalPages).toBe(0)

    await prisma.ticket.delete({ where: { id: target.id } })
  })
})

describe('API-25 filters combine with AND (AC-35, BR-36)', () => {
  it('narrows by category and priority together, and with a search term', async () => {
    const category = categories[1]
    const target = await seedTicket(requesterA, {
      summary: 'Warehouse scanner will not pair over Bluetooth',
      categoryId: category.id,
      requestedPriority: 'URGENT',
    })

    const filtered = await list(
      `?pageSize=50&categoryId=${category.id}&requestedPriority=URGENT`,
    )
    expect(filtered.body.data.length).toBeGreaterThan(0)
    expect(
      filtered.body.data.every(
        (ticket: { category: { id: number }; requestedPriority: string }) =>
          ticket.category.id === category.id && ticket.requestedPriority === 'URGENT',
      ),
    ).toBe(true)

    const withSearch = await list(
      `?pageSize=50&categoryId=${category.id}&requestedPriority=URGENT&search=scanner`,
    )
    expect(ids(withSearch.body)).toEqual([target.id])

    // The same search with a contradicting filter matches nothing.
    const contradicting = await list(
      `?pageSize=50&categoryId=${category.id}&requestedPriority=LOW&search=scanner`,
    )
    expect(contradicting.body.data).toEqual([])

    await prisma.ticket.delete({ where: { id: target.id } })
  })
})

describe('API-26 sorting is stable (AC-37, BR-37)', () => {
  it('returns the oldest first and the identical order on a repeated request', async () => {
    const first = await list('?sortBy=createdAt&sortOrder=asc&pageSize=50')
    const second = await list('?sortBy=createdAt&sortOrder=asc&pageSize=50')

    const dates = first.body.data.map((ticket: { createdAt: string }) =>
      new Date(ticket.createdAt).getTime(),
    )
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
    expect(ids(first.body)).toEqual(ids(second.body))
  })

  it('breaks a createdAt tie deterministically', async () => {
    const sameInstant = new Date(Date.UTC(2026, 5, 1, 12))
    const tied = await Promise.all([
      seedTicket(requesterA, { createdAt: sameInstant, summary: 'Tie-break fixture one here' }),
      seedTicket(requesterA, { createdAt: sameInstant, summary: 'Tie-break fixture two here' }),
    ])

    const first = await list('?pageSize=50')
    const second = await list('?pageSize=50')
    expect(ids(first.body)).toEqual(ids(second.body))

    // id descending is the documented secondary sort.
    const order = ids(first.body).filter((id) => tied.some((ticket) => ticket.id === id))
    expect(order).toEqual([...order].sort((a, b) => b - a))

    await prisma.ticket.deleteMany({ where: { id: { in: tied.map((ticket) => ticket.id) } } })
  })
})

describe('API-27 priority sorts by severity, not alphabetically (BR-37)', () => {
  it('orders URGENT, HIGH, MEDIUM, LOW when sorted descending', async () => {
    const res = await list('?sortBy=requestedPriority&sortOrder=desc&pageSize=50')

    const severity = { URGENT: 3, HIGH: 2, MEDIUM: 1, LOW: 0 }
    const ranks = res.body.data.map(
      (ticket: { requestedPriority: keyof typeof severity }) => severity[ticket.requestedPriority],
    )

    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
    expect(res.body.data[0].requestedPriority).toBe('URGENT')
    expect(res.body.data.at(-1).requestedPriority).toBe('LOW')
    // Alphabetically, URGENT would sort last and HIGH first.
    expect(ranks).not.toEqual([...ranks].sort())
  })
})

describe('API-28 invalid query parameters (AC-39, BR-39)', () => {
  it.each([
    ['?pageSize=999', 'pageSize'],
    ['?page=abc', 'page'],
    ['?sortBy=secret', 'sortBy'],
    ['?sortOrder=sideways', 'sortOrder'],
    ['?requestedPriority=CRITICAL', 'requestedPriority'],
  ])('rejects %s naming the parameter', async (query, parameter) => {
    const res = await list(query)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_QUERY_PARAMETER')
    expect(res.body.error.message).toContain(parameter)
  })
})

describe('API-29 attachment count (BR-25, api-spec §2.4)', () => {
  it('counts active attachments only', async () => {
    const ticket = await seedTicket(requesterA, {
      summary: 'Ticket carrying two active and one removed file',
    })

    await prisma.attachment.createMany({
      data: [
        {
          ticketId: ticket.id,
          originalFilename: 'one.png',
          storedFilename: `${ticket.id}-one.png`,
          mimeType: 'image/png',
          sizeBytes: 10,
          uploadedById: requesterA,
        },
        {
          ticketId: ticket.id,
          originalFilename: 'two.png',
          storedFilename: `${ticket.id}-two.png`,
          mimeType: 'image/png',
          sizeBytes: 10,
          uploadedById: requesterA,
        },
        {
          ticketId: ticket.id,
          originalFilename: 'gone.png',
          storedFilename: `${ticket.id}-gone.png`,
          mimeType: 'image/png',
          sizeBytes: 10,
          uploadedById: requesterA,
          removedAt: new Date(),
          removalReason: 'Uploaded the wrong screenshot',
          removedById: requesterA,
        },
      ],
    })

    const res = await list(`?search=${encodeURIComponent('two active and one removed')}`)

    expect(ids(res.body)).toContain(ticket.id)
    const listed = res.body.data.find((row: { id: number }) => row.id === ticket.id)
    expect(listed.attachmentCount).toBe(2)

    await prisma.ticket.delete({ where: { id: ticket.id } })
  })
})
