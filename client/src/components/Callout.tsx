import type { ReactNode } from 'react'
import Button from './Button'

// ui-spec §2.5. An error callout always says what failed and offers a way forward.
const surface = {
  success: { className: 'zen-callout-success', role: 'status', glyph: '✓' },
  error: { className: 'zen-callout-error', role: 'alert', glyph: '⚠' },
  warning: { className: 'zen-callout-warning', role: 'alert', glyph: '⚠' },
  info: { className: 'zen-callout-info', role: 'status', glyph: 'ℹ' },
} as const

type CalloutProps = {
  variant: keyof typeof surface
  title?: string
  children: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Overrides the variant's live role, e.g. a warning that is part of the page rather than a reaction to an act. */
  role?: 'status' | 'alert'
}

export default function Callout({
  variant,
  title,
  children,
  onRetry,
  retryLabel = 'Try again',
  role,
}: CalloutProps) {
  const { className, glyph } = surface[variant]

  return (
    <div className={`zen-callout ${className}`} role={role ?? surface[variant].role}>
      <span aria-hidden="true">{glyph}</span>
      <div>
        {title && <h3 className="mb-1">{title}</h3>}
        <div>{children}</div>
        {onRetry && (
          <Button variant="secondary" className="mt-3" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
