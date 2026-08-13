import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'

describe('API-02 GET /api/categories', () => {
  it('returns the four seeded categories in id order', async () => {
    const res = await request(app).get('/api/categories')

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
})
