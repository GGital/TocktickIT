import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { signIn, signOutAll } from '../helpers/session.js'

/**
 * Lab 2 API-05 – API-08 tested the X-Requester-Id selector context. Lab 3 retires that header (BR-57), so each
 * test is replaced by its authenticated equivalent rather than deleted (BR-58). The full route-by-route proof
 * lives in tests/lab-03/authorization.api.test.ts (API-31).
 */

// Any requester-scoped path exercises the stack: it runs before route matching.
const scopedPath = '/api/tickets'

let activeRequesterId: number
let inactiveCookie: string

beforeAll(async () => {
  const active = await prisma.user.findFirst({ where: { isActive: true, role: 'REQUESTER' } })
  const inactive = await prisma.user.findFirst({ where: { isActive: false } })
  if (!active || !inactive) throw new Error('The seed must provide an active and an inactive user (BR-56)')
  activeRequesterId = active.id
  // A session row for an inactive account: it can exist only if deactivation ever failed to revoke it.
  inactiveCookie = await signIn(inactive.id)
})

afterAll(async () => {
  await signOutAll()
  await prisma.$disconnect()
})

describe('API-05 (Lab 3) missing identity is 401 UNAUTHENTICATED', () => {
  it('rejects a requester-scoped request that carries no session', async () => {
    const res = await request(app).get(scopedPath)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(res.body.error.message).toEqual(expect.any(String))
    expect(res.body.error).not.toHaveProperty('fields')
  })
})

describe('API-06 (Lab 3) the retired header never authenticates (BR-18, BR-57)', () => {
  it.each(['abc', '-1', '0', '', '1.5'])('rejects X-Requester-Id: %s as unauthenticated', async (value) => {
    const res = await request(app).get(scopedPath).set('X-Requester-Id', value)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects a header naming a real, active Requester', async () => {
    const res = await request(app).get(scopedPath).set('X-Requester-Id', String(activeRequesterId))

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('API-07 (Lab 3) unknown and inactive identities are indistinguishable (BR-01, BR-04)', () => {
  it('answers a session of an inactive user exactly like an unknown session', async () => {
    const unknown = await request(app).get(scopedPath).set('Cookie', `toktickit.sid=${'A'.repeat(43)}`)
    const inactive = await request(app).get(scopedPath).set('Cookie', inactiveCookie)

    expect(inactive.status).toBe(401)
    expect(inactive.body).toEqual(unknown.body)
  })
})

describe('API-08 (Lab 3) 401 now means unauthenticated, and failures are never cached', () => {
  it('keeps health public while reference data and requester routes require a session', async () => {
    const [health, categories, relatedSystems, tickets, download, remove] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/categories'),
      request(app).get('/api/related-systems'),
      request(app).get(scopedPath),
      request(app).get('/api/attachments/1/download'),
      request(app).delete('/api/attachments/1'),
    ])

    expect(health.status).toBe(200)
    expect([categories, relatedSystems, tickets, download, remove].map((res) => res.status)).toEqual([
      401, 401, 401, 401, 401,
    ])
  })

  it('sends no-store on every API response, including failures', async () => {
    const res = await request(app).get(scopedPath)

    expect(res.headers['cache-control']).toBe('no-store')
  })
})
