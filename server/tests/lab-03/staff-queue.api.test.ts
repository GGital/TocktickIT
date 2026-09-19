import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RequestedPriority, TicketStatus } from '@prisma/client'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@queue-api.toktickit.test'
// Every fixture Ticket and person carries the run tag, so a search scopes each test to its own rows in a
// database that also holds the seed and earlier runs.
const RUN = Date.now().toString(36).toUpperCase()
const TAG = `QTAG${RUN}`
// A separate tag, owned by a Requester whose name lacks TAG, so the 25 paging Tickets never leak into TAG searches.
const PAGE_TAG = `PTAG${RUN}`

type QueueRow = {
  id: number
  ticketNumber: string
  summary: string
  requester: { id: number; fullName: string }
  assignee: { id: number; fullName: string } | null
  itPriority: RequestedPriority
  status: TicketStatus
  requesterResolvedFlagged: boolean
  createdAt: string
}

let requesterA: { id: number; fullName: string }
let requesterB: { id: number; fullName: string }
let requesterC: { id: number; fullName: string }
let staff: { id: number; fullName: string }
let staff2: { id: number; fullName: string }
let categoryId: number
let relatedSystemId: number
const fixture: Record<string, { id: number; ticketNumber: string }> = {}
let counter = 0

async function createUser(key: string, role: 'REQUESTER' | 'IT_STAFF', fullName: string) {
  const user = await prisma.user.create({
    data: { email: `${key}${DOMAIN}`, fullName, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
  })
  await signIn(user.id)
  return user
}

async function createTicket(values: {
  key?: string
  summary: string
  requesterId: number
  itPriority: RequestedPriority
  status?: TicketStatus
  assigneeId?: number | null
  flagged?: boolean
  createdAt: string
}) {
  counter += 1
  const ticket = await prisma.ticket.create({
    data: {
      // Neither tag appears in the number, so only the summary and the requester name carry a tag.
      ticketNumber: `TKT-TEST-${RUN}-${String(counter).padStart(3, '0')}`,
      requesterId: values.requesterId,
      categoryId,
      relatedSystemId,
      summary: values.summary,
      description: 'Created by the staff queue API suite.',
      requestedPriority: 'MEDIUM',
      itPriority: values.itPriority,
      status: values.status ?? 'NEW',
      assigneeId: values.assigneeId ?? null,
      requesterResolvedFlaggedAt: values.flagged ? new Date() : null,
      createdAt: new Date(values.createdAt),
    },
  })
  if (values.key) fixture[values.key] = ticket
  return ticket
}

const queue = (query = '', userId = staff.id) =>
  request(app).get(`/api/staff/tickets${query}`).set('Cookie', asUser(userId))

/** The queue scoped to this run's fixture Tickets. */
const scoped = (extra = '') => queue(`?search=${TAG}${extra}`)

const keysOf = (rows: QueueRow[]) =>
  rows.map((row) => Object.entries(fixture).find(([, ticket]) => ticket.id === row.id)?.[0] ?? `other:${row.id}`)

beforeAll(async () => {
  requesterA = await createUser('requester-a', 'REQUESTER', `Aurelia ${TAG}`)
  requesterB = await createUser('requester-b', 'REQUESTER', `Borisut ${TAG}`)
  requesterC = await createUser('requester-c', 'REQUESTER', `Cordelia ${PAGE_TAG}`)
  staff = await createUser('staff', 'IT_STAFF', `Queue Staff ${TAG}`)
  staff2 = await createUser('staff-2', 'IT_STAFF', `Second Staff ${TAG}`)
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id

  const A = requesterA.id
  const B = requesterB.id
  // Summaries carry the tag in mixed case so the search tests can use the opposite case.
  await createTicket({ key: 'urgentNew', summary: `${TAG} Email outage for the whole floor`, requesterId: A, itPriority: 'URGENT', createdAt: '2026-01-05T00:00:00Z' })
  await createTicket({ key: 'highOpenMine', summary: `${TAG} Printer jams on duplex`, requesterId: A, itPriority: 'HIGH', status: 'OPEN', assigneeId: staff.id, createdAt: '2026-01-02T00:00:00Z' })
  await createTicket({ key: 'highNewOldest', summary: `${TAG} VPN drops every few minutes`, requesterId: B, itPriority: 'HIGH', createdAt: '2026-01-01T00:00:00Z' })
  await createTicket({ key: 'lowFlagged', summary: `${TAG} Monitor flickers`, requesterId: B, itPriority: 'LOW', status: 'IN_PROGRESS', assigneeId: staff2.id, flagged: true, createdAt: '2026-01-03T00:00:00Z' })
  // Same IT Priority and the same createdAt as highOpenMine: only the id can order these two.
  await createTicket({ key: 'highWaitingMine', summary: `${TAG} Keyboard missing keys`, requesterId: A, itPriority: 'HIGH', status: 'WAITING_FOR_REQUESTER', assigneeId: staff.id, createdAt: '2026-01-02T00:00:00Z' })
  await createTicket({ key: 'mediumClosed', summary: `${TAG} Install a PDF reader`, requesterId: B, itPriority: 'MEDIUM', status: 'CLOSED', assigneeId: staff2.id, createdAt: '2026-01-04T00:00:00Z' })

  for (let index = 0; index < 25; index += 1) {
    await createTicket({ summary: `${PAGE_TAG} paging ticket ${index}`, requesterId: requesterC.id, itPriority: 'LOW', createdAt: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00Z` })
  }
}, 60_000)

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  await prisma.ticket.deleteMany({ where: { requesterId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

describe('API-43 the Queue lists every Requester’s Tickets (AC-28, FR-18)', () => {
  it('returns Tickets from several Requesters with the QueueTicketSummary shape', async () => {
    const res = await scoped('&pageSize=50')

    expect(res.status).toBe(200)
    const requesterIds = new Set(res.body.data.map((row: QueueRow) => row.requester.id))
    expect(requesterIds).toEqual(new Set([requesterA.id, requesterB.id]))

    const row = res.body.data.find((item: QueueRow) => item.id === fixture.highOpenMine.id)
    expect(row).toEqual({
      id: fixture.highOpenMine.id,
      ticketNumber: fixture.highOpenMine.ticketNumber,
      summary: `${TAG} Printer jams on duplex`,
      category: { id: categoryId, name: expect.any(String) },
      relatedSystem: { id: relatedSystemId, name: expect.any(String) },
      requester: { id: requesterA.id, fullName: requesterA.fullName },
      assignee: { id: staff.id, fullName: staff.fullName },
      requestedPriority: 'MEDIUM',
      itPriority: 'HIGH',
      status: 'OPEN',
      requesterResolvedFlagged: false,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: expect.any(String),
    })
    // A name is enough to recognise a person on a triage list; the email is not exposed (api-spec §2.5).
    expect(res.text).not.toContain(DOMAIN)
  })

  it('is open to Administrators as well', async () => {
    const admin = await createUser('admin', 'IT_STAFF', `Queue Admin ${TAG}`)
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMINISTRATOR' } })

    expect((await queue(`?search=${TAG}`, admin.id)).status).toBe(200)
  })
})

describe('API-44 the default ordering (AC-29, BR-61, exit criterion)', () => {
  it('is IT Priority descending, then Ticket Date ascending, then id ascending', async () => {
    const res = await scoped()

    expect(res.body.meta).toMatchObject({ sortBy: 'itPriority', sortOrder: 'desc', pageSize: 20 })
    expect(keysOf(res.body.data).filter((key) => !key.startsWith('other'))).toEqual([
      'urgentNew',
      'highNewOldest',
      'highOpenMine',
      'highWaitingMine',
      'mediumClosed',
      'lowFlagged',
    ])
  })

  it('is byte-identical across repeated requests, scoped and across the whole Queue', async () => {
    const first = await scoped()
    const second = await scoped()
    expect(second.text).toBe(first.text)

    const wholeFirst = await queue('?pageSize=50')
    const wholeSecond = await queue('?pageSize=50')
    expect(wholeFirst.status).toBe(200)
    expect(wholeSecond.text).toBe(wholeFirst.text)
  })

  it.each([
    ['ticketNumber', 'asc', ['urgentNew', 'highOpenMine', 'highNewOldest', 'lowFlagged', 'highWaitingMine', 'mediumClosed']],
    ['createdAt', 'asc', ['highNewOldest', 'highOpenMine', 'highWaitingMine', 'lowFlagged', 'mediumClosed', 'urgentNew']],
    ['itPriority', 'asc', ['lowFlagged', 'mediumClosed', 'highNewOldest', 'highOpenMine', 'highWaitingMine', 'urgentNew']],
    ['status', 'asc', ['urgentNew', 'highNewOldest', 'highOpenMine', 'lowFlagged', 'highWaitingMine', 'mediumClosed']],
  ])('sorts by %s %s by severity or lifecycle, with id as the tiebreaker', async (sortBy, sortOrder, expected) => {
    const res = await scoped(`&sortBy=${sortBy}&sortOrder=${sortOrder}&pageSize=50`)

    expect(res.status).toBe(200)
    expect(keysOf(res.body.data).filter((key) => !key.startsWith('other'))).toEqual(expected)
    expect(res.body.meta).toMatchObject({ sortBy, sortOrder })
  })

  it('accepts updatedAt as a sort field', async () => {
    expect((await scoped('&sortBy=updatedAt&sortOrder=desc')).status).toBe(200)
  })
})

describe('API-45 – API-47 search (AC-30, BR-59)', () => {
  it('API-45 finds exactly one Ticket by its full Ticket Number', async () => {
    const res = await queue(`?search=${fixture.lowFlagged.ticketNumber}`)

    expect(res.body.data.map((row: QueueRow) => row.id)).toEqual([fixture.lowFlagged.id])
    expect(res.body.meta.totalItems).toBe(1)
  })

  it('API-46 matches a Summary fragment in the opposite letter case', async () => {
    const res = await queue(`?search=${encodeURIComponent('PRINTER JAMS on DUPLEX')}`)

    expect(res.body.data.map((row: QueueRow) => row.id)).toContain(fixture.highOpenMine.id)
    for (const row of res.body.data) expect(row.summary.toLowerCase()).toContain('printer jams on duplex')
  })

  it('API-47 matches a Requester’s name fragment', async () => {
    const res = await queue(`?search=${encodeURIComponent(`borisut ${TAG.toLowerCase()}`)}&pageSize=50`)

    expect(new Set(keysOf(res.body.data))).toEqual(new Set(['highNewOldest', 'lowFlagged', 'mediumClosed']))
  })
})

describe('API-48 status set and IT Priority combine (AC-31, BR-60)', () => {
  it('returns Tickets that are NEW or OPEN and HIGH — nothing else', async () => {
    const res = await scoped('&status=NEW&status=OPEN&itPriority=HIGH')

    expect(keysOf(res.body.data)).toEqual(['highNewOldest', 'highOpenMine'])
    for (const row of res.body.data) {
      expect(['NEW', 'OPEN']).toContain(row.status)
      expect(row.itPriority).toBe('HIGH')
    }
  })

  it('filters on requestedPriority, categoryId, and relatedSystemId', async () => {
    const res = await scoped(`&requestedPriority=MEDIUM&categoryId=${categoryId}&relatedSystemId=${relatedSystemId}&pageSize=50`)
    expect(res.body.data).toHaveLength(6)
    expect((await scoped('&requestedPriority=URGENT')).body.data).toEqual([])
  })
})

describe('API-49 – API-51 owner and resolution-flag filters (AC-32, FR-20, BR-46)', () => {
  it('API-49 assignee=unassigned returns only Tickets with no owner', async () => {
    const res = await scoped('&assignee=unassigned')

    expect(keysOf(res.body.data)).toEqual(['urgentNew', 'highNewOldest'])
    for (const row of res.body.data) expect(row.assignee).toBeNull()
  })

  it('API-50 assignee=me returns only the caller’s Tickets', async () => {
    const res = await scoped('&assignee=me')

    expect(keysOf(res.body.data)).toEqual(['highOpenMine', 'highWaitingMine'])
    for (const row of res.body.data) expect(row.assignee.id).toBe(staff.id)

    // "me" is whoever is calling.
    const asSecond = await queue(`?search=${TAG}&assignee=me`, staff2.id)
    expect(keysOf(asSecond.body.data)).toEqual(['mediumClosed', 'lowFlagged'])
  })

  it('filters by an explicit owner id', async () => {
    const res = await scoped(`&assignee=${staff2.id}`)
    expect(keysOf(res.body.data)).toEqual(['mediumClosed', 'lowFlagged'])
  })

  it('API-51 flaggedResolved=true returns only Requester-flagged Tickets, and false the rest', async () => {
    const flagged = await scoped('&flaggedResolved=true')
    expect(keysOf(flagged.body.data)).toEqual(['lowFlagged'])
    expect(flagged.body.data[0].requesterResolvedFlagged).toBe(true)

    const unflagged = await scoped('&flaggedResolved=false')
    expect(keysOf(unflagged.body.data)).not.toContain('lowFlagged')
    expect(unflagged.body.data).toHaveLength(5)
  })
})

describe('API-52 pagination (AC-33, BR-62)', () => {
  it('splits 25 Tickets into 20 and 5 at the default page size', async () => {
    const first = await queue(`?search=${PAGE_TAG}`)
    expect(first.body.data).toHaveLength(20)
    expect(first.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 25, totalPages: 2, sortBy: 'itPriority', sortOrder: 'desc' })

    const second = await queue(`?search=${PAGE_TAG}&page=2`)
    expect(second.body.data).toHaveLength(5)
    expect(second.body.meta).toMatchObject({ page: 2, totalItems: 25, totalPages: 2 })

    // No row repeats or goes missing across the two pages.
    const ids = [...first.body.data, ...second.body.data].map((row: QueueRow) => row.id)
    expect(new Set(ids).size).toBe(25)
  })

  it('honours the other permitted page sizes', async () => {
    expect((await queue(`?search=${PAGE_TAG}&pageSize=10`)).body.data).toHaveLength(10)
    expect((await queue(`?search=${PAGE_TAG}&pageSize=50`)).body.data).toHaveLength(25)
  })
})

describe('API-53 invalid parameters (AC-34, BR-63)', () => {
  it.each([
    ['pageSize=999', 'pageSize'],
    ['page=abc', 'page'],
    ['sortBy=secret', 'sortBy'],
    ['status=NONSENSE', 'status'],
    ['status=NEW&status=NONSENSE', 'status'],
    ['assignee=nobody', 'assignee'],
    ['itPriority=CRITICAL', 'itPriority'],
    ['flaggedResolved=maybe', 'flaggedResolved'],
    ['sortOrder=sideways', 'sortOrder'],
  ])('answers ?%s with 400 INVALID_QUERY_PARAMETER naming %s', async (query, parameter) => {
    const res = await queue(`?${query}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_QUERY_PARAMETER')
    expect(res.body.error.message).toContain(parameter)
    expect(res.body).not.toHaveProperty('data')
  })
})

describe('API-54 a page past the end (AC-35, BR-62)', () => {
  it('is 200 with an empty page and correct metadata', async () => {
    const res = await queue(`?search=${PAGE_TAG}&page=9`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      data: [],
      meta: { page: 9, pageSize: 20, totalItems: 25, totalPages: 2, sortBy: 'itPriority', sortOrder: 'desc' },
    })
  })

  it('is an empty result, not an error, when nothing matches', async () => {
    const res = await queue(`?search=${TAG}-matches-nothing`)

    expect(res.status).toBe(200)
    expect(res.body.meta).toMatchObject({ totalItems: 0, totalPages: 0 })
  })
})
