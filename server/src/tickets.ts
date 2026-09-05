import type { Request, Response } from 'express'
import { attachmentSelect, toAttachmentShape } from './attachments.js'
import { sendError, type FieldError } from './errors.js'
import { prisma } from './prisma.js'
import { bangkokYear, formatTicketNumber } from './ticketNumber.js'
import { QueryParameterError, parseTicketListQuery } from './ticketQuery.js'

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
type Priority = (typeof PRIORITIES)[number]

/** Identical duplicate by the same Requester inside this window is rejected (BR-19). */
const DUPLICATE_WINDOW_MS = 60_000

export type TicketInput = {
  summary: string
  description: string
  categoryId: number
  relatedSystemId: number
  requestedPriority: Priority
}

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const isPositiveInt = (value: unknown) => Number.isInteger(value) && (value as number) > 0

/**
 * Field validation (BR-16, BR-17). Every offending field is reported in one pass —
 * never just the first — so the form can mark them all at once (BR-18, AC-13).
 */
export function validateTicketInput(body: Record<string, unknown>): {
  input: TicketInput
  errors: FieldError[]
} {
  const errors: FieldError[] = []

  const summary = trimmed(body.summary)
  if (summary.length < 10 || summary.length > 120) {
    errors.push({ field: 'summary', message: 'Summary must be between 10 and 120 characters.' })
  }

  const description = trimmed(body.description)
  if (description.length < 20 || description.length > 2000) {
    errors.push({
      field: 'description',
      message: 'Description must be between 20 and 2000 characters.',
    })
  }

  if (!isPositiveInt(body.categoryId)) {
    errors.push({ field: 'categoryId', message: 'Select a valid category.' })
  }

  if (!isPositiveInt(body.relatedSystemId)) {
    errors.push({ field: 'relatedSystemId', message: 'Select a valid related system.' })
  }

  // The server never defaults a missing priority, even though the form pre-selects
  // MEDIUM as a convenience (BR-06).
  if (!PRIORITIES.includes(body.requestedPriority as Priority)) {
    errors.push({ field: 'requestedPriority', message: 'Select a requested priority.' })
  }

  return {
    input: {
      summary,
      description,
      categoryId: body.categoryId as number,
      relatedSystemId: body.relatedSystemId as number,
      requestedPriority: body.requestedPriority as Priority,
    },
    errors,
  }
}

const ticketDetail = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  requestedPriority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  requester: { select: { id: true, fullName: true, email: true, department: true } },
} as const

/** `POST /api/tickets` (api-spec §3.5). JSON only — attachments upload separately (BR-29). */
export async function createTicket(req: Request, res: Response) {
  // requesterContext has already resolved and validated the header (BR-05, BR-48).
  const requester = req.requester!
  const body = (req.body ?? {}) as Record<string, unknown>

  const { input, errors } = validateTicketInput(body)

  // An unknown reference and an inactive one report identically, so the state of
  // reference data is not enumerable through this endpoint (BR-45).
  const [category, relatedSystem] = await Promise.all([
    isPositiveInt(input.categoryId)
      ? prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } })
      : null,
    isPositiveInt(input.relatedSystemId)
      ? prisma.relatedSystem.findFirst({ where: { id: input.relatedSystemId, isActive: true } })
      : null,
  ])

  if (!category && !errors.some((error) => error.field === 'categoryId')) {
    errors.push({ field: 'categoryId', message: 'Select a valid category.' })
  }

  if (!relatedSystem && !errors.some((error) => error.field === 'relatedSystemId')) {
    errors.push({ field: 'relatedSystemId', message: 'Select a valid related system.' })
  }

  if (errors.length > 0) {
    return sendError(
      res,
      'VALIDATION_FAILED',
      'The ticket could not be created because some fields are invalid.',
      errors,
    )
  }

  const duplicate = await prisma.ticket.findFirst({
    where: {
      requesterId: requester.id,
      summary: input.summary,
      description: input.description,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
  })

  if (duplicate) {
    return sendError(
      res,
      'DUPLICATE_SUBMISSION',
      'A ticket with the same summary and description was submitted moments ago.',
    )
  }

  const year = bangkokYear()

  const ticket = await prisma.$transaction(async (tx) => {
    // One atomic statement issues the sequence: no application lock, no race, and
    // a rolled-back transaction leaves an accepted gap rather than a reused number (BR-03).
    const [counter] = await tx.$queryRaw<{ lastValue: number }[]>`
      INSERT INTO "TicketNumberCounter" ("year", "lastValue")
      VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "lastValue" = "TicketNumberCounter"."lastValue" + 1
      RETURNING "lastValue"
    `

    return tx.ticket.create({
      // Every server-assigned value comes from here, never from the body: the
      // ticket number, the NEW status, the timestamps, and the requester (BR-01 – BR-05).
      data: {
        ticketNumber: formatTicketNumber(year, counter.lastValue),
        requesterId: requester.id,
        categoryId: input.categoryId,
        relatedSystemId: input.relatedSystemId,
        summary: input.summary,
        description: input.description,
        requestedPriority: input.requestedPriority,
      },
      select: ticketDetail,
    })
  })

  res.status(201).location(`/api/tickets/${ticket.id}`).json({ ...ticket, attachments: [] })
}


