import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import ActionTakenForm, { type ActionTaken } from './ActionTakenForm'
import Badge from './Badge'
import Button from './Button'
import Callout from './Callout'
import ConfirmDialog from './ConfirmDialog'
import EmptyState from './EmptyState'
import FollowUpBadge from './FollowUpBadge'
import RoleBadge from './RoleBadge'
import { SkeletonRows } from './Skeleton'
import TextArea from './TextArea'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import { formatBangkok } from '../lib/formatBangkok'
import type { TicketStatus } from '../lib/ticketLabels'

// BR-14, mirrored only to decide what to offer: the API refuses the write regardless.
const ACTIONABLE: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const FINISHED: TicketStatus[] = ['RESOLVED', 'CLOSED', 'CANCELLED']
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const FORBIDDEN = 'Only the person who recorded this action, the ticket owner, or an administrator can change it.'
// ponytail: "long" by character count, not measured line count; measure the clamped box if rows misjudge it.
const LONG_TEXT = 160

const menuId = (action: ActionTaken) => `action-menu-${action.id}`

type MenuItem = { label: string; onSelect: () => void }

/** The row `⋯` menu (ui-spec §6.2, §11): a menu button with arrow-key movement; Esc returns to the trigger. */
function RowMenu({ id, label, items }: { id: string; label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement)
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      itemRefs.current[(target + items.length) % items.length]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div
      className="zen-row-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="btn btn-outline-primary zen-row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <ul id={listId} role="menu" aria-label={label} className="zen-row-menu-list" onKeyDown={onKeyDown}>
          {items.map((item, index) => (
            <li key={item.label} role="none">
              <button
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  // Focus goes back to the trigger first, so a dialog the item opens returns it there (ui-spec §2.5).
                  close()
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Pending = { kind: 'void' | 'complete'; action: ActionTaken }
type Notice = { variant: 'warning' | 'error'; text: string; retry?: boolean }

type ActionsTakenPanelProps = {
  ticket: { id: number; status: TicketStatus; assignee: { id: number } | null; createdAt: string }
  /** Re-reads the Ticket after a write, so its version and summary follow the actions (ui-spec §6.3). */
  onChanged: () => void
}

/**
 * Actions Taken on the staff Ticket Detail (ui-spec §6.2): the work log in API order, voided rows collapsed, and
 * only the row operations the API says this user may perform.
 */
export default function ActionsTakenPanel({ ticket, onChanged }: ActionsTakenPanelProps) {
  const me = useCurrentUser()!
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const path = `/staff/tickets/${ticket.id}/actions`
  const [actions, setActions] = useState<ActionTaken[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<{ action: ActionTaken | null } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [highlight, setHighlight] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number[]>([])

  const load = useCallback(
    () =>
      apiFetch<ActionTaken[]>(path).then((list) => {
        setActions(list)
        setFailed(false)
        return list
      }),
    [path],
  )

  const retry = useCallback(() => {
    setFailed(false)
    setActions(null)
    load().catch(() => setFailed(true))
  }, [load])

  useEffect(retry, [retry])

  // The saved row scrolls into view with a short highlight; the CSS drops the animation for reduced motion.
  useEffect(() => {
    if (highlight === null) return
    document.getElementById(`action-${highlight}`)?.scrollIntoView?.({ block: 'nearest' })
    const timer = setTimeout(() => setHighlight(null), 2000)
    return () => clearTimeout(timer)
  }, [highlight, actions])

  const loadLatest = (id: number) =>
    load()
      .then((list) => list.find((action) => action.id === id))
      .catch(() => undefined)

  /** Shows the stored row at once, then re-reads the list and the Ticket from the server. */
  function saved(action: ActionTaken, message: string) {
    setActions((current) => {
      const list = current ?? []
      return list.some((row) => row.id === action.id) ? list.map((row) => (row.id === action.id ? action : row)) : [...list, action]
    })
    setAnnouncement(message)
    setHighlight(action.id)
    load().catch(() => undefined)
    onChanged()
  }

  function closePending() {
    if (busy) return
    const target = pending && document.getElementById(menuId(pending.action))
    setPending(null)
    setReason('')
    setNotice(null)
    ;(target ?? headingRef.current)?.focus()
  }

  async function confirmPending() {
    if (!pending) return
    const { kind, action } = pending
    // Always the version on screen now: after a stale refusal the list is re-read, and a retry uses the new one.
    const current = actions?.find((row) => row.id === action.id) ?? action
    setBusy(true)
    setNotice(null)
    try {
      const updated = await apiFetch<ActionTaken>(`${path}/${action.id}/${kind === 'void' ? 'void' : 'complete-follow-up'}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(kind === 'void' ? { expectedVersion: current.version, reason: reason.trim() } : { expectedVersion: current.version }),
      })
      setPending(null)
      setReason('')
      saved(updated, kind === 'void' ? 'Action voided.' : 'Follow-up marked done.')
      ;(document.getElementById(menuId(action)) ?? headingRef.current)?.focus()
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (code === 'STALE_ACTION') {
        setNotice({ variant: 'warning', text: 'Someone else changed this action. The list now shows the latest version — check it, then try again.' })
        load().catch(() => undefined)
      } else if (code === 'ACTION_ALREADY_VOIDED' || code === 'FOLLOW_UP_NOT_OUTSTANDING') {
        setNotice({ variant: 'warning', text: code === 'ACTION_ALREADY_VOIDED' ? 'This action was voided by someone else.' : (error as ApiError).message })
        load().catch(() => undefined)
      } else if (code === 'FORBIDDEN') {
        setNotice({ variant: 'warning', text: FORBIDDEN })
      } else if (code === 'TICKET_NOT_ACTIONABLE' || code === 'VALIDATION_FAILED') {
        setNotice({ variant: 'warning', text: (error as ApiError).fields?.[0]?.message ?? (error as ApiError).message })
      } else {
        setNotice({ variant: 'error', text: kind === 'void' ? 'The action was not voided.' : 'The follow-up was not marked done.', retry: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const refusal = FINISHED.includes(ticket.status)
    ? 'Reopen this ticket to record more work.'
    : !ACTIONABLE.includes(ticket.status) || ticket.assignee === null
      ? 'Claim or assign this ticket to record actions.'
      : null
  const count = actions?.filter((action) => !action.voided).length
  const performer = (person: ActionTaken['performedBy']) => (person.id === me.id ? 'You' : person.fullName)
  const toggle = (id: number) => setExpanded((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))

  const menuItems = (action: ActionTaken): MenuItem[] =>
    [
      action.canEdit && { label: 'Edit', onSelect: () => setForm({ action }) },
      action.followUpOutstanding && { label: 'Mark follow-up done', onSelect: () => setPending({ kind: 'complete', action }) },
      action.canEdit && { label: 'Void', onSelect: () => setPending({ kind: 'void', action }) },
    ].filter((item): item is MenuItem => Boolean(item))

  const noticeCallout = notice && (
    <div className="mb-3">
      <Callout variant={notice.variant} onRetry={notice.retry ? () => void confirmPending() : undefined}>
        {notice.text}
      </Callout>
    </div>
  )

  return (
    <section id="actions" className="zen-card mt-4 zen-actions" aria-labelledby={headingId}>
      <div className="zen-actions-header d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="mb-0">
          Actions Taken{count !== undefined && ` (${count})`}
        </h2>
        {refusal ? (
          <p className="zen-help mt-0 mb-0">{refusal}</p>
        ) : (
          <Button className="zen-actions-record" onClick={() => setForm({ action: null })}>
            Record action
          </Button>
        )}
      </div>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      {failed ? (
        <Callout variant="error" onRetry={retry}>
          Unable to load actions.
        </Callout>
      ) : actions === null ? (
        <SkeletonRows rows={3} label="Loading actions…" />
      ) : actions.length === 0 ? (
        <EmptyState heading="No actions recorded yet." body={refusal ?? 'Record the work done on this ticket. The Requester can read it.'} />
      ) : (
        <table className="zen-actions-table">
          <caption className="visually-hidden">Actions Taken, oldest first</caption>
          <thead>
            <tr>
              {/* Shows the fixed order; it is not a sort control (ui-spec §6.2). */}
              <th scope="col" aria-sort="ascending">
                Date/Time <span aria-hidden="true">▴</span>
              </th>
              <th scope="col">Description</th>
              <th scope="col">Result</th>
              <th scope="col">Performed by</th>
              <th scope="col">Follow-up</th>
              <th scope="col">Attachment notes</th>
              <th scope="col">
                <span className="visually-hidden">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              const when = formatBangkok(action.actionAt)
              const rowClass = highlight === action.id ? 'zen-row-highlight' : undefined

              if (action.voided) {
                return (
                  <tr key={action.id} id={`action-${action.id}`} className={`zen-action-voided ${rowClass ?? ''}`.trim()}>
                    <td colSpan={7}>
                      <details>
                        <summary>
                          <Badge tone="voided">Voided</Badge>
                          {` · ${when} · ${performer(action.performedBy)} · "${action.voidReason}"`}
                        </summary>
                        <dl className="zen-voided-values mb-0 mt-2">
                          <dt>Description</dt>
                          <dd>{action.description}</dd>
                          <dt>Result</dt>
                          <dd>{action.result}</dd>
                          <dt>Follow-up</dt>
                          <dd>{action.followUpRequired ? action.followUpNote : 'No follow-up'}</dd>
                          <dt>Attachment notes</dt>
                          <dd>{action.attachmentNotes ?? '—'}</dd>
                          <dt>Voided by</dt>
                          <dd>
                            {action.voidedBy ? performer(action.voidedBy) : '—'}
                            {action.voidedAt && `, ${formatBangkok(action.voidedAt)}`}
                          </dd>
                        </dl>
                      </details>
                    </td>
                  </tr>
                )
              }

              const open = expanded.includes(action.id)
              const long = action.description.length > LONG_TEXT || action.result.length > LONG_TEXT || action.followUpNote !== null
              // A Ticket that refuses work refuses every row write too, so the reason line stands alone (A-08).
              const items = refusal ? [] : menuItems(action)
              return (
                <tr key={action.id} id={`action-${action.id}`} className={rowClass}>
                  <td data-label="Date/Time" className="zen-action-when">
                    {when}
                  </td>
                  <td data-label="Description">
                    <p className={`zen-action-text mb-0 ${open ? '' : 'zen-clamp'}`.trim()}>{action.description}</p>
                    {long && (
                      <Button variant="tertiary" className="px-0 zen-show-more" aria-expanded={open} onClick={() => toggle(action.id)}>
                        {open ? 'Show less' : 'Show more'}
                      </Button>
                    )}
                  </td>
                  <td data-label="Result">
                    <p className={`zen-action-text mb-0 ${open ? '' : 'zen-clamp'}`.trim()}>{action.result}</p>
                  </td>
                  <td data-label="Performed by">
                    <span>{performer(action.performedBy)}</span>
                    {action.performedBy.role === 'ADMINISTRATOR' && (
                      <>
                        {' '}
                        <RoleBadge role="ADMINISTRATOR" />
                      </>
                    )}
                    {action.lastEditedBy && (
                      <div className="zen-edited">{`Edited by ${action.lastEditedBy.fullName}, ${formatBangkok(action.updatedAt)}`}</div>
                    )}
                  </td>
                  <td data-label="Follow-up">
                    <FollowUpBadge required={action.followUpRequired} completed={action.followUpCompletedAt !== null} />
                    {open && action.followUpNote && <p className="zen-action-text mb-0 mt-1">{action.followUpNote}</p>}
                  </td>
                  <td data-label="Attachment notes">
                    {action.attachmentNotes ? (
                      <span className="zen-ellipsis" title={action.attachmentNotes}>
                        {action.attachmentNotes}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="zen-action-menu">
                    {items.length > 0 && <RowMenu id={menuId(action)} label={`Actions for action recorded ${when}`} items={items} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {form && (
        <ActionTakenForm
          ticketId={ticket.id}
          ticketCreatedAt={ticket.createdAt}
          action={form.action}
          me={me}
          loadLatest={() => loadLatest(form.action?.id ?? 0)}
          onClose={() => setForm(null)}
          onSaved={(action) => {
            setForm(null)
            saved(action, 'Action saved.')
          }}
        />
      )}

      {pending?.kind === 'void' && (
        <ConfirmDialog
          open
          title={`Void action recorded ${formatBangkok(pending.action.actionAt)} by ${pending.action.performedBy.fullName}?`}
          confirmLabel="Void action"
          confirmDisabled={reason.trim() === ''}
          busy={busy}
          busyLabel="Voiding…"
          onConfirm={() => void confirmPending()}
          onCancel={closePending}
        >
          <p>
            Voided actions stay in the staff history, are hidden from the Requester, and no longer count toward resolving
            the ticket. This cannot be undone.
          </p>
          {noticeCallout}
          <TextArea
            id="voidReason"
            label="Reason for voiding"
            required
            rows={3}
            maxLength={500}
            counterMax={500}
            autoFocus
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </ConfirmDialog>
      )}

      {pending?.kind === 'complete' && (
        <ConfirmDialog
          open
          title={`Mark the follow-up for the action on ${formatBangkok(pending.action.actionAt)} as done?`}
          confirmLabel="Mark done"
          confirmVariant="primary"
          busy={busy}
          busyLabel="Saving…"
          onConfirm={() => void confirmPending()}
          onCancel={closePending}
        >
          {noticeCallout}
          <p className="mb-0">The note will be kept.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
