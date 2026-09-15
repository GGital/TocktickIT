import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'
import { signInSeededUser, signOutAll } from '../helpers/session.js'

// Lab 3: reference data requires an authenticated session (api-spec §3.5).
let cookie: string
beforeAll(async () => {
  cookie = await signInSeededUser()
})

afterAll(async () => {
  await signOutAll()
  await prisma.$disconnect()
})

describe('API-02 GET /api/categories', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the four seeded categories in id order', async () => {
    const res = await request(app).get('/api/categories').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(4)
    expect(res.body.map((category: { name: string }) => category.name)).toEqual([
      'Account and Access',
      'Hardware',
      'Software',
      'Network',
    ])
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: 'Account and Access' })
  })

  it('reports a database failure through the Lab 2 error envelope', async () => {
    // A-14: the Lab 1 shape { "error": "text" } is replaced by the envelope so the
    // client has one parser. The message stays safe — no stack trace, SQL, or path (BR-22).
    vi.spyOn(prisma.category, 'findMany').mockRejectedValue(new Error('connect ECONNREFUSED'))

    const res = await request(app).get('/api/categories').set('Cookie', cookie)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    })
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|ECONNREFUSED|at .*\.ts:/i)
  })
})
