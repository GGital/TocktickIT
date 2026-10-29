import { randomUUID } from 'node:crypto'
import type { Express } from 'express'
import type { PrismaClient, TicketStatus } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMigratedDatabase, dropDatabase } from '../helpers/database.js'

/**
 * PERF-01 and PERF-03 (tests.md §1.3): 2,000 Tickets and 6,000 actions in a database of their own, so the timings
 * neither depend on nor disturb what other suites leave behind.
 */
const PERF_DB = 'toktickit_lab4_perf'
const TICKETS = 2_000
const ACTIONS_PER_TICKET = 3
// PERF-02: one Ticket also carries a long work log.
const LONG_LOG = 50
const CALLS = 20
const BUDGET_MS = 500
const STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const DAY = 24 * 60 * 60 * 1000

let app: Express
let prisma: PrismaClient
let cookieFor: (userId: number) => string
let longLogTicketId: number
const users = { requester: 0, staff: 0, other: 0, admin: 0 }

beforeAll(async () => {
  // The app's Prisma client reads DATABASE_URL when first imported, so point it at the isolated database first.
  process.env.DATABASE_URL = createMigratedDatabase(PERF_DB)
  app = (await import('../../src/app.js')).default
  prisma = (await import('../../src/prisma.js')).prisma
  const session = await import('../helpers/session.js')

  for (const role of Object.keys(users) as (keyof typeof users)[]) {
    const user = await prisma.user.create({
      data: {
        email: `${role}@perf.toktickit.test`,
        fullName: `Perf ${role}`,
        role: role === 'admin' ? 'ADMINISTRATOR' : role === 'requester' ? 'REQUESTER' : 'IT_STAFF',
        passwordHash: 'unusable-fixture',
        mustChangePassword: false,
      },
    })
    users[role] = user.id
    await session.signIn(user.id)
  }
  cookieFor = session.asUser

  const category = await prisma.category.create({ data: { name: 'Perf category' } })
  const system = await prisma.relatedSystem.create({ data: { name: 'Perf system' } })
  const now = Date.now()
  await prisma.ticket.createMany({
    data: Array.from({ length: TICKETS }, (_, i) => {
      const status = STATUSES[i % STATUSES.length]
      return {
        ticketNumber: `TKT-PERF-${String(i).padStart(6, '0')}`,
        requesterId: users.requester,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: `Performance fixture ticket number ${i}`,
        description: 'Bulk-inserted for the Lab 4 performance smoke test.',
        requestedPriority: PRIORITIES[i % 4],
        itPriority: PRIORITIES[(i + 1) % 4],
        status,
        assigneeId: [null, users.staff, users.other][i % 3],
        requesterResolvedFlaggedAt: i % 17 === 0 ? new Date(now) : null,
        resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date(now - (i % 14) * DAY) : null,
        createdAt: new Date(now - (i % 60) * DAY),
        publicActivityAt: new Date(now - (i % 30) * DAY),
      }
    }),
  })

  const tickets = await prisma.ticket.findMany({ select: { id: true, createdAt: true } })
  await prisma.actionTaken.createMany({
    data: tickets.flatMap((ticket, i) =>
      Array.from({ length: ACTIONS_PER_TICKET }, (_, n) => {
        const performedById = n % 2 === 0 ? users.staff : users.other
        const voided = (i + n) % 11 === 0
        const followUp = (i + n) % 5 === 0
        return {
          ticketId: ticket.id,
          clientRequestId: randomUUID(),
          actionAt: ticket.createdAt,
          description: `Bulk action ${n} on ticket ${ticket.id}`,
          result: 'Bulk result.',
          followUpRequired: followUp,
          followUpNote: followUp ? 'Bulk follow-up.' : null,
          performedById,
          ...(voided ? { voidedAt: new Date(now), voidedById: performedById, voidReason: 'Bulk void.' } : {}),
        }
      }),
    ),
  })

  longLogTicketId = tickets[0].id
  await prisma.actionTaken.createMany({
    data: Array.from({ length: LONG_LOG }, (_, n) => ({
      ticketId: longLogTicketId,
      clientRequestId: randomUUID(),
      actionAt: new Date(now - (LONG_LOG - n) * 60_000),
      description: `Long work log entry ${n}`,
      result: 'Logged.',
      followUpRequired: false,
      performedById: users.staff,
    })),
  })
}, 300_000)

afterAll(async () => {
  await prisma?.$disconnect()
  dropDatabase(PERF_DB)
}, 60_000)

/** p95 of `CALLS` sequential requests, and the largest body seen. */
async function measure(path: string, userId: number) {
  const timings: number[] = []
  let largest = 0
  for (let i = 0; i < CALLS; i += 1) {
    const started = performance.now()
    const res = await request(app).get(path).set('Cookie', cookieFor(userId))
    timings.push(performance.now() - started)
    expect(res.status, res.text).toBe(200)
    largest = Math.max(largest, Buffer.byteLength(res.text))
  }
  timings.sort((a, b) => a - b)
  return { p95: timings[Math.ceil(CALLS * 0.95) - 1], largest }
}

describe('PERF-01 dashboards at 2,000 Tickets / 6,000 actions (A-21, BR-47)', () => {
  it('the data set is in place', async () => {
    expect(await prisma.ticket.count()).toBe(TICKETS)
    expect(await prisma.actionTaken.count()).toBe(TICKETS * ACTIONS_PER_TICKET + LONG_LOG)
  })

  it.each([
    ['/api/dashboard/requester', 'requester'],
    ['/api/staff/dashboard', 'staff'],
    ['/api/staff/dashboard', 'admin'],
  ] as const)('%s as %s: p95 < 500 ms, body < 20 KB', async (path, role) => {
    const { p95, largest } = await measure(path, users[role])
    expect(p95).toBeLessThan(BUDGET_MS)
    expect(largest).toBeLessThan(20 * 1024)
  }, 60_000)
})

describe('PERF-02 the staff action list of a Ticket with 50+ actions (BR-23)', () => {
  it('p95 < 300 ms', async () => {
    const { p95 } = await measure(`/api/staff/tickets/${longLogTicketId}/actions`, users.staff)
    expect(p95).toBeLessThan(300)
  }, 60_000)
})

describe('PERF-03 the Queue with the Lab 4 filters (FR-23)', () => {
  it.each([
    'followUp=outstanding',
    'followUp=mine',
    'status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED',
  ])('?%s: p95 < 500 ms', async (query) => {
    const { p95 } = await measure(`/api/staff/tickets?${query}`, users.staff)
    expect(p95).toBeLessThan(BUDGET_MS)
  }, 60_000)
})
