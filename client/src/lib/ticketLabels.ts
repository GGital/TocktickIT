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
