import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../../src/prisma.js'

// Rows created here are deleted again so the suite is re-runnable against a seeded database.
const inactiveCategoryName = 'ZZ Inactive Test Category'
const inactiveSystemName = 'ZZ Inactive Test System'

afterAll(async () => {
  await prisma.category.deleteMany({ where: { name: inactiveCategoryName } })
  await prisma.relatedSystem.deleteMany({ where: { name: inactiveSystemName } })
  await prisma.$disconnect()
})

describe('API-01 GET /api/categories (AC-10, BR-45)', () => {
  it('returns the four seeded categories in id order', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: expect.any(Number), name: 'Account and Access' },
      { id: expect.any(Number), name: 'Hardware' },
      { id: expect.any(Number), name: 'Software' },
      { id: expect.any(Number), name: 'Network' },
    ])
  })

  it('never returns an inactive category', async () => {
    await prisma.category.create({ data: { name: inactiveCategoryName, isActive: false } })

    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    expect(res.body.map((category: { name: string }) => category.name)).not.toContain(
      inactiveCategoryName,
    )
  })

  it('forbids caching so one requester never sees another requester data', async () => {
    const res = await request(app).get('/api/categories')

    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('API-02 GET /api/related-systems (AC-10, BR-45)', () => {
  it('returns at least the seven seeded systems in alphabetical order', async () => {
    const res = await request(app).get('/api/related-systems')

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(7)

    const names = res.body.map((system: { name: string }) => system.name)
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)))
    expect(names).toEqual(expect.arrayContaining(['Email', 'Campus Wi-Fi', 'VPN', 'Printer']))
    expect(res.body[0]).toEqual({ id: expect.any(Number), name: expect.any(String) })
  })

  it('never returns an inactive related system', async () => {
    await prisma.relatedSystem.create({ data: { name: inactiveSystemName, isActive: false } })

    const res = await request(app).get('/api/related-systems')

    expect(res.body.map((system: { name: string }) => system.name)).not.toContain(
      inactiveSystemName,
    )
  })
})
