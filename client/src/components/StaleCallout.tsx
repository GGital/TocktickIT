import type { ReactNode } from 'react'

/**
 * The stale-update warning (ui-spec §2.6): what changed, the latest saved values, and the user's explicit choices.
 * It never retries on its own (BR-30); the caller passes the buttons that act.
 */
export default function StaleCallout({ message, children, actions }: { message: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="zen-callout zen-callout-warning" role="alert">
      <span aria-hidden="true">⚠</span>
      <div className="flex-grow-1">
        <p className="mb-2">{message}</p>
        {children}
        {actions && <div className="d-flex flex-wrap gap-2 mt-3">{actions}</div>}
      </div>
    </div>
  )
}
