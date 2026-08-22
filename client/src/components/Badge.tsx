// ui-spec §2.4. Every badge carries its own text, so colour is never the only signal (AC-48).
const priority = {
  LOW: { className: 'zen-badge-low', text: 'LOW', glyph: '' },
  MEDIUM: { className: 'zen-badge-medium', text: 'MEDIUM', glyph: '' },
  HIGH: { className: 'zen-badge-high', text: 'HIGH', glyph: '▲' },
  URGENT: { className: 'zen-badge-urgent', text: 'URGENT', glyph: '▲▲' },
} as const

export type Priority = keyof typeof priority

type BadgeProps =
  | { kind: 'priority'; value: Priority }
  | { kind: 'status'; value: 'NEW' }
  | { kind: 'attachment'; value: 'REMOVED' }

export default function Badge(props: BadgeProps) {
  if (props.kind === 'priority') {
    const { className, text, glyph } = priority[props.value]
    return (
      <span className={`zen-badge ${className}`}>
        {text}
        {glyph && <span aria-hidden="true"> {glyph}</span>}
      </span>
    )
  }

  if (props.kind === 'status') {
    return <span className="zen-badge zen-badge-new">NEW</span>
  }

  return <span className="zen-badge zen-badge-removed">Removed</span>
}
