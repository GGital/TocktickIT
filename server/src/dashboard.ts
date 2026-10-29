import type { Request, Response } from 'express'
import { Prisma, type TicketStatus } from '@prisma/client'
import { prisma } from './prisma.js'
import { PRIORITIES, STATUSES } from './ticketQuery.js'

/**
 * Role dashboards (api-spec §3.13, §3.14). Every number is counted in the database at request time (BR-47) and
 * carries the client route of the list it summarises, so the client never builds a filter itself (§2.6).
 */

const TIME_ZONE = 'Asia/Bangkok'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Bangkok is UTC+07:00 all year, with no daylight saving (BR-49).
const BANGKOK_OFFSET_MS = 7 * HOUR_MS
const RECENT_DAYS = 7

/** The UTC instant of 00:00 Asia/Bangkok on the Bangkok calendar day containing `now` (BR-49). */
export const bangkokDayStart = (now: Date) =>
  new Date(Math.floor((now.getTime() + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS)

/** The start of the rolling "recent" window: exactly 7 × 24 h before `now` (BR-49). */
export const recentWindowStart = (now: Date) => new Date(now.getTime() - RECENT_DAYS * DAY_MS)

const ACTIVE: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const ACTIVE_QUERY = ACTIVE.map((status) => `status=${status}`).join('&')

/** An outstanding follow-up (BR-15): required, not completed, not voided (BR-22). */
export const outstandingFollowUp = {
  followUpRequired: true,
  followUpCompletedAt: null,
  voidedAt: null,
} satisfies Prisma.ActionTakenWhereInput

/**
 * Tickets with at least one outstanding follow-up, optionally only the given performer's, never a cancelled Ticket
 * (BR-50, BR-62). The Queue's `followUp` filter and the dashboard count share it, so they always agree (BR-71).
 */
export const followUpTickets = (performedById?: number): Prisma.TicketWhereInput => ({
  NOT: { status: 'CANCELLED' },
  actions: { some: { ...outstandingFollowUp, ...(performedById ? { performedById } : {}) } },
})

const metric = (count: number, href: string) => ({ count, href })

/** Zero-filled per-key counts from a groupBy: every key is present, even with no rows (BR-51). */
const fill = <K extends string>(keys: readonly K[], rows: { key: K; count: number }[], href: (key: K) => string) => {
  const counts = new Map(rows.map((row) => [row.key, row.count]))
  return Object.fromEntries(keys.map((key) => [key, metric(counts.get(key) ?? 0, href(key))])) as Record<K, ReturnType<typeof metric>>
}

const ticketItem = { id: true, ticketNumber: true, summary: true, status: true } as const

/** Action descriptions are cut to 80 characters, ellipsis included (api-spec §2.5). */
const truncate = (text: string) => (text.length > 80 ? `${text.slice(0, 79)}…` : text)

/** `GET /api/dashboard/requester` (§3.13). Every predicate starts with the caller's id (AC-29). */
export async function requesterDashboard(req: Request, res: Response) {
  const now = new Date()
  const requesterId = req.user!.id
  const recentlyResolved = {
    requesterId,
    status: { in: ['RESOLVED', 'CLOSED'] as TicketStatus[] },
    resolvedAt: { gte: recentWindowStart(now), lte: now },
  } satisfies Prisma.TicketWhereInput

  const [open, waiting, awaitingClosure, resolvedCount, updated, resolved] = await prisma.$transaction([
    prisma.ticket.count({ where: { requesterId, status: { in: ACTIVE } } }),
    prisma.ticket.count({ where: { requesterId, status: 'WAITING_FOR_REQUESTER' } }),
    prisma.ticket.count({ where: { requesterId, status: 'RESOLVED' } }),
    prisma.ticket.count({ where: recentlyResolved }),
    // Ordered by public activity, so an Internal Note never moves a Ticket here (BR-45, BR-56).
    prisma.ticket.findMany({
      where: { requesterId },
      orderBy: [{ publicActivityAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: { ...ticketItem, publicActivityAt: true },
    }),
    prisma.ticket.findMany({
      where: recentlyResolved,
      orderBy: [{ resolvedAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: { ...ticketItem, resolvedAt: true },
    }),
  ])

  res.json({
    generatedAt: now,
    timeZone: TIME_ZONE,
    windows: { recentDays: RECENT_DAYS },
    metrics: {
      waitingForMe: metric(waiting, '/tickets?status=WAITING_FOR_REQUESTER'),
      openTickets: metric(open, `/tickets?${ACTIVE_QUERY}`),
      resolvedAwaitingClosure: metric(awaitingClosure, '/tickets?status=RESOLVED'),
      // Ordered, not filtered, by the window: My Tickets has no resolvedAt filter (A-14).
      recentlyResolved: metric(resolvedCount, '/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc'),
    },
    recentlyUpdated: updated.map(({ publicActivityAt, ...ticket }) => ({ ...ticket, at: publicActivityAt })),
    recentlyResolved: resolved.map(({ resolvedAt, ...ticket }) => ({ ...ticket, at: resolvedAt })),
  })
}

/** `GET /api/staff/dashboard` (§3.14). Mounted under /api/staff, so a Requester has already been refused. */
export async function staffDashboard(req: Request, res: Response) {
  const now = new Date()
  const todayStartsAt = bangkokDayStart(now)
  const user = req.user!
  const isAdministrator = user.role === 'ADMINISTRATOR'
  const active = { status: { in: ACTIVE } }

  // One snapshot: every count and list sees the same data, so byStatus sums to the total (BR-71, A-21).
  const data = await prisma.$transaction(
    async (tx) => ({
      unassigned: await tx.ticket.count({ where: { ...active, assigneeId: null } }),
      myOpen: await tx.ticket.count({ where: { ...active, assigneeId: user.id } }),
      urgentActive: await tx.ticket.count({ where: { ...active, itPriority: 'URGENT' } }),
      requesterFlagged: await tx.ticket.count({ where: { ...active, requesterResolvedFlaggedAt: { not: null } } }),
      myOutstandingFollowUps: await tx.ticket.count({ where: followUpTickets(user.id) }),
      newToday: await tx.ticket.count({ where: { createdAt: { gte: todayStartsAt, lte: now } } }),
      byStatus: await tx.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      byItPriority: await tx.ticket.groupBy({ by: ['itPriority'], where: active, _count: { _all: true } }),
      recentlyUpdated: await tx.ticket.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: { ...ticketItem, itPriority: true, updatedAt: true },
      }),
      myRecentActions: await tx.actionTaken.findMany({
        where: { performedById: user.id, voidedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true,
          ticketId: true,
          ticket: { select: { ticketNumber: true } },
          actionAt: true,
          description: true,
          followUpRequired: true,
          followUpCompletedAt: true,
          createdAt: true,
        },
      }),
      // Computed only for an Administrator; IT Staff never reach these queries (BR-70).
      users: isAdministrator
        ? {
            activeByRole: await tx.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { _all: true } }),
            inactive: await tx.user.count({ where: { isActive: false } }),
            mustChangePassword: await tx.user.count({ where: { isActive: true, mustChangePassword: true } }),
          }
        : null,
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )

  res.json({
    generatedAt: now,
    timeZone: TIME_ZONE,
    windows: { todayStartsAt },
    metrics: {
      unassigned: metric(data.unassigned, `/staff/tickets?assignee=unassigned&${ACTIVE_QUERY}`),
      myOpen: metric(data.myOpen, `/staff/tickets?assignee=me&${ACTIVE_QUERY}`),
      urgentActive: metric(data.urgentActive, `/staff/tickets?itPriority=URGENT&${ACTIVE_QUERY}`),
      // The active statuses are part of the link: a cancelled Ticket can keep its flag, and the list must match.
      requesterFlagged: metric(data.requesterFlagged, `/staff/tickets?flaggedResolved=true&${ACTIVE_QUERY}`),
      myOutstandingFollowUps: metric(data.myOutstandingFollowUps, '/staff/tickets?followUp=mine'),
      // Ordered, not filtered: the Queue has no createdAt filter (A-14).
      newToday: metric(data.newToday, '/staff/tickets?sortBy=createdAt&sortOrder=desc'),
    },
    byStatus: fill(
      STATUSES,
      data.byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      (status) => `/staff/tickets?status=${status}`,
    ),
    byItPriority: fill(
      [...PRIORITIES].reverse(),
      data.byItPriority.map((row) => ({ key: row.itPriority, count: row._count._all })),
      (priority) => `/staff/tickets?itPriority=${priority}&${ACTIVE_QUERY}`,
    ),
    recentlyUpdated: data.recentlyUpdated.map(({ updatedAt, ...ticket }) => ({ ...ticket, at: updatedAt })),
    myRecentActions: data.myRecentActions.map(({ ticket, description, followUpRequired, followUpCompletedAt, ...action }) => ({
      id: action.id,
      ticketId: action.ticketId,
      ticketNumber: ticket.ticketNumber,
      actionAt: action.actionAt,
      description: truncate(description),
      // voidedAt is already null by the query.
      followUpOutstanding: followUpRequired && followUpCompletedAt === null,
      createdAt: action.createdAt,
    })),
    ...(data.users
      ? {
          administration: {
            users: {
              activeByRole: fill(
                ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'] as const,
                data.users.activeByRole.map((row) => ({ key: row.role, count: row._count._all })),
                (role) => `/admin/users?role=${role}`,
              ),
              // No single filter matches these two, so they open the full list (A-14).
              inactive: metric(data.users.inactive, '/admin/users'),
              mustChangePassword: metric(data.users.mustChangePassword, '/admin/users'),
            },
          },
        }
      : {}),
  })
}
