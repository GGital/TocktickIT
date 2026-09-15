import type { NextFunction, Request, Response } from 'express'
import type { User } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      requester?: User
    }
  }
}

/**
 * Lab 2 handlers read `req.requester`; Lab 3 fills it from the authenticated session user, so ownership
 * predicates keep their shape with a different source for the id (BR-18, Lab 2 BR-48). The X-Requester-Id
 * header is never read. #48 retires this bridge.
 */
export function requesterContext(req: Request, _res: Response, next: NextFunction) {
  req.requester = req.user
  next()
}
