import type { Request, Response } from 'express'
import { Prisma, type TicketStatus, type User } from '@prisma/client'
import { followUpPairingError, readActionInput, readVersionInput, type ActionFields } from './actionInput.js'
import { sendError, type ErrorCode } from './errors.js'
import { prisma } from './prisma.js'
import { parseId } from './tickets.js'

/**
 * Actions Taken (api-spec §3.1 – §3.6). Never deleted, only voided (BR-21). The staff routes are mounted under
 * /api/staff, so the role guard has refused a Requester before any Ticket lookup (BR-72).
 */

// BR-14: work is recorded only while the Ticket is in progress and owned.
const ACTIONABLE: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const FINISHED: TicketStatus[] = ['RESOLVED', 'CLOSED', 'CANCELLED']

const person = { select: { id: true, fullName: true, role: true } } as const
const actionInclude = { performedBy: person, lastEditedBy: person, followUpCompletedBy: person, voidedBy: person } as const
type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof actionInclude }>
type TicketRow = { id: number; status: TicketStatus; assigneeId: number | null; createdAt: Date }

const ticketSelect = { id: true, status: true, assigneeId: true, createdAt: true } as const

/** A write refused partway through a transaction; thrown so the transaction rolls back, then sent as-is. */
class Refusal {
  constructor(
    readonly code: ErrorCode,
    readonly message: string,
  ) {}
}

const isOutstanding = (a: { followUpRequired: boolean; followUpCompletedAt: Date | null; voidedAt: Date | null }) =>
  a.followUpRequired && a.followUpCompletedAt === null && a.voidedAt === null

/** Performer, current Ticket Owner, or Administrator (BR-18). */
const mayChange = (action: { performedById: number }, ticket: TicketRow, user: User) =>
  user.role === 'ADMINISTRATOR' || action.performedById === user.id || ticket.assigneeId === user.id

/** The staff ActionTaken shape (api-spec §2.1). clientRequestId is never returned. */
function toStaffAction(row: ActionRow, ticket: TicketRow, user: User) {
  const { clientRequestId: _key, performedById: _p, lastEditedById: _e, followUpCompletedById: _c, voidedById: _v, ...rest } = row
  return {
    ...rest,
    followUpOutstanding: isOutstanding(row),
    voided: row.voidedAt !== null,
    canEdit: row.voidedAt === null && mayChange(row, ticket, user),
  }
}

/** The Requester projection (api-spec §2.2): no version, key, void data, editor, or user ids (BR-43). */
const requesterSelect = {
  id: true,
  actionAt: true,
  description: true,
  result: true,
  followUpRequired: true,
  followUpNote: true,
  followUpCompletedAt: true,
  attachmentNotes: true,
  lastEditedById: true,
  performedBy: { select: { fullName: true, role: true } },
  createdAt: true,
  updatedAt: true,
} as const

const ORDER = [{ actionAt: 'asc' }, { id: 'asc' }] satisfies Prisma.ActionTakenOrderByWithRelationInput[]

const invalidTicketId = (res: Response) =>
  sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
const invalidActionId = (res: Response) =>
  sendError(res, 'INVALID_PATH_PARAMETER', 'The action id must be a positive integer.')
const ticketNotFound = (res: Response) => sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')
const actionNotFound = (res: Response) => sendError(res, 'ACTION_NOT_FOUND', 'Action not found.')
const invalid = (res: Response, fields: { field: string; message: string }[]) =>
  sendError(res, 'VALIDATION_FAILED', 'The action was not saved.', fields)

/** BR-14, with the reason the user needs to act on. Null when the Ticket accepts work. */
function notActionable(ticket: { status: TicketStatus; assigneeId: number | null }) {
  if (FINISHED.includes(ticket.status)) return new Refusal('TICKET_NOT_ACTIONABLE', 'Reopen this ticket to record more work.')
  if (!ACTIONABLE.includes(ticket.status) || ticket.assigneeId === null) {
    return new Refusal('TICKET_NOT_ACTIONABLE', 'Claim or assign this ticket first.')
  }
  return null
}

/**
 * Advances the Ticket's version and public activity in the caller's transaction (BR-26, BR-45). The actionable
 * condition is part of the write, so a status or owner change that lands after the check still refuses the action.
 */
