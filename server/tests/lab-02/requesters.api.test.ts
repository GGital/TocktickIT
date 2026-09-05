import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

afterAll(() => prisma.$disconnect())

describe('API-03 GET /api/requesters (AC-01, BR-09, BR-47)', () => {
  it('returns the active development requesters, ordered by name', async () => {
    const res = await request(app).get('/api/requesters')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(4)

    const names = res.body.map((requester: { fullName: string }) => requester.fullName)
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)))
    expect(res.body[0]).toEqual({
      id: expect.any(Number),
      fullName: expect.any(String),
      email: expect.any(String),
      department: expect.any(String),
    })
  })

  it('excludes the seeded inactive requester and never leaks isActive', async () => {
    const inactive = await prisma.requesterUser.findFirst({ where: { isActive: false } })
    expect(inactive, 'the seed must provide an inactive requester (BR-46)').not.toBeNull()

    const res = await request(app).get('/api/requesters')
    const ids = res.body.map((requester: { id: number }) => requester.id)

    expect(ids).not.toContain(inactive!.id)
    for (const requester of res.body) {
      expect(requester).not.toHaveProperty('isActive')
    }
  })
})
