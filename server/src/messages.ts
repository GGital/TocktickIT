import type { Request, Response } from 'express'
import type { MessageVisibility } from '@prisma/client'
import { sendError, type FieldError } from './errors.js'
import { prisma } from './prisma.js'
import { findTicketDetail, parseId } from './tickets.js'

/**
 * Public Comments and Internal Notes (api-spec §3.6 – §3.8, §3.14, §3.15). One append-only table; every read puts
 * the visibility in the query predicate, never in a filter applied afterwards (BR-39, BR-40, BR-42).
 */

const MAX_LENGTH = 2000

const COMMENT_MESSAGE = 'Enter a comment of up to 2000 characters.'
const NOTE_MESSAGE = 'Enter a note of up to 2000 characters.'
const SERVER_OWNED = 'This value is set by the server and cannot be sent.'
const SYSTEM_BODY = 'The requester reported that the problem appears resolved.'

/** The TicketMessage shape (api-spec §2.7). */
const messageSelect = {
  id: true,
  visibility: true,
  body: true,
  isSystem: true,
  createdAt: true,
  author: { select: { id: true, fullName: true, role: true } },
} as const

/**
 * Reads the one permitted text field. Any other key — author, createdAt, visibility, anything — is a validation
 * failure rather than silently ignored, so a client can never mis-attribute or re-scope a message (BR-43).
 */
function readText(body: unknown, field: 'body' | 'note', message: string, required: boolean) {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const errors: FieldError[] = Object.keys(input)
    .filter((key) => key !== field)
    .map((key) => ({ field: key, message: SERVER_OWNED }))

  const value = input[field]
  const text = typeof value === 'string' ? value.trim() : ''
  const present = value !== undefined
  if ((required || present) && (typeof value !== 'string' || text.length === 0 || text.length > MAX_LENGTH)) {
    errors.unshift({ field, message })
  }

  return { text: present ? text : undefined, errors }
}

const invalidId = (res: Response) =>
  sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
const notFound = (res: Response) => sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')

/** A Requester reaches only their own Ticket; staff reach any (BR-19, BR-21). Ownership lives in the predicate. */
const readableTicket = (req: Request, id: number) =>
  prisma.ticket.findFirst({
    where: { id, ...(req.user!.role === 'REQUESTER' ? { requesterId: req.user!.id } : {}) },
    select: { id: true },
  })

const listFor = (ticketId: number, visibility: MessageVisibility) =>
  prisma.ticketMessage.findMany({
    where: { ticketId, visibility },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: messageSelect,
  })

/** Appends one message and refreshes the Ticket's updatedAt in the same transaction. */
async function append(ticketId: number, authorId: number, visibility: MessageVisibility, body: string) {
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({ data: { ticketId, authorId, visibility, body }, select: messageSelect }),
    prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() }, select: { id: true } }),
  ])
  return message
}

/** GET /api/tickets/:id/comments — PUBLIC for every caller, whatever their role (§3.6). */
export async function listComments(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)
  if (!(await readableTicket(req, id))) return notFound(res)

  res.json(await listFor(id, 'PUBLIC'))
}

/** POST /api/tickets/:id/comments (§3.7). */
export async function postComment(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { text, errors } = readText(req.body, 'body', COMMENT_MESSAGE, true)
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The comment was not posted.', errors)
  if (!(await readableTicket(req, id))) return notFound(res)

  res.status(201).json(await append(id, req.user!.id, 'PUBLIC', text!))
}

/**
 * GET /api/staff/tickets/:id/internal-notes (§3.14). Mounted under /api/staff, so the role guard has already refused
 * a Requester before this runs — before any Ticket lookup, and without a count (BR-24).
 */
export async function listInternalNotes(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)
  if (!(await readableTicket(req, id))) return notFound(res)

  res.json(await listFor(id, 'INTERNAL'))
}

/** POST /api/staff/tickets/:id/internal-notes (§3.15). */
export async function postInternalNote(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { text, errors } = readText(req.body, 'body', NOTE_MESSAGE, true)
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The note was not posted.', errors)
  if (!(await readableTicket(req, id))) return notFound(res)

  res.status(201).json(await append(id, req.user!.id, 'INTERNAL', text!))
}

/**
 * POST /api/tickets/:id/appears-resolved (§3.8). Not a status change: it records the flag and one system Public
 * Comment, atomically, and only once (BR-46). The Requester-only role guard runs before this.
 */
export async function flagAppearsResolved(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { text: note, errors } = readText(req.body, 'note', NOTE_MESSAGE, false)
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The ticket was not flagged.', errors)

  const requesterId = req.user!.id
  const outcome = await prisma.$transaction(async (tx) => {
    // The "not yet flagged" condition is part of the update itself, so two simultaneous requests cannot both win.
    const { count } = await tx.ticket.updateMany({
      where: { id, requesterId, requesterResolvedFlaggedAt: null },
      data: { requesterResolvedFlaggedAt: new Date() },
    })
    if (count === 0) {
      const owned = await tx.ticket.findFirst({ where: { id, requesterId }, select: { id: true } })
      return owned ? 'already-flagged' : 'not-found'
    }

    await tx.ticketMessage.create({
      data: {
        ticketId: id,
        authorId: requesterId,
        visibility: 'PUBLIC',
        isSystem: true,
        body: note ? `${SYSTEM_BODY}\n\n${note}` : SYSTEM_BODY,
      },
    })
    return 'flagged'
  })

  if (outcome === 'not-found') return notFound(res)
  if (outcome === 'already-flagged') {
    return sendError(res, 'ALREADY_FLAGGED', 'You have already reported that this problem appears resolved.')
  }

  res.json(await findTicketDetail({ id, requesterId }))
}
