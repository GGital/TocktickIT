import type { Request, Response } from 'express'
import type { Prisma, TicketStatus } from '@prisma/client'
import { ERROR_STATUS, sendError, type ErrorCode, type FieldError } from './errors.js'
import { prisma } from './prisma.js'
import { parseQueueQuery, STATUSES } from './queueQuery.js'
import {
  isInMatrix,
  isPermittedTransition,
  resolutionBlockers,
  testHooks,
  workflowState,
  type ActionSummary,
  type ResolutionBlocker,
} from './statusTransition.js'
import { PRIORITIES, QueryParameterError } from './ticketQuery.js'
import { findTicketDetail, parseId } from './tickets.js'
import { followUpTickets, outstandingFollowUp } from './dashboard.js'

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
  // Lab 4 (api-spec §3.10): the follow-up badge.
  _count: { select: { actions: { where: outstandingFollowUp } } },
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
    ...(query.followUp ? followUpTickets(query.followUp === 'mine' ? req.user!.id : undefined) : {}),
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
    data: rows.map(({ requesterResolvedFlaggedAt, _count, ...row }) => ({
      ...row,
      requesterResolvedFlagged: requesterResolvedFlaggedAt !== null,
      // A cancelled Ticket's follow-ups stop counting anywhere (BR-50).
      outstandingFollowUps: row.status === 'CANCELLED' ? 0 : _count.actions,
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

// --- One Ticket's operations (api-spec §3.7 – §3.9). The /api/staff role guard has already run. ---

const OWNER_ROLES = ['IT_STAFF', 'ADMINISTRATOR'] as const
/** A staff transition to one of these clears the Requester's "appears resolved" flag (BR-39). */
const CLEARS_FLAG: readonly TicketStatus[] = ['RESOLVED', 'CLOSED', 'REOPENED']
const MAX_INT4 = 2_147_483_647
const STALE = 'This ticket changed since you opened it. Reload it and try again.'

const invalidId = (res: Response) =>
  sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
const notFound = (res: Response) => sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')
const stale = (res: Response) => sendError(res, 'STALE_TICKET', STALE)

const isVersion = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_INT4

/**
 * Reads the one field an operation accepts plus the required `expectedVersion` (BR-28, BR-78). Any other key fails
 * validation rather than being ignored — above all `requestedPriority`, which is immutable and must fail loudly.
 */
function readField(body: unknown, field: string, isValid: (value: unknown) => boolean, message: string) {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const errors: FieldError[] = []
  if (!(field in input) || !isValid(input[field])) errors.push({ field, message })
  if (!isVersion(input.expectedVersion)) errors.push({ field: 'expectedVersion', message: 'Reload the ticket and try again.' })
  for (const key of Object.keys(input)) {
    if (key === field || key === 'expectedVersion') continue
    errors.push({
      field: key,
      message:
        key === 'requestedPriority'
          ? 'Requested Priority is set by the requester and cannot be changed.'
          : 'This value cannot be changed here.',
    })
  }
  return { value: input[field], expectedVersion: input.expectedVersion as number, errors }
}

/** The work-log counts the resolution gate and the staff detail both read (BR-35, api-spec §2.3). */
async function actionSummary(db: Prisma.TransactionClient, ticketId: number): Promise<ActionSummary> {
  const [total, voided, outstandingFollowUps] = await Promise.all([
    db.actionTaken.count({ where: { ticketId } }),
    db.actionTaken.count({ where: { ticketId, voidedAt: { not: null } } }),
    db.actionTaken.count({ where: { ticketId, followUpRequired: true, followUpCompletedAt: null, voidedAt: null } }),
  ])
  return { total, voided, outstandingFollowUps }
}

/** The staff Ticket detail (api-spec §2.3): the shared detail plus version, activity, work log, and workflow. */
async function findStaffTicketDetail(id: number) {
  // Version first: everything read after it is at least as new, so a write sent with it never overwrites unseen state.
  const head = await prisma.ticket.findUnique({ where: { id }, select: { version: true, publicActivityAt: true } })
  if (!head) return null
  const [ticket, actions] = await Promise.all([findTicketDetail({ id }), actionSummary(prisma, id)])
  if (!ticket) return null
  return {
    ...ticket,
    ...head,
    actionSummary: actions,
    ...workflowState({ status: ticket.status, assigned: ticket.assignee !== null }, actions),
  }
}

/** `GET /api/staff/tickets/:id` — any Requester's Ticket (BR-21). */
export async function getStaffTicket(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const ticket = await findStaffTicketDetail(id)
  if (!ticket) return notFound(res)
  res.json(ticket)
}

/** `PATCH /api/staff/tickets/:id/assignment` — claim ("me"), assign, reassign, or unassign (null) (§3.8). */
export async function updateAssignment(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  // The key must be present: unassigning is `null`, never an omission.
  const { value, expectedVersion, errors } = readField(
    req.body,
    'assigneeId',
    (v) => v === null || v === 'me' || (Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_INT4),
    'Choose who should own this ticket.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The owner was not changed.', errors)
  const assigneeId = value === 'me' ? req.user!.id : (value as number | null)

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { status: true, version: true } })
  if (!ticket) return notFound(res)

  if (assigneeId !== null) {
    const eligible = await prisma.user.findFirst({
      where: { id: assigneeId, isActive: true, role: { in: [...OWNER_ROLES] } },
      select: { id: true },
    })
    if (!eligible) {
      return sendError(res, 'INVALID_ASSIGNEE', 'Only an active IT Staff member or Administrator can own a ticket.')
    }
  }
  if (ticket.version !== expectedVersion) return stale(res)

  // One conditional write, one version step (BR-41): the status read above is trusted only because the version it
  // came with must still hold. Claiming or assigning a NEW Ticket opens it; unassigning never changes the status.
  const { count } = await prisma.ticket.updateMany({
    where: { id, version: expectedVersion },
    data: {
      assigneeId,
      version: { increment: 1 },
      ...(assigneeId !== null && ticket.status === 'NEW' ? { status: 'OPEN' as const } : {}),
    },
  })
  if (count === 0) return stale(res)

  res.json(await findStaffTicketDetail(id))
}

/** `PATCH /api/staff/tickets/:id/priority` — IT Priority only (Lab 3 BR-31, BR-32; §3.8). */
export async function updatePriority(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { value, expectedVersion, errors } = readField(
    req.body,
    'itPriority',
    (v) => (PRIORITIES as readonly unknown[]).includes(v),
    'Choose an IT priority.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The IT priority was not changed.', errors)

  const { count } = await prisma.ticket.updateMany({
    where: { id, version: expectedVersion },
    data: { itPriority: value as (typeof PRIORITIES)[number], version: { increment: 1 } },
  })
  if (count === 0) {
    return (await prisma.ticket.findUnique({ where: { id }, select: { id: true } })) ? stale(res) : notFound(res)
  }

  res.json(await findStaffTicketDetail(id))
}

type Refusal = { code: ErrorCode; message: string; blockers?: ResolutionBlocker[] }

/** `PATCH /api/staff/tickets/:id/status` — matrix, owner condition, and resolution gate, enforced (§3.7). */
export async function updateStatus(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  // An unknown value is a malformed request (400); a known but refused one is a conflict (409).
  const { value, expectedVersion, errors } = readField(
    req.body,
    'status',
    (v) => (STATUSES as readonly unknown[]).includes(v),
    'Choose a status.',
  )
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The status was not changed.', errors)
  const to = value as TicketStatus

  // Steps 3 – 7 and the write, in one transaction. Nothing here locks the row: an action committed after the gate
  // counts advances the version, so the conditional write below matches nothing (AC-27).
  const refusal = await prisma.$transaction(async (tx): Promise<Refusal | null> => {
    const ticket = await tx.ticket.findUnique({ where: { id }, select: { status: true, assigneeId: true, version: true } })
    if (!ticket) return { code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' }
    if (ticket.version !== expectedVersion) return { code: 'STALE_TICKET', message: STALE }

    const assigned = ticket.assigneeId !== null
    if (!isPermittedTransition(ticket.status, to, assigned)) {
      const reason = isInMatrix(ticket.status, to) ? ' until it has an owner' : ''
      return { code: 'INVALID_STATUS_TRANSITION', message: `This ticket cannot move from ${ticket.status} to ${to}${reason}.` }
    }
    if (to === 'RESOLVED') {
      const blockers = resolutionBlockers(assigned, await actionSummary(tx, id))
      if (blockers.length > 0) return { code: 'RESOLUTION_BLOCKED', message: 'This ticket cannot be resolved yet.', blockers }
    }

    await testHooks?.beforeStatusWrite?.(id)

    const now = new Date()
    const { count } = await tx.ticket.updateMany({
      where: { id, version: expectedVersion },
      data: {
        status: to,
        version: { increment: 1 },
        publicActivityAt: now,
        // resolvedAt is set on every entry to RESOLVED, kept through CLOSED, and cleared on REOPENED (BR-38).
        ...(to === 'RESOLVED' ? { resolvedAt: now } : to === 'REOPENED' ? { resolvedAt: null } : {}),
        ...(CLEARS_FLAG.includes(to) ? { requesterResolvedFlaggedAt: null } : {}),
      },
    })
    return count === 1 ? null : { code: 'STALE_TICKET', message: STALE }
  })

  if (refusal?.blockers) {
    // The one envelope with an additive member (api-spec §1.2).
    const { code, message, blockers } = refusal
    return res.status(ERROR_STATUS[code]).json({ error: { code, message, blockers } })
  }
  if (refusal) return sendError(res, refusal.code, refusal.message)

  res.json(await findStaffTicketDetail(id))
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
