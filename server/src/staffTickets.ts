import type { Request, Response } from 'express'
import type { Prisma, TicketStatus } from '@prisma/client'
import { sendError, type FieldError } from './errors.js'
import { prisma } from './prisma.js'
import { parseQueueQuery, STATUSES } from './queueQuery.js'
import { isPermittedTransition } from './statusTransition.js'
import { PRIORITIES, QueryParameterError } from './ticketQuery.js'
import { findTicketDetail, parseId } from './tickets.js'

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

// --- One Ticket's operations (api-spec §3.10 – §3.13, §3.16). The /api/staff role guard has already run. ---

const OWNER_ROLES = ['IT_STAFF', 'ADMINISTRATOR'] as const
/** A staff transition to one of these clears the Requester's "appears resolved" flag (BR-46). */
const CLEARS_FLAG: readonly TicketStatus[] = ['RESOLVED', 'CLOSED', 'REOPENED']
const MAX_INT4 = 2_147_483_647

const invalidId = (res: Response) =>
  sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
const notFound = (res: Response) => sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')

/**
 * Reads the one field an operation accepts. Any other key fails validation rather than being ignored — above all
 * `requestedPriority`, which is immutable and must fail loudly (BR-31).
 */
function readField(body: unknown, field: string, isValid: (value: unknown) => boolean, message: string) {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const errors: FieldError[] = Object.keys(input)
    .filter((key) => key !== field)
    .map((key) => ({
      field: key,
      message:
        key === 'requestedPriority'
          ? 'Requested Priority is set by the requester and cannot be changed.'
          : 'This value cannot be changed here.',
    }))
  if (!(field in input) || !isValid(input[field])) errors.unshift({ field, message })
  return { value: input[field], errors }
}

/** `GET /api/staff/tickets/:id` — any Requester's Ticket (BR-21). */
export async function getStaffTicket(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const ticket = await findTicketDetail({ id })
  if (!ticket) return notFound(res)
  res.json(ticket)
}

/** `PATCH /api/staff/tickets/:id/assignment` — claim ("me"), assign, reassign, or unassign (null) (BR-26 – BR-29). */
export async function updateAssignment(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  // The key must be present: unassigning is `null`, never an omission.
  const { value, errors } = readField(
    req.body,
    'assigneeId',
    (v) => v === null || v === 'me' || (Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_INT4),
    'Choose who should own this ticket.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The owner was not changed.', errors)
  const assigneeId = value === 'me' ? req.user!.id : (value as number | null)

  if (!(await prisma.ticket.findUnique({ where: { id }, select: { id: true } }))) return notFound(res)

  if (assigneeId !== null) {
    const eligible = await prisma.user.findFirst({
      where: { id: assigneeId, isActive: true, role: { in: [...OWNER_ROLES] } },
      select: { id: true },
    })
    if (!eligible) {
      return sendError(res, 'INVALID_ASSIGNEE', 'Only an active IT Staff member or Administrator can own a ticket.')
    }
  }

  // One transaction; the NEW condition sits inside the update, so a concurrent status change is never
  // overwritten with OPEN (BR-29). Unassigning never changes the status.
  await prisma.$transaction([
    ...(assigneeId !== null
      ? [prisma.ticket.updateMany({ where: { id, status: 'NEW' }, data: { status: 'OPEN' } })]
      : []),
    prisma.ticket.update({ where: { id }, data: { assigneeId }, select: { id: true } }),
  ])

  res.json(await findTicketDetail({ id }))
}

/** `PATCH /api/staff/tickets/:id/priority` — IT Priority only (BR-31, BR-32). */
export async function updatePriority(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { value, errors } = readField(
    req.body,
    'itPriority',
    (v) => (PRIORITIES as readonly unknown[]).includes(v),
    'Choose an IT priority.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The IT priority was not changed.', errors)

  const { count } = await prisma.ticket.updateMany({
    where: { id },
    data: { itPriority: value as (typeof PRIORITIES)[number] },
  })
  if (count === 0) return notFound(res)

  res.json(await findTicketDetail({ id }))
}

/** `PATCH /api/staff/tickets/:id/status` — the transition matrix, enforced (BR-30, BR-35, BR-36, BR-46). */
export async function updateStatus(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  // An unknown value is a malformed request (400); a known but refused one is a conflict (409).
  const { value, errors } = readField(
    req.body,
    'status',
    (v) => (STATUSES as readonly unknown[]).includes(v),
    'Choose a status.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The status was not changed.', errors)
  const to = value as TicketStatus

  for (;;) {
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { status: true, assigneeId: true } })
    if (!ticket) return notFound(res)

    const assigned = ticket.assigneeId !== null
    if (!isPermittedTransition(ticket.status, to, assigned)) {
      const reason = isPermittedTransition(ticket.status, to, true) ? ' until it has an owner' : ''
      return sendError(
        res,
        'INVALID_STATUS_TRANSITION',
        `This ticket cannot move from ${ticket.status} to ${to}${reason}.`,
      )
    }

    // The status and owner just judged are conditions of the write: if either changed meanwhile, nothing is
    // written and the request is judged again against the new state.
    const { count } = await prisma.ticket.updateMany({
      where: { id, status: ticket.status, assigneeId: ticket.assigneeId },
      data: { status: to, ...(CLEARS_FLAG.includes(to) ? { requesterResolvedFlaggedAt: null } : {}) },
    })
    if (count === 1) break
  }

  res.json(await findTicketDetail({ id }))
}

/** `GET /api/staff/assignees` — active IT Staff and Administrators, alphabetical (api-spec §3.16, BR-27). */
export async function listAssignees(_req: Request, res: Response) {
  res.json(
    await prisma.user.findMany({
      where: { isActive: true, role: { in: [...OWNER_ROLES] } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: { id: true, fullName: true, role: true },
    }),
  )
}
