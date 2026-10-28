import { useCallback, useEffect, useState } from 'react'
import Callout from './Callout'
import FollowUpBadge from './FollowUpBadge'
import { SkeletonRows } from './Skeleton'
import { apiFetch } from '../lib/apiClient'
import { formatBangkok } from '../lib/formatBangkok'
import { ROLE_LABELS, type Role } from '../lib/roles'

/** The Requester projection (api-spec §2.2): no version, void data, editor, or user ids (BR-43). */
type RequesterAction = {
  id: number
  actionAt: string
  description: string
  result: string
  followUpRequired: boolean
  followUpNote: string | null
  followUpCompleted: boolean
  attachmentNotes: string | null
  performedBy: { fullName: string; role: Role }
  edited: boolean
}

/**
 * "Work done by IT" on the Requester Ticket Detail (ui-spec §7): read-only cards at every viewport. Voided actions
 * never arrive (BR-42), and nothing here can change an action.
 */
export default function RequesterActionsList({ ticketId }: { ticketId: number }) {
  const [actions, setActions] = useState<RequesterAction[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setActions(null)
    apiFetch<RequesterAction[]>(`/tickets/${ticketId}/actions`)
      .then(setActions)
      .catch(() => setFailed(true))
  }, [ticketId])

  useEffect(load, [load])

  return (
    <section className="zen-card mt-4" aria-labelledby="work-done-heading">
      <h2 id="work-done-heading">Work done by IT</h2>

      {failed ? (
        <Callout variant="error" onRetry={load}>
          Unable to load the work done on this ticket.
        </Callout>
      ) : actions === null ? (
        <SkeletonRows rows={2} label="Loading work done by IT…" />
      ) : actions.length === 0 ? (
        <p className="zen-help mb-0">IT has not recorded any work on this ticket yet.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {actions.map((action) => (
            <li key={action.id} className="zen-action-card">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="zen-label mb-0">{formatBangkok(action.actionAt)}</span>
                <FollowUpBadge required={action.followUpRequired} completed={action.followUpCompleted} />
                {action.edited && <span className="zen-edited">Edited</span>}
              </div>
              <p className="zen-action-text mb-2">{action.description}</p>
              <p className="zen-action-text mb-2">
                <strong>Result:</strong> {action.result}
              </p>
              {action.followUpRequired && action.followUpNote && (
                <p className="zen-action-text mb-2">
                  <strong>Follow-up:</strong> {action.followUpNote}
                </p>
              )}
              {action.attachmentNotes && (
                <p className="zen-action-text mb-2">
                  <strong>Attachment notes:</strong> {action.attachmentNotes}
                </p>
              )}
              <p className="zen-help mb-0">
                By {action.performedBy.fullName} ({ROLE_LABELS[action.performedBy.role]})
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
