import type { TicketStatus } from '@prisma/client'

/** The permitted transitions, exactly as specification BR-33 lists them. Anything absent is refused (BR-34). */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

/** Work in progress has an owner (BR-33). RESOLVED needs one too, but the gate reports it as a blocker (BR-35). */
const OWNER_TARGETS: readonly TicketStatus[] = ['IN_PROGRESS', 'WAITING_FOR_REQUESTER']

export const isInMatrix = (from: TicketStatus, to: TicketStatus) => TRANSITIONS[from].includes(to)

/** A self-transition is never in the matrix, so it is refused like any other undocumented pair (BR-34). */
export const isPermittedTransition = (from: TicketStatus, to: TicketStatus, assigned: boolean) =>
  isInMatrix(from, to) && (assigned || !OWNER_TARGETS.includes(to))

export type ActionSummary = { total: number; voided: number; outstandingFollowUps: number }
export type ResolutionBlocker = 'UNASSIGNED' | 'NO_ACTIONS' | 'OUTSTANDING_FOLLOW_UPS'

/** Every failed gate condition, in the documented order (BR-35). Empty means the gate passes. */
export function resolutionBlockers(assigned: boolean, actions: ActionSummary): ResolutionBlocker[] {
  const blockers: ResolutionBlocker[] = []
  if (!assigned) blockers.push('UNASSIGNED')
  if (actions.total - actions.voided === 0) blockers.push('NO_ACTIONS')
  if (actions.outstandingFollowUps > 0) blockers.push('OUTSTANDING_FOLLOW_UPS')
  return blockers
}

/**
 * What the staff detail offers (BR-40): the matrix targets whose owner condition and gate pass now, and the gate's
 * blockers whenever RESOLVED is a matrix target. The status endpoint judges a write with these same functions.
 */
export function workflowState(ticket: { status: TicketStatus; assigned: boolean }, actions: ActionSummary) {
  const blockers = isInMatrix(ticket.status, 'RESOLVED') ? resolutionBlockers(ticket.assigned, actions) : []
  return {
    allowedTransitions: TRANSITIONS[ticket.status].filter(
      (to) => isPermittedTransition(ticket.status, to, ticket.assigned) && (to !== 'RESOLVED' || blockers.length === 0),
    ),
    resolutionBlockers: blockers,
  }
}

/** Test-only seam for the gate race (tests.md §1.4): runs after the gate counts, before the conditional write. */
export const testHooks: { beforeStatusWrite?: (ticketId: number) => Promise<void> } | undefined =
  process.env.NODE_ENV === 'test' ? {} : undefined
