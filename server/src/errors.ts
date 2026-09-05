import type { Response } from 'express'

/**
 * Error code catalogue (api-spec §1.3). The status belongs to the code, so a
 * handler names the code and can never pair it with the wrong status.
 * `401` is deliberately absent: Lab 2 has no authentication (BR-08, BR-50).
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  INVALID_QUERY_PARAMETER: 400,
  INVALID_PATH_PARAMETER: 400,
  REQUESTER_CONTEXT_MISSING: 400,
  NO_FILE_UPLOADED: 400,
  REQUESTER_CONTEXT_INVALID: 403,
  TICKET_NOT_FOUND: 404,
  ATTACHMENT_NOT_FOUND: 404,
  DUPLICATE_SUBMISSION: 409,
  ATTACHMENT_LIMIT_REACHED: 409,
  ALREADY_REMOVED: 409,
  ATTACHMENT_REMOVED: 410,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  INTERNAL_ERROR: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS
export type FieldError = { field: string; message: string }

/**
 * The single error envelope (api-spec §1.2). `message` is safe human text only —
 * stack traces, SQL, paths, and Prisma internals stay in the server log (BR-22).
 */
export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  fields?: FieldError[],
) {
  res.status(ERROR_STATUS[code]).json({
    error: { code, message, ...(fields ? { fields } : {}) },
  })
}
