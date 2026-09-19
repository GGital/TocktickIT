import type { ReactNode } from 'react'

type BadgeProps = {
  /** Selects the `zen-badge-{tone}` colour treatment in zen-theme.css. */
  tone: string
  /** Text that must travel with the value, e.g. "Requested:" (AC-68). */
  prefix?: string
  /** Decoration only; hidden from assistive technology so it is never the sole signal. */
  glyph?: string
  children: ReactNode
}

// ui-spec §2.4, Lab 3 §1.2. The one badge primitive: every family carries its meaning as text, never colour alone.
export default function Badge({ tone, prefix, glyph, children }: BadgeProps) {
  return (
    <span className={`zen-badge zen-badge-${tone}`}>
      {prefix && `${prefix} `}
      {children}
      {glyph && <span aria-hidden="true"> {glyph}</span>}
    </span>
  )
}
