import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FollowUpBadge from './FollowUpBadge'
import PriorityBadge, { type Priority } from './PriorityBadge'
import StatusBadge from './StatusBadge'
import { formatBangkok, timeAgo } from '../lib/formatBangkok'
import type { TicketStatus } from '../lib/ticketLabels'

/** DashboardTicketItem (api-spec §2.4); the Requester variant has no itPriority. */
export type DashboardTicketItem = { id: number; ticketNumber: string; summary: string; status: TicketStatus; itPriority?: Priority; at: string }

/** DashboardActionItem (api-spec §2.5). */
export type DashboardActionItem = {
  id: number
  ticketId: number
  ticketNumber: string
  actionAt: string
  description: string
  followUpOutstanding: boolean
  createdAt: string
}

/** A titled card holding one capped list, its empty message, and its footer link (ui-spec §2.3). */
function ListCard({ id, title, empty, footer, children, count }: { id: string; title: string; empty: string; footer?: { to: string; label: string }; children: ReactNode; count: number }) {
  return (
    <section className="zen-card h-100" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {count === 0 ? <p className="zen-help mb-0">{empty}</p> : <ul className="list-unstyled mb-0">{children}</ul>}
      {footer && (
        <p className="text-end mt-3 mb-0">
          <Link to={footer.to}>
            {footer.label} <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
    </section>
  )
}

/** Recently updated / resolved Tickets: exactly the rows the API returned, never padded or cut (ui-spec §2.3). */
export function DashboardTicketList({
  id,
  title,
  items,
  empty,
  footer,
  detailPath,
}: {
  id: string
  title: string
  items: DashboardTicketItem[]
  empty: string
  footer: { to: string; label: string }
  detailPath: (id: number) => string
}) {
  return (
    <ListCard id={id} title={title} empty={empty} footer={footer} count={items.length}>
      {items.map((item) => (
        <li key={item.id} className="zen-dashboard-row">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Link to={detailPath(item.id)} className="zen-mono">
              {item.ticketNumber}
            </Link>
            <span className="zen-dashboard-summary text-truncate" title={item.summary}>
              {item.summary}
            </span>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
            <StatusBadge value={item.status} />
            {item.itPriority && <PriorityBadge kind="it" value={item.itPriority} />}
            <span className="zen-help mt-0">
              {timeAgo(item.at)} · {formatBangkok(item.at)}
            </span>
          </div>
        </li>
      ))}
    </ListCard>
  )
}

/** The caller's latest non-voided actions, each opening its Ticket at the Actions Taken panel (BR-67). */
export function DashboardActionList({ items }: { items: DashboardActionItem[] }) {
  return (
    <ListCard id="my-recent-actions" title="My recent actions" empty="You have not recorded any actions yet." count={items.length}>
      {items.map((item) => (
        <li key={item.id} className="zen-dashboard-row d-flex flex-wrap align-items-center gap-2">
          <Link to={`/staff/tickets/${item.ticketId}#actions`} className="zen-mono">
            {item.ticketNumber}
          </Link>
          <span className="zen-help mt-0">{formatBangkok(item.actionAt)}</span>
          <span className="zen-dashboard-summary text-truncate" title={item.description}>
            {item.description}
          </span>
          {/* The API sends only the outstanding flag; a recent action without one has no follow-up to show. */}
          {item.followUpOutstanding && <FollowUpBadge required completed={false} />}
        </li>
      ))}
    </ListCard>
  )
}
