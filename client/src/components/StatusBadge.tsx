import Badge from './Badge'
import { STATUS_LABELS, type TicketStatus } from '../lib/ticketLabels'

export type { TicketStatus }

const TONES: Record<TicketStatus, string> = {
  NEW: 'new',
  OPEN: 'open',
  IN_PROGRESS: 'in-progress',
  WAITING_FOR_REQUESTER: 'waiting',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  CANCELLED: 'cancelled',
}

/** All eight Ticket statuses (BR-33, ui-spec §1.2). Status colour is deliberately quieter than priority colour. */
export default function StatusBadge({ value }: { value: TicketStatus }) {
  return (
    <Badge tone={TONES[value]} glyph={value === 'RESOLVED' ? '✓' : undefined}>
      {STATUS_LABELS[value]}
    </Badge>
  )
}

/** The Requester-resolution flag (ui-spec §1.2, BR-46): a signal to staff, never a status. */
export function ResolutionFlagBadge() {
  return (
    <Badge tone="flag">
      <span aria-hidden="true">✓ </span>
      Requester says resolved
    </Badge>
  )
}