async function touchTicket(tx: Prisma.TransactionClient, id: number) {
  const { count } = await tx.ticket.updateMany({
    where: { id, status: { in: ACTIONABLE }, assigneeId: { not: null } },
    data: { version: { increment: 1 }, publicActivityAt: new Date() },
  })
  if (count === 0) {
    const now = await tx.ticket.findUniqueOrThrow({ where: { id }, select: { status: true, assigneeId: true } })
    throw notActionable(now) ?? new Refusal('TICKET_NOT_ACTIONABLE', 'Claim or assign this ticket first.')
  }
}

/** Runs a write, answering a Refusal thrown inside it as its error. */
async function attempt<T>(res: Response, write: () => Promise<T>) {
  try {
    return await write()
  } catch (error) {
    if (error instanceof Refusal) {
      sendError(res, error.code, error.message)
      return undefined
    }
    throw error
  }
}

/** GET /api/tickets/:id/actions (§3.1). Ownership and voidedAt are both in the predicate (BR-42). */
export async function listRequesterActions(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidTicketId(res)

  const ticket = { id, requesterId: req.user!.id }
  if (!(await prisma.ticket.findFirst({ where: ticket, select: { id: true } }))) return ticketNotFound(res)

  const rows = await prisma.actionTaken.findMany({ where: { ticket, voidedAt: null }, orderBy: ORDER, select: requesterSelect })
  res.json(
    rows.map(({ followUpCompletedAt, lastEditedById, ...row }) => ({
      ...row,
      followUpCompleted: followUpCompletedAt !== null,
      edited: lastEditedById !== null,
    })),
  )
}

/** GET /api/staff/tickets/:id/actions (§3.2) — voided actions included. */
export async function listStaffActions(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidTicketId(res)

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: ticketSelect })
  if (!ticket) return ticketNotFound(res)

  const rows = await prisma.actionTaken.findMany({ where: { ticketId: id }, orderBy: ORDER, include: actionInclude })
  res.json(rows.map((row) => toStaffAction(row, ticket, req.user!)))
}

/** The answer to a repeated clientRequestId (§3.3 step 4): the original for its own author, else a conflict. */
async function replay(res: Response, clientRequestId: string, ticket: TicketRow, user: User) {
  const existing = await prisma.actionTaken.findUnique({ where: { clientRequestId }, include: actionInclude })
  if (!existing) return false
  if (existing.performedById !== user.id || existing.ticketId !== ticket.id) {
    sendError(res, 'DUPLICATE_SUBMISSION', 'This request was already used for a different action.')
  } else {
    res.status(200).json(toStaffAction(existing, ticket, user))
  }
  return true
}

/** POST /api/staff/tickets/:id/actions (§3.3). Idempotent by clientRequestId (BR-24). */
export async function createAction(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidTicketId(res)

  const { errors } = readActionInput(req.body, { mode: 'create' })
  if (errors.length > 0) return invalid(res, errors)

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: ticketSelect })
  if (!ticket) return ticketNotFound(res)

  // Read again now the Ticket is known: only the actionAt-before-creation bound can newly fail (step 5).
  const user = req.user!
  const { data, errors: bound } = readActionInput(req.body, { mode: 'create', ticketCreatedAt: ticket.createdAt })
  const clientRequestId = data.clientRequestId!
  if (await replay(res, clientRequestId, ticket, user)) return
  if (bound.length > 0) return invalid(res, bound)

  const refusal = notActionable(ticket)
  if (refusal) return sendError(res, refusal.code, refusal.message)

  try {
    const created = await attempt(res, () =>
      prisma.$transaction(async (tx) => {
        await touchTicket(tx, id)
        return tx.actionTaken.create({
          data: {
            ...(data as Required<ActionFields>),
            clientRequestId,
            ticketId: id,
            performedById: user.id,
          },
          include: actionInclude,
        })
      }),
    )
    if (created) res.status(201).json(toStaffAction(created, ticket, user))
  } catch (error) {
    // Two identical requests raced past the replay check; the loser answers exactly as a replay would.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && (await replay(res, clientRequestId, ticket, user))) {
      return
    }
    throw error
  }
}

/** Path parameters, Ticket, and action on that Ticket (§3.4 steps 1 and 3), or the response already sent. */
async function loadAction(req: Request, res: Response, validate: () => { field: string; message: string }[]) {
  const ticketId = parseId(req.params.id)
  if (ticketId === null) return invalidTicketId(res)
  const actionId = parseId(req.params.actionId)
  if (actionId === null) return invalidActionId(res)

  const errors = validate()
  if (errors.length > 0) return invalid(res, errors)

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: ticketSelect })
  if (!ticket) return ticketNotFound(res)
  // An action reached through a Ticket it does not belong to does not exist there (BR-01).
  const action = await prisma.actionTaken.findFirst({ where: { id: actionId, ticketId }, include: actionInclude })
  if (!action) return actionNotFound(res)
  return { ticket, action }
}

