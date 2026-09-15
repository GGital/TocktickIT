import type { TicketStatus } from '@prisma/client'

/** The permitted transitions, exactly as specification BR-35 lists them. Anything absent is refused (BR-36). */
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

/** Work in progress has an owner: an unassigned Ticket may only reach OPEN or CANCELLED (BR-30, api-spec §3.13). */
const UNASSIGNED_TARGETS: readonly TicketStatus[] = ['OPEN', 'CANCELLED']

/** A self-transition is never in the matrix, so it is refused like any other undocumented pair (BR-36). */
export const isPermittedTransition = (from: TicketStatus, to: TicketStatus, assigned: boolean) =>
  TRANSITIONS[from].includes(to) && (assigned || UNASSIGNED_TARGETS.includes(to))
