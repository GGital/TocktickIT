/** The eight Ticket statuses in lifecycle order, with the labels people read (BR-33, ui-spec §1.2). */
export const STATUS_LABELS = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
} as const

export type TicketStatus = keyof typeof STATUS_LABELS

export const TICKET_STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[]

/** "Everything not yet finished" — the Queue's one-click preset (ui-spec §7.4). */
export const OPEN_WORK: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

/** The transition matrix (specification BR-35). The API enforces it; the client only uses it to offer valid choices. */
const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

/** The statuses a Ticket may move to next; an unassigned Ticket may only reach OPEN or CANCELLED (BR-30). */
export const permittedTargets = (from: TicketStatus, assigned: boolean) =>
  NEXT_STATUSES[from].filter((to) => assigned || to === 'OPEN' || to === 'CANCELLED')