/**
 * The guarded write shared by edit, complete, and void (§3.4 step 8): the action changes only if its version is
 * still the one the client saw (BR-25), and the Ticket advances in the same transaction (BR-26).
 */
async function writeAction(
  res: Response,
  ticket: TicketRow,
  action: ActionRow,
  expectedVersion: number,
  data: Prisma.ActionTakenUncheckedUpdateManyInput,
  user: User,
) {
  const refusal = notActionable(ticket)
  if (refusal) return sendError(res, refusal.code, refusal.message)

  const updated = await attempt(res, () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.actionTaken.updateMany({
        where: { id: action.id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      })
      if (count === 0) {
        throw new Refusal('STALE_ACTION', 'This action was changed by someone else. Reload it and try again.')
      }
      await touchTicket(tx, ticket.id)
      return tx.actionTaken.findUniqueOrThrow({ where: { id: action.id }, include: actionInclude })
    }),
  )
  if (updated) res.json(toStaffAction(updated, ticket, user))
}

const forbidden = (res: Response) => sendError(res, 'FORBIDDEN', 'You do not have permission to do this.')
const alreadyVoided = (res: Response) =>
  sendError(res, 'ACTION_ALREADY_VOIDED', 'This action has been voided and can no longer change.')

/** PATCH /api/staff/tickets/:id/actions/:actionId (§3.4). */
export async function updateAction(req: Request, res: Response) {
  let input!: ReturnType<typeof readActionInput>
  const loaded = await loadAction(req, res, () => (input = readActionInput(req.body, { mode: 'update' })).errors)
  if (!loaded) return
  const { ticket, action } = loaded
  const user = req.user!

  if (!mayChange(action, ticket, user)) return forbidden(res)
  if (action.voidedAt) return alreadyVoided(res)

  const data = input.data
  const required = data.followUpRequired ?? action.followUpRequired
  const note = 'followUpNote' in data ? (data.followUpNote ?? null) : action.followUpNote
  // Once completed, the follow-up record is frozen; the rest of the action stays editable (BR-17).
  if (action.followUpCompletedAt && (required !== action.followUpRequired || note !== action.followUpNote)) {
    return sendError(res, 'FOLLOW_UP_NOT_OUTSTANDING', 'This follow-up is completed; its follow-up fields cannot change.')
  }

  const errors = readActionInput(req.body, { mode: 'update', ticketCreatedAt: ticket.createdAt }).errors
  const pairing = followUpPairingError(required, note)
  if (pairing) errors.push(pairing)
  if (errors.length > 0) return invalid(res, errors)

  await writeAction(res, ticket, action, input.expectedVersion!, { ...data, lastEditedById: user.id }, user)
}

/** POST /api/staff/tickets/:id/actions/:actionId/complete-follow-up (§3.5) — any staff member (BR-16). */
export async function completeFollowUp(req: Request, res: Response) {
  let input!: ReturnType<typeof readVersionInput>
  const loaded = await loadAction(req, res, () => (input = readVersionInput(req.body, false)).errors)
  if (!loaded) return
  const { ticket, action } = loaded

  if (action.voidedAt) return alreadyVoided(res)
  if (!isOutstanding(action)) {
    return sendError(res, 'FOLLOW_UP_NOT_OUTSTANDING', 'This action has no outstanding follow-up.')
  }

  await writeAction(
    res,
    ticket,
    action,
    input.expectedVersion!,
    { followUpCompletedAt: new Date(), followUpCompletedById: req.user!.id },
    req.user!,
  )
}

/** POST /api/staff/tickets/:id/actions/:actionId/void (§3.6). Irreversible (BR-20). */
export async function voidAction(req: Request, res: Response) {
  let input!: ReturnType<typeof readVersionInput>
  const loaded = await loadAction(req, res, () => (input = readVersionInput(req.body, true)).errors)
  if (!loaded) return
  const { ticket, action } = loaded
  const user = req.user!

  if (!mayChange(action, ticket, user)) return forbidden(res)
  if (action.voidedAt) return alreadyVoided(res)

  await writeAction(
    res,
    ticket,
    action,
    input.expectedVersion!,
    { voidedAt: new Date(), voidedById: user.id, voidReason: input.reason! },
    user,
  )
}
