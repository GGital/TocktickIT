import { randomUUID } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import app from '../../src/app.js'
import { health } from '../../src/health.js'
import { prisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const DOMAIN = '@lab4-hardening-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()
// Port 1 on loopback: nothing listens, so every connection attempt is refused.
const UNREACHABLE = 'postgresql://probe:not-a-real-secret@127.0.0.1:1/toktickit_unreachable'
const SAFE_500 = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }

let staffId: number
let ticketId: number
let unreachable: PrismaClient

beforeAll(async () => {
  const requester = await prisma.user.create({
    data: { email: `requester${DOMAIN}`, fullName: 'Hardening Requester', role: 'REQUESTER', passwordHash: 'unusable-fixture', mustChangePassword: false },
  })
  const staff = await prisma.user.create({
    data: { email: `staff${DOMAIN}`, fullName: 'Hardening Staff', role: 'IT_STAFF', passwordHash: 'unusable-fixture', mustChangePassword: false },
  })
  staffId = staff.id
  await signIn(staffId)
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-HARD-${RUN}`,
      requesterId: requester.id,
      categoryId: (await prisma.category.findFirstOrThrow()).id,
      relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow()).id,
      summary: 'Hardening fixture',
      description: 'Holds the forced-failure action create.',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      status: 'IN_PROGRESS',
      assigneeId: staffId,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  })
  ticketId = ticket.id
  unreachable = new PrismaClient({ datasourceUrl: UNREACHABLE })
})

afterAll(async () => {
  vi.restoreAllMocks()
  await unreachable.$disconnect()
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-75 health with the database up (AC-48, BR-84)', () => {
  it('is 200 with status and database ok, without a session', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API', database: 'ok' })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('API-76 health with the database unreachable (AC-48, BR-84)', () => {
  it('is 503 SERVICE_UNAVAILABLE with database unavailable, and no host, driver, or stack text', async () => {
    const probeApp = express().get('/api/health', health(unreachable))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const started = Date.now()
    const res = await request(probeApp).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      status: 'degraded',
      database: 'unavailable',
    })
    for (const leak of ['127.0.0.1', 'toktickit_unreachable', 'probe', 'not-a-real-secret', 'Prisma', 'ECONNREFUSED', 'at ']) {
      expect(res.text).not.toContain(leak)
    }
    // Answered within the documented 2 s budget, plus a margin for the test runner.
    expect(Date.now() - started).toBeLessThan(3_000)
    logged.mockRestore()
  })

  it('is 503 when the probe takes longer than 2 s', async () => {
    const slow = { $queryRaw: () => new Promise(() => undefined) } as unknown as PrismaClient
    const probeApp = express().get('/api/health', health(slow))

    const started = Date.now()
    const res = await request(probeApp).get('/api/health')

    expect(res.status).toBe(503)
    expect(res.body.database).toBe('unavailable')
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_900)
  })
})

describe('API-77 a forced Prisma failure inside an action create (BR-80)', () => {
  it('answers only the safe 500 message, and writes nothing', async () => {
    const internal = new Prisma.PrismaClientUnknownRequestError('Can\'t reach database server at `db-internal.toktickit:5432` (ECONNRESET)', {
      clientVersion: Prisma.prismaVersion.client,
    })
    const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(internal)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set('Cookie', asUser(staffId))
      .send({
        clientRequestId: randomUUID(),
        actionAt: new Date(Date.now() - 60_000).toISOString(),
        description: 'This write is made to fail inside Prisma.',
        result: 'Never stored.',
        followUpRequired: false,
      })

    expect(transaction).toHaveBeenCalled()
    expect(res.status).toBe(500)
    expect(res.body).toEqual(SAFE_500)
    for (const leak of ['db-internal', '5432', 'ECONNRESET', 'Prisma', 'at ']) expect(res.text).not.toContain(leak)
    // The detail goes to the server log only.
    expect(logged).toHaveBeenCalled()
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(0)
    logged.mockRestore()
  })
})
