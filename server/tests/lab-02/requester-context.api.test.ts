import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

// Any requester-scoped path exercises the middleware: it runs before route matching.
const scopedPath = '/api/tickets'

let inactiveRequesterId: number
let unknownRequesterId: number

beforeAll(async () => {
  const inactive = await prisma.requesterUser.findFirst({ where: { isActive: false } })
  if (!inactive) throw new Error('The seed must provide an inactive requester (BR-46)')
  inactiveRequesterId = inactive.id

  const highest = await prisma.requesterUser.findFirst({ orderBy: { id: 'desc' } })
  unknownRequesterId = (highest?.id ?? 0) + 1000
})

afterAll(() => prisma.$disconnect())

describe('API-05 missing requester context (BR-11)', () => {
  it('rejects a requester-scoped request that carries no X-Requester-Id', async () => {
    const res = await request(app).get(scopedPath)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('REQUESTER_CONTEXT_MISSING')
    expect(res.body.error.message).toEqual(expect.any(String))
    expect(res.body.error).not.toHaveProperty('fields')
  })
})

describe('API-06 malformed requester context (BR-11)', () => {
  it.each(['abc', '-1', '0', '', '1.5'])('rejects X-Requester-Id: %s', async (value) => {
    const res = await request(app).get(scopedPath).set('X-Requester-Id', value)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('REQUESTER_CONTEXT_MISSING')
  })
})

describe('API-07 unknown and inactive requester context (AC-07, BR-47)', () => {
  it('rejects an id that matches no requester', async () => {
    const res = await request(app)
      .get(scopedPath)
      .set('X-Requester-Id', String(unknownRequesterId))

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('REQUESTER_CONTEXT_INVALID')
  })

  it('rejects the seeded inactive requester with the identical response', async () => {
    const unknown = await request(app)
      .get(scopedPath)
      .set('X-Requester-Id', String(unknownRequesterId))
    const inactive = await request(app)
      .get(scopedPath)
      .set('X-Requester-Id', String(inactiveRequesterId))

    expect(inactive.status).toBe(403)
    expect(inactive.body).toEqual(unknown.body)
  })
})

describe('API-08 no endpoint answers 401 (BR-08, BR-50)', () => {
  it('never returns 401 across the requester-context failure matrix', async () => {
    const responses = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/categories'),
      request(app).get('/api/related-systems'),
      request(app).get('/api/requesters'),
      request(app).get(scopedPath),
      request(app).get(scopedPath).set('X-Requester-Id', 'abc'),
      request(app).get(scopedPath).set('X-Requester-Id', '-1'),
      request(app).get(scopedPath).set('X-Requester-Id', String(unknownRequesterId)),
      request(app).get(scopedPath).set('X-Requester-Id', String(inactiveRequesterId)),
      request(app).get('/api/attachments/1/download'),
      request(app).delete('/api/attachments/1'),
    ])

    expect(responses.map((res) => res.status)).not.toContain(401)
  })

  it('sends no-store on every API response, including failures', async () => {
    const res = await request(app).get(scopedPath)

    expect(res.headers['cache-control']).toBe('no-store')
  })
})
