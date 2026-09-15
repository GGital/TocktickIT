import { useState } from 'react'
import Button from './Button'
import Callout from './Callout'
import { ApiError } from '../lib/apiClient'

const MAX_LENGTH = 2000
const COUNTER_FROM = 1800

const LABELS = {
  PUBLIC: 'Public — the Requester will see this.',
  INTERNAL: 'Internal — not visible to the Requester.',
} as const

type MessageComposerProps = {
  id: string
  visibility: keyof typeof LABELS
  postLabel: string
  failureMessage: string
  disabled?: boolean
  /** Sends the text; resolves once stored. A rejection keeps the text in the field (BR-66). */
  onPost: (body: string) => Promise<void>
}

/** The text area with its permanent visibility label, the counter, and the post button (ui-spec §2.3). */
export default function MessageComposer({ id, visibility, postLabel, failureMessage, disabled = false, onPost }: MessageComposerProps) {
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const over = text.length > MAX_LENGTH
  const errorId = `${id}-error`

  async function post() {
    setPosting(true)
    setFieldError(null)
    setFailed(false)
    try {
      await onPost(text)
      setText('')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        setFieldError(error.fields?.[0]?.message ?? error.message)
      } else {
        setFailed(true)
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="zen-composer mt-3">
      {failed && (
        <div className="mb-3">
          <Callout variant="error" onRetry={post}>
            {failureMessage}
          </Callout>
        </div>
      )}
      {/* A real label, never a placeholder: it stays visible while typing (ui-spec §2.3). */}
      <label className="zen-label" htmlFor={id}>
        {LABELS[visibility]}
      </label>
      <textarea
        id={id}
        rows={3}
        className="zen-control zen-textarea"
        value={text}
        readOnly={posting}
        disabled={disabled}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
        onChange={(event) => setText(event.target.value)}
      />
      {fieldError && (
        <p className="zen-error-text" id={errorId}>
          {fieldError}
        </p>
      )}
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-3 mt-2">
        {text.length >= COUNTER_FROM && (
          <span className={`zen-help mt-0 ${over ? 'zen-counter-over' : ''}`.trim()}>
            {text.length} / {MAX_LENGTH}
          </span>
        )}
        <Button onClick={post} disabled={disabled || over || text.trim() === ''} busy={posting} busyLabel="Posting…">
          {postLabel}
        </Button>
      </div>
    </div>
  )
}