const ticketSummary = {
  id: true,
  ticketNumber: true,
  summary: true,
  requestedPriority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
  // Removed attachments do not count towards the list indicator (BR-25).
  _count: { select: { attachments: { where: { removedAt: null } } } },
} as const

/** `GET /api/tickets` (api-spec §3.6). Search, filter, sort, and paging all happen
 * in the database, always inside the requester's ownership scope (BR-15, BR-34). */
export async function listTickets(req: Request, res: Response) {
  let query
  try {
    query = parseTicketListQuery(req.query as Record<string, unknown>)
  } catch (error) {
    if (error instanceof QueryParameterError) {
      return sendError(res, 'INVALID_QUERY_PARAMETER', error.message)
    }
    throw error
  }

  const where = {
    // Ownership is part of the query itself, never a filter applied afterwards.
    requesterId: req.requester!.id,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.relatedSystemId ? { relatedSystemId: query.relatedSystemId } : {}),
    ...(query.requestedPriority ? { requestedPriority: query.requestedPriority } : {}),
    ...(query.status ? { status: query.status } : {}),
    // Filters and search combine with AND; the OR only spreads the term across
    // the three searchable columns (BR-35, BR-36).
    ...(query.search
      ? {
          OR: [
            { ticketNumber: { contains: query.search, mode: 'insensitive' as const } },
            { summary: { contains: query.search, mode: 'insensitive' as const } },
            { description: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [totalItems, rows] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      // Sorting requestedPriority orders by severity, not alphabetically: the
      // Postgres enum is declared LOW, MEDIUM, HIGH, URGENT, and enum comparison
      // follows declaration order. Reordering the enum would change this (BR-37).
      orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ticketSummary,
    }),
  ])

  res.json({
    // A page past the end is an empty page, not an error (BR-40).
    data: rows.map(({ _count, ...ticket }) => ({ ...ticket, attachmentCount: _count.attachments })),
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

const parseId = (value: string | string[] | undefined) =>
  typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null

/**
 * `GET /api/tickets/:id` (api-spec §3.7). Ownership is part of the lookup, so a
 * ticket belonging to another Requester is indistinguishable from one that does
 * not exist — same status, same body (BR-13, BR-15, AC-41, AC-44).
 */
export async function getTicket(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) {
    return sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id, requesterId: req.requester!.id },
    select: {
      ...ticketDetail,
      // Removed attachments are listed too, as metadata only (BR-32, AC-27).
      attachments: {
        orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
        select: attachmentSelect,
      },
    },
  })

  if (!ticket) return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')

  res.json({ ...ticket, attachments: ticket.attachments.map(toAttachmentShape) })
}
