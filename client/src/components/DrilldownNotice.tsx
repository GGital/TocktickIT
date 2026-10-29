import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from './Button'

/**
 * "Showing: {card label}" when a list was opened from a dashboard (ui-spec §8). The filters themselves stay visible
 * in the controls; this only names where they came from. Any filter change replaces the history entry, which drops
 * the card's label with it, because the list no longer is that card's list.
 */
export default function DrilldownNotice({ onClear }: { onClear: () => void }) {
  const showing = (useLocation().state as { showing?: string } | null)?.showing
  const [dismissed, setDismissed] = useState(false)
  if (!showing || dismissed) return null

  return (
    <div className="zen-callout zen-callout-info mb-3" role="status">
      <span aria-hidden="true">ℹ</span>
      <div className="d-flex flex-wrap align-items-center gap-2 flex-grow-1">
        <span className="me-auto">Showing: {showing}</span>
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
        <Button variant="tertiary" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          <span aria-hidden="true">×</span>
        </Button>
      </div>
    </div>
  )
}
