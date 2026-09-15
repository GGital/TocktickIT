import Badge from './Badge'

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

const STATUSES: Record<TicketStatus, { tone: string; label: string; glyph?: string }> = {
  NEW: { tone: 'new', label: 'New' },
  OPEN: { tone: 'open', label: 'Open' },
  IN_PROGRESS: { tone: 'in-progress', label: 'In Progress' },
  WAITING_FOR_REQUESTER: { tone: 'waiting', label: 'Waiting for Requester' },
  RESOLVED: { tone: 'resolved', label: 'Resolved', glyph: '✓' },
  CLOSED: { tone: 'closed', label: 'Closed' },
  REOPENED: { tone: 'reopened', label: 'Reopened' },
  CANCELLED: { tone: 'cancelled', label: 'Cancelled' },
}

/** All eight Ticket statuses (BR-33, ui-spec §1.2). Status colour is deliberately quieter than priority colour. */
export default function StatusBadge({ value }: { value: TicketStatus }) {
  const { tone, label, glyph } = STATUSES[value]
  return (
    <Badge tone={tone} glyph={glyph}>
      {label}
    </Badge>
  )
}
