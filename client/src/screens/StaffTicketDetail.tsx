import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Callout from '../components/Callout'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ForbiddenState from '../components/ForbiddenState'
import Conversation from '../components/Conversation'
import PriorityBadge, { type Priority } from '../components/PriorityBadge'
import RadioGroup from '../components/RadioGroup'
import SelectField from '../components/SelectField'
import { SkeletonCard } from '../components/Skeleton'
import StatusBadge, { ResolutionFlagBadge } from '../components/StatusBadge'
import type { Attachment } from '../components/AttachmentList'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import type { Role } from '../lib/roles'
import { permittedTargets, PRIORITIES, STATUS_LABELS, type TicketStatus } from '../lib/ticketLabels'

type Person = { id: number; fullName: string }

/** The staff Ticket detail shape (api-spec §2.6). */
type StaffTicket = {
  id: number
  ticketNumber: string
  summary: string
  description: string
  category: { id: number; name: string }
  relatedSystem: { id: number; name: string }
  requester: Person & { email: string; department: string | null }
  requestedPriority: Priority
  itPriority: Priority
  status: TicketStatus
  assignee: Person | null
  requesterResolvedFlaggedAt: string | null
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

const bangkokTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const PRIORITY_LABELS: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' }
/** Transitions that need an explicit confirmation before the request is sent (BR-37, AC-44). */
const CONFIRM_VERBS: Partial<Record<TicketStatus, string>> = { RESOLVED: 'Resolve', CLOSED: 'Close', CANCELLED: 'Cancel' }

type Control = 'owner' | 'priority' | 'status'
const FAILURES: Record<Control, string> = {
  owner: 'The ticket owner could not be changed. Please try again.',
  priority: 'The IT priority could not be saved. Please try again.',
  status: 'The status could not be changed. Please try again.',
}

function Saving({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="zen-help d-inline-flex align-items-center mt-0">
      <span className="zen-spinner" aria-hidden="true" />
      Saving…
    </span>
  )
}

/** Owner, IT Priority, and status (ui-spec §8.2). Every change is refused by the API if it is not allowed. */
function Operations({ ticket, onUpdated, onStale }: { ticket: StaffTicket; onUpdated: (ticket: StaffTicket) => void; onStale: () => void }) {
  const me = useCurrentUser()!
  const [assignees, setAssignees] = useState<Person[]>([])
  const [busy, setBusy] = useState<Control | null>(null)
  const [pendingOwner, setPendingOwner] = useState<string | null>(null)
  const [pendingPriority, setPendingPriority] = useState<Priority | null>(null)
  const [nextStatus, setNextStatus] = useState<TicketStatus | ''>('')
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<{ variant: 'warning' | 'error'; text: string } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    apiFetch<Person[]>('/staff/assignees')
      .then(setAssignees)
      .catch(() => setAssignees([]))
  }, [])

  /** Sends one operation; the response is the updated Ticket, so badges and controls refresh from one source. */
  async function send(control: Control, action: string, body: object, done: string, conflict: (code: string) => string | null) {
    setBusy(control)
    setNotice(null)
    try {
      onUpdated(
        await apiFetch<StaffTicket>(`/staff/tickets/${ticket.id}/${action}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      )
      setAnnouncement(done)
    } catch (error) {
      const text = error instanceof ApiError ? conflict(error.code) : null
      setNotice(text ? { variant: 'warning', text } : { variant: 'error', text: FAILURES[control] })
    } finally {
      // Clearing the pending value is the reset: each control falls back to the Ticket's stored value.
      setBusy(null)
      setPendingOwner(null)
      setPendingPriority(null)
    }
  }

  const assign = (assigneeId: number | 'me' | null, done: string) =>
    send('owner', 'assignment', { assigneeId }, done, (code) =>
      code === 'INVALID_ASSIGNEE' ? 'That person cannot own a ticket.' : null,
    )

  async function saveStatus(to: TicketStatus) {
    setConfirming(false)
    await send('status', 'status', { status: to }, `Status changed to ${STATUS_LABELS[to]}.`, (code) => {
      if (code !== 'INVALID_STATUS_TRANSITION') return null
      // Someone else may have changed the Ticket; reload so the select offers what is permitted now.
      onStale()
      return `This ticket cannot move from ${STATUS_LABELS[ticket.status]} to ${STATUS_LABELS[to]}.`
    })
    setNextStatus('')
  }

  const owner = ticket.assignee
  const ownerOptions = assignees.map((person) => ({ value: String(person.id), label: person.fullName }))
  // An owner who has since been deactivated is still shown rather than silently displayed as Unassigned.
  if (owner && assignees.length > 0 && !assignees.some((person) => person.id === owner.id)) {
    ownerOptions.push({ value: String(owner.id), label: `${owner.fullName} (no longer eligible)` })
  }
  const targets = permittedTargets(ticket.status, owner !== null)
  const verb = nextStatus ? CONFIRM_VERBS[nextStatus] : undefined

  return (
    <>
      {notice && (
        <div className="mb-3">
          <Callout variant={notice.variant}>{notice.text}</Callout>
        </div>
      )}
      <section className="zen-card" aria-labelledby="operations-heading">
        <h2 id="operations-heading">Operations</h2>
        <p role="status" className="visually-hidden">
          {announcement}
        </p>

        <SelectField
          id="ticketOwner"
          label="Ticket owner"
          placeholder="Unassigned"
          options={ownerOptions}
          value={pendingOwner ?? (owner ? String(owner.id) : '')}
          disabled={busy === 'owner'}
          onChange={(event) => {
            const value = event.target.value
            setPendingOwner(value)
            void assign(value === '' ? null : Number(value), value === '' ? 'Ticket unassigned.' : 'Ticket owner changed.')
          }}
        />
        <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
          {owner?.id !== me.id && (
            <Button disabled={busy === 'owner'} onClick={() => void assign('me', 'Ticket claimed.')}>
              Claim
            </Button>
          )}
          {owner && (
            <Button variant="secondary" disabled={busy === 'owner'} onClick={() => void assign(null, 'Ticket unassigned.')}>
              Unassign
            </Button>
          )}
          <Saving show={busy === 'owner'} />
        </div>

        <RadioGroup
          id="itPriority"
          name="itPriority"
          label="IT Priority"
          options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
          value={pendingPriority ?? ticket.itPriority}
          disabled={busy === 'priority'}
          helper={
            <>
              The requester asked for <PriorityBadge kind="requested" value={ticket.requestedPriority} />{' '}
              <Saving show={busy === 'priority'} />
            </>
          }
          onChange={(value) => {
            setPendingPriority(value as Priority)
            void send('priority', 'priority', { itPriority: value }, 'IT Priority saved.', () => null)
          }}
        />

        <SelectField
          id="nextStatus"
          label="Status"
          placeholder={`${STATUS_LABELS[ticket.status]} (current)`}
          options={targets.map((value) => ({ value, label: STATUS_LABELS[value] }))}
          value={nextStatus}
          disabled={targets.length === 0 || busy === 'status'}
          helper={
            targets.length === 0
              ? `${STATUS_LABELS[ticket.status]} is final; no further status change is possible.`
              : 'Only permitted next statuses are listed.'
          }
          onChange={(event) => setNextStatus(event.target.value as TicketStatus | '')}
        />
        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Enabled even before a status is chosen: disabling it when the dialog resets the select would drop the
              focus the dialog hands back to it (ui-spec §2.4). With nothing chosen it moves focus to the select. */}
          <Button
            variant="secondary"
            disabled={targets.length === 0}
            busy={busy === 'status'}
            busyLabel="Saving…"
            onClick={() => {
              if (nextStatus === '') return document.getElementById('nextStatus')?.focus()
              if (CONFIRM_VERBS[nextStatus]) setConfirming(true)
              else void saveStatus(nextStatus)
            }}
          >
            Save status
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirming && verb !== undefined}
        title={`${verb} ticket ${ticket.ticketNumber}?`}
        confirmLabel={`${verb} ticket`}
        confirmVariant={nextStatus === 'CANCELLED' ? 'destructive' : 'primary'}
        cancelLabel="Keep current status"
        onConfirm={() => nextStatus && void saveStatus(nextStatus)}
        onCancel={() => {
          setConfirming(false)
          setNextStatus('')
        }}
      >
        <p className="mb-0">
          The status will change from {STATUS_LABELS[ticket.status]} to {nextStatus && STATUS_LABELS[nextStatus]}.
        </p>
      </ConfirmDialog>
    </>
  )
}

/** Read-only Ticket information (ui-spec §8.1, FR-29): a definition list, never disabled inputs. */
function Information({ ticket }: { ticket: StaffTicket }) {
  const rows: [string, ReactNode, string?][] = [
    ['Ticket Number', ticket.ticketNumber, 'zen-mono'],
    ['Ticket Date', bangkokTime(ticket.createdAt)],
    ['Requester', ticket.requester.department ? `${ticket.requester.fullName} — ${ticket.requester.department}` : ticket.requester.fullName],
    ['Category', ticket.category.name],
    ['Related System', ticket.relatedSystem.name],
    ['Requested Priority', <PriorityBadge key="requested" kind="requested" value={ticket.requestedPriority} />],
    ['Last updated', bangkokTime(ticket.updatedAt)],
    ['Summary', ticket.summary],
    ['Description', ticket.description, 'zen-description'],
  ]

  return (
    <section className="zen-card" aria-labelledby="information-heading">
      <h2 id="information-heading">Ticket information</h2>
      {/* Short values sit beside their label from 576 px up; Summary and Description take the full width. */}
      <dl className="mb-0">
        {rows.map(([term, value, className]) => {
          const long = term === 'Summary' || term === 'Description'
          return (
            <div key={term} className="row g-0 align-items-center">
              <dt className={`zen-label mb-1 ${long ? 'col-12' : 'col-sm-4 mb-sm-3'}`}>{term}</dt>
              <dd className={`zen-readonly-value ${long ? 'col-12' : 'col-sm-8'} ${className ?? ''}`.trim()}>{value}</dd>
            </div>
          )
        })}
      </dl>

      {/* Attachment bytes are Requester-only (api-spec §3.5), so staff see the record without download controls. */}
      <h3 className="mt-4">Attachments</h3>
      {ticket.attachments.length === 0 ? (
        <p className="zen-help mb-0">No attachments on this ticket.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {ticket.attachments.map((attachment) => (
            <li key={attachment.id} className="d-flex flex-wrap align-items-center gap-2 border-top py-2">
              <span className="zen-filename text-truncate" title={attachment.originalFilename}>
                {attachment.originalFilename}
              </span>
              <span className="zen-help mt-0">{bangkokTime(attachment.uploadedAt)}</span>
              {attachment.isRemoved && <Badge tone="removed">Removed</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Load = 'loading' | 'loaded' | 'not-found' | 'forbidden' | 'error'

/** IT Staff Ticket Detail (ui-spec §8): information left, operations right, conversations full width below. */
export default function StaffTicketDetail() {
  const { id } = useParams()
  const role = useCurrentUser()!.role as Role
  const [load, setLoad] = useState<Load>('loading')
  const [ticket, setTicket] = useState<StaffTicket | null>(null)

  const loadTicket = useCallback(
    (quiet = false) => {
      if (!quiet) setLoad('loading')
      apiFetch<StaffTicket>(`/staff/tickets/${id}`)
        .then((loaded) => {
          setTicket(loaded)
          setLoad('loaded')
        })
        .catch((error) => {
          // A quiet reload keeps the Ticket on screen; the operation that triggered it already said what failed.
          if (quiet) return
          const status = error instanceof ApiError ? error.status : 0
          setLoad(status === 404 || status === 400 ? 'not-found' : status === 403 ? 'forbidden' : 'error')
        })
    },
    [id],
  )

  useEffect(() => loadTicket(), [loadTicket])

  if (load === 'loading') {
    return (
      <div className="row g-4">
        <div className="col-lg-5 order-lg-2">
          <SkeletonCard lines={6} label="Loading ticket operations…" />
        </div>
        <div className="col-lg-7 order-lg-1">
          <SkeletonCard lines={8} label="Loading ticket…" />
        </div>
      </div>
    )
  }

  if (load === 'not-found') {
    return (
      <EmptyState
        heading="Ticket not found."
        body="This ticket does not exist. Check the ticket number and try again."
        action={
          <Link className="btn btn-primary" to="/staff/tickets">
            Back to Ticket Queue
          </Link>
        }
      />
    )
  }

  if (load === 'forbidden') return <ForbiddenState role={role} />

  if (load === 'error' || !ticket) {
    return (
      <Callout variant="error" onRetry={() => loadTicket()}>
        Unable to load this ticket.
      </Callout>
    )
  }

  return (
    <>
      <Link to="/staff/tickets">‹ Back to Ticket Queue</Link>

      <div className="d-flex flex-wrap align-items-center gap-2 mt-2 mb-3">
        <h1 className="zen-mono mb-0 me-2">{ticket.ticketNumber}</h1>
        <div className="d-flex flex-wrap align-items-center gap-2" data-testid="ticket-badges">
          <StatusBadge value={ticket.status} />
          <PriorityBadge kind="it" value={ticket.itPriority} />
          <PriorityBadge kind="requested" value={ticket.requestedPriority} />
          {ticket.requesterResolvedFlaggedAt && <ResolutionFlagBadge />}
        </div>
      </div>
      {ticket.requesterResolvedFlaggedAt && (
        <p className="zen-help mb-3">Requester reported it resolved {bangkokTime(ticket.requesterResolvedFlaggedAt)}</p>
      )}

      {/* Operations come first in the document, so tablet and mobile show them under the badges and above the
          description; on desktop they move to the right-hand column (ui-spec §8.1, §10). */}
      <div className="row g-4">
        <div className="col-lg-5 order-lg-2">
          <Operations ticket={ticket} onUpdated={setTicket} onStale={() => loadTicket(true)} />
        </div>
        <div className="col-lg-7 order-lg-1">
          <Information ticket={ticket} />
        </div>
      </div>

      <Conversation
        ticketId={ticket.id}
        visibility="PUBLIC"
        label="Public Comments"
        heading="Public Comments"
        emptyText="No public comments yet."
        loadingLabel="Loading public comments…"
        loadFailure="Unable to load public comments."
      />
      {/* Four independent signals: warning border and heading, this suffix, the composer label, and a lock on every
          note — so no single failure can make the panel look public (ui-spec §8.3). */}
      <Conversation
        ticketId={ticket.id}
        visibility="INTERNAL"
        className="zen-internal"
        label="Internal Notes, not visible to the Requester"
        heading={
          <>
            Internal Notes{' '}
            <span className="zen-internal-suffix">
              <span aria-hidden="true">⚠ </span>Not visible to the Requester
            </span>
          </>
        }
        emptyText="No internal notes yet."
        loadingLabel="Loading internal notes…"
        loadFailure="Unable to load internal notes."
      />
    </>
  )
}
