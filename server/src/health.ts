import type { Request, Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { ERROR_STATUS } from './errors.js'

const PROBE_TIMEOUT_MS = 2_000

/**
 * `GET /api/health` (api-spec §3.12, BR-84): the API answers, and a `SELECT 1` comes back within 2 s. The client is
 * a parameter so a test can point the probe at an unreachable database. The response never carries a version,
 * host, driver message, or connection string; the reason goes to the server log only.
 */
export const health = (client: PrismaClient) => async (_req: Request, res: Response) => {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Database probe exceeded ${PROBE_TIMEOUT_MS} ms`)), PROBE_TIMEOUT_MS)
      }),
    ])
    res.json({ status: 'ok', service: 'TokTickIT API', database: 'ok' })
  } catch (error) {
    console.error('Health probe failed', error)
    res.status(ERROR_STATUS.SERVICE_UNAVAILABLE).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      status: 'degraded',
      database: 'unavailable',
    })
  } finally {
    clearTimeout(timer)
  }
}
