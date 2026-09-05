import type { ReactNode } from 'react'

// ui-spec §2.5. Same shape for empty and no-results; the copy and the primary
// action differ, and the two states are never collapsed into one (BR-42).
type EmptyStateProps = {
  heading: string
  body: ReactNode
  action?: ReactNode
}

export default function EmptyState({ heading, body, action }: EmptyStateProps) {
  return (
    <div className="zen-card zen-empty">
      <h2>{heading}</h2>
      <p>{body}</p>
      {action}
    </div>
  )
}
