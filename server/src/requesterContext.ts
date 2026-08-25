import type { NextFunction, Request, Response } from 'express'
import type { RequesterUser } from '@prisma/client'
import { sendError } from './errors.js'
import { prisma } from './prisma.js'

declare global {
  namespace Express {
    interface Request {
      requester?: RequesterUser
    }
  }
}

/**
 * Resolves the simulated Development Requester context (api-spec §1.1, BR-11).
 * This is a testing mechanism, not authentication (BR-08, BR-50) — Lab 3 replaces
 * this one module with an authenticated identity and route handlers stay untouched (BR-48).
 *
 * Missing or malformed header -> 400; unknown or inactive Requester -> 403 (BR-47).
 */
export async function requesterContext(req: Request, res: Response, next: NextFunction) {
  const header = req.header('X-Requester-Id')

  // Digits only: rejects "", "abc", "-1", "1.5", "1e3", and padded values alike.
  if (!header || !/^\d+$/.test(header) || Number(header) <= 0) {
    return sendError(
      res,
      'REQUESTER_CONTEXT_MISSING',
      'Select a requester before using this screen.',
    )
  }

  const requester = await prisma.requesterUser.findFirst({
    where: { id: Number(header), isActive: true },
  })

  if (!requester) {
    return sendError(
      res,
      'REQUESTER_CONTEXT_INVALID',
      'The selected requester is no longer available. Choose a requester again.',
    )
  }

  req.requester = requester
  next()
}
