import Badge from './Badge'

type FollowUpState = 'outstanding' | 'completed' | 'none'

const LABELS: Record<FollowUpState, { text: string; glyph?: string }> = {
  outstanding: { text: 'Follow-up outstanding', glyph: '◷' },
  completed: { text: 'Follow-up done', glyph: '✓' },
  none: { text: 'No follow-up' },
}

/** The three follow-up states (ui-spec §1.2), told apart by their text, never by colour alone (AC-52). */
export default function FollowUpBadge({ required, completed }: { required: boolean; completed: boolean }) {
  const state: FollowUpState = !required ? 'none' : completed ? 'completed' : 'outstanding'
  const { text, glyph } = LABELS[state]
  return (
    <Badge tone={`followup-${state}`} glyph={glyph}>
      {text}
    </Badge>
  )
}

