import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AttachmentList, { type Attachment } from '../components/AttachmentList'
import Badge, { type Priority } from '../components/Badge'
import Button from '../components/Button'
import Callout from '../components/Callout'
import EmptyState from '../components/EmptyState'
import { SkeletonCard } from '../components/Skeleton'
import { ApiError, apiFetch } from '../lib/apiClient'

type Ticket = {
  id: number
  ticketNumber: string
  summary: string
  description: string
  category: { id: number; name: string }
  relatedSystem: { id: number; name: string }
  requester: { id: number; fullName: string; email: string; department: string }
  requestedPriority: Priority
  status: 'NEW'
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

type Load =
  | { status: 'loading' }
  | { status: 'loaded'; ticket: Ticket }
  | { status: 'not-found' }
  | { status: 'error' }

const bangkokTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/**
 * Requester Ticket Detail (ui-spec §7). Read-only for ticket data — no control on
 * this screen can change status, priority, or any other field (BR-44).
 */
export default function TicketDetail() {
  const { id } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  const loadTicket = useCallback(() => {
    setLoad({ status: 'loading' })
    apiFetch<Ticket>(`/tickets/${id}`)
      .then((ticket) => setLoad({ status: 'loaded', ticket }))
      .catch((error) => {
        // A ticket that does not exist and one owned by someone else are the same
        // state here, because the API answers both identically (BR-13, AC-44).
        const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400)
        setLoad({ status: notFound ? 'not-found' : 'error' })
      })
  }, [id])

  useEffect(loadTicket, [loadTicket])

  if (load.status === 'loading') {
    return (
      <>
        <SkeletonCard lines={2} label="Loading ticket…" />
        <SkeletonCard lines={4} label="Loading ticket…" />
      </>
    )
  }

  if (load.status === 'not-found') {
    return (
      <EmptyState
        heading="Ticket not found."
        body="This ticket does not exist, or it does not belong to the requester you are testing as."
        action={
          <Link className="btn btn-primary" to="/tickets">
            Back to My Tickets
          </Link>
        }
      />
    )
  }

  if (load.status === 'error') {
    return (
      <Callout variant="error" onRetry={loadTicket}>
        Unable to load this ticket.
      </Callout>
    )
  }

  const { ticket } = load

  return (
    <>
      <Link to="/tickets">‹ Back to My Tickets</Link>

      <div className="d-flex flex-wrap align-items-center gap-3 mt-2 mb-1">
        <h1 className="zen-mono mb-0">{ticket.ticketNumber}</h1>
        <Badge kind="priority" value={ticket.requestedPriority} />
        <Badge kind="status" value={ticket.status} />
      </div>
      <p className="zen-help">
        Created {bangkokTime(ticket.createdAt)} · Last updated {bangkokTime(ticket.updatedAt)}
      </p>

      {/* A definition list, not disabled inputs: this data is not a form (ui-spec §7.1). */}
      <section className="zen-card mb-4">
        <h2>Ticket information</h2>
        <dl className="row mb-0">
          <dt className="col-sm-3">Ticket Number</dt>
          <dd className="col-sm-9 zen-mono">{ticket.ticketNumber}</dd>

          <dt className="col-sm-3">Ticket Date</dt>
          <dd className="col-sm-9">{bangkokTime(ticket.createdAt)}</dd>

          <dt className="col-sm-3">Requester</dt>
          <dd className="col-sm-9">
            {ticket.requester.fullName} — {ticket.requester.department}
          </dd>

          <dt className="col-sm-3">Category</dt>
          <dd className="col-sm-9">{ticket.category.name}</dd>

          <dt className="col-sm-3">Related System</dt>
          <dd className="col-sm-9">{ticket.relatedSystem.name}</dd>

          <dt className="col-sm-3">Requested Priority</dt>
          <dd className="col-sm-9">
            <Badge kind="priority" value={ticket.requestedPriority} />
          </dd>

          <dt className="col-sm-3">Current Status</dt>
          <dd className="col-sm-9">
            <Badge kind="status" value={ticket.status} />
          </dd>

          <dt className="col-sm-3">Summary</dt>
          <dd className="col-sm-9">{ticket.summary}</dd>

          <dt className="col-sm-3">Description</dt>
          <dd className="col-sm-9 zen-description">{ticket.description}</dd>
        </dl>
      </section>

      <AttachmentList
        ticketId={ticket.id}
        attachments={ticket.attachments}
        onChanged={loadTicket}
      />

      <div className="mt-4">
        <Button variant="secondary" onClick={loadTicket}>
          Refresh
        </Button>
      </div>
    </>
  )
}
