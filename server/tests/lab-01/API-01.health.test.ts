import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'

describe('API-01 GET /api/health', () => {
  it('returns 200 with status ok and the service name', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    // Lab 4 api-spec §3.12 adds the database probe result to the same body.
    expect(res.body).toEqual({ status: 'ok', service: 'TokTickIT API', database: 'ok' })
  })
})
