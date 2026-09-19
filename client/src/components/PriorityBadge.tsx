import Badge from './Badge'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

const GLYPHS: Partial<Record<Priority, string>> = { HIGH: '▲', URGENT: '▲▲' }

/**
 * Requested Priority and IT Priority share one palette, so the mandatory prefix is what tells them apart — in
 * greyscale and to a colour-blind reader (AC-68, ui-spec §1.2).
 */
export default function PriorityBadge({ kind, value }: { kind: 'requested' | 'it'; value: Priority }) {
  return (
    <Badge tone={value.toLowerCase()} prefix={kind === 'requested' ? 'Requested:' : 'IT:'} glyph={GLYPHS[value]}>
      {value}
    </Badge>
  )
}
