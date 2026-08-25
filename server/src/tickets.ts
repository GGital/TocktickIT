import type { Request, Response } from 'express'
import { sendError, type FieldError } from './errors.js'
import { prisma } from './prisma.js'
import { bangkokYear, formatTicketNumber } from './ticketNumber.js'

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
