import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AttachmentList, { type Attachment } from '../components/AttachmentList'
import PriorityBadge, { type Priority } from '../components/PriorityBadge'
import StatusBadge, { ResolutionFlagBadge, type TicketStatus } from '../components/StatusBadge'
import Button from '../components/Button'
import Callout from '../components/Callout'
import ConfirmDialog from '../components/ConfirmDialog'
import Conversation from '../components/Conversation'
import EmptyState from '../components/EmptyState'
import { SkeletonCard } from '../components/Skeleton'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'

type Ticket = {
  id: number
  ticketNumber: string
  summary: string
  description: string
  category: { id: number; name: string }
  relatedSystem: { id: number; name: string }
  // department is nullable since Lab 3: users created by an Administrator have none (X-10).
  requester: { id: number; fullName: string; email: string; department: string | null }
  requestedPriority: Priority
  status: TicketStatus
  /** Set when the Requester reported the problem resolved; cleared when IT resolves, closes, or reopens (BR-46). */
  requesterResolvedFlaggedAt: string | null
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
 * "Problem appears resolved" (Lab 3 ui-spec §6.2, BR-46). A signal to IT, never a status change. Once flagged the
 * button is replaced by the badge and date, so a repeat is impossible from the UI and 409 from the API.
 */
function AppearsResolved({ ticket, onFlagged }: { ticket: Ticket; onFlagged: (ticket: Ticket) => void }) {
  const isRequester = useCurrentUser()?.role === 'REQUESTER'
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (ticket.requesterResolvedFlaggedAt) {
    return (
      <div className="d-flex flex-wrap align-items-center gap-2 border-top pt-3 mt-4">
        <ResolutionFlagBadge />
        <span className="zen-help mt-0">Reported {bangkokTime(ticket.requesterResolvedFlaggedAt)}</span>
      </div>
    )
  }

  // Only the owning Requester may flag (the API answers 403 to anyone else), so no other role sees the action.
  if (!isRequester) return null

  async function flag() {
    setBusy(true)
    setFailed(false)
    try {
      onFlagged(
        await apiFetch<Ticket>(`/tickets/${ticket.id}/appears-resolved`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      )
    } catch (error) {
      // Flagged already — from another tab, say. Reload so the badge replaces the button.
      if (error instanceof ApiError && error.code === 'ALREADY_FLAGGED') {
        onFlagged(await apiFetch<Ticket>(`/tickets/${ticket.id}`).catch(() => ticket))
      } else {
        setFailed(true)
      }
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="border-top pt-3 mt-4">
      {failed && (
        <div className="mb-3">
          <Callout variant="error">We could not tell IT right now. Please try again.</Callout>
        </div>
      )}
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Problem appears resolved
      </Button>
      <p className="zen-help mb-0">IT Staff will confirm and close the ticket.</p>

      <ConfirmDialog
        open={confirming}
        title="Tell IT that this problem appears resolved?"
        confirmLabel="Tell IT it’s resolved"
        confirmVariant="primary"
        cancelLabel="Not yet"
        busy={busy}
        busyLabel="Sending…"
        onConfirm={flag}
        onCancel={() => setConfirming(false)}
      >
        <p className="mb-0">They will confirm and close the ticket.</p>
      </ConfirmDialog>
    </div>
  )
}

/**
 * Requester Ticket Detail (ui-spec §7). Read-only for ticket data — no control on
 * this screen can change status, priority, or any other field (BR-44).
 */
export default function TicketDetail() {
  const { id } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  // Bumped after the resolution flag, whose system Comment must appear in the thread.
  const [commentsVersion, setCommentsVersion] = useState(0)

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
        <PriorityBadge kind="requested" value={ticket.requestedPriority} />
        <StatusBadge value={ticket.status} />
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
            {ticket.requester.fullName}
            {ticket.requester.department && ` — ${ticket.requester.department}`}
          </dd>

          <dt className="col-sm-3">Category</dt>
          <dd className="col-sm-9">{ticket.category.name}</dd>

          <dt className="col-sm-3">Related System</dt>
          <dd className="col-sm-9">{ticket.relatedSystem.name}</dd>

          <dt className="col-sm-3">Requested Priority</dt>
          <dd className="col-sm-9">
            <PriorityBadge kind="requested" value={ticket.requestedPriority} />
          </dd>

          <dt className="col-sm-3">Current Status</dt>
          <dd className="col-sm-9">
            <StatusBadge value={ticket.status} />
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

      {/* One thread, because for a Requester there is only one kind of message. No Internal Notes panel, placeholder,
          or count of hidden messages exists here, and the notes route is never requested (Lab 3 ui-spec §6, BR-24). */}
      <Conversation
        ticketId={ticket.id}
        visibility="PUBLIC"
        label="Conversation"
        heading="Conversation"
        emptyText="No messages yet. Add a comment if you have more information."
        loadingLabel="Loading comments…"
        loadFailure="Unable to load comments."
        refreshKey={commentsVersion}
      >
        <AppearsResolved
          ticket={ticket}
          onFlagged={(flagged) => {
            setLoad({ status: 'loaded', ticket: flagged })
            setCommentsVersion((version) => version + 1)
          }}
        />
      </Conversation>

      <div className="mt-4">
        <Button variant="secondary" onClick={loadTicket}>
          Refresh
        </Button>
      </div>
    </>
  )
}
