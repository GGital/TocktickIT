import type { Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { sendError } from './errors.js'
import { prisma } from './prisma.js'
import { parseQueueQuery } from './queueQuery.js'
import { QueryParameterError } from './ticketQuery.js'

/** QueueTicketSummary (api-spec §2.5): a name identifies the Requester; no email on a triage list. */
const queueSelect = {
  id: true,
  ticketNumber: true,
  summary: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, fullName: true } },
  assignee: { select: { id: true, fullName: true } },
  requestedPriority: true,
  itPriority: true,
  status: true,
  requesterResolvedFlaggedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

/**
 * `GET /api/staff/tickets` (api-spec §3.9). Mounted under /api/staff, so only IT Staff and Administrators reach it.
 * Search, filters, sort, and paging all run in the database (BR-59).
 */
export async function listQueue(req: Request, res: Response) {
  let query
  try {
    query = parseQueueQuery(req.query as Record<string, unknown>, req.user!.id)
  } catch (error) {
    if (error instanceof QueryParameterError) return sendError(res, 'INVALID_QUERY_PARAMETER', error.message)
    throw error
  }

  // Every filter combines with AND; only the status set and the search fields are ORs within themselves (BR-60).
  const where: Prisma.TicketWhereInput = {
    ...(query.statuses ? { status: { in: query.statuses } } : {}),
    ...(query.itPriority ? { itPriority: query.itPriority } : {}),
    ...(query.requestedPriority ? { requestedPriority: query.requestedPriority } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.relatedSystemId ? { relatedSystemId: query.relatedSystemId } : {}),
    ...(query.assigneeId !== undefined ? { assigneeId: query.assigneeId } : {}),
    ...(query.flaggedResolved !== undefined
      ? { requesterResolvedFlaggedAt: query.flaggedResolved ? { not: null } : null }
      : {}),
    ...(query.search
      ? {
          OR: [
            { ticketNumber: { contains: query.search, mode: 'insensitive' } },
            { summary: { contains: query.search, mode: 'insensitive' } },
            { requester: { fullName: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [totalItems, rows] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: query.orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: queueSelect,
    }),
  ])

  res.json({
    // A page past the end is an empty page with correct metadata, not an error (BR-62).
    data: rows.map(({ requesterResolvedFlaggedAt, ...row }) => ({
      ...row,
      requesterResolvedFlagged: requesterResolvedFlaggedAt !== null,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    },
  })
}
