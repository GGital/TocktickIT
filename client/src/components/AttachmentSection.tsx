import { useId, type ChangeEvent } from 'react'
import Button from './Button'
import { PERMITTED_EXTENSIONS, checkStagedFile } from '../lib/validation'

export type StagedFile = {
  id: string
  file: File
  /** Set when the client pre-check rejected it; such a file is never uploaded. */
  error?: string
}

export const MAX_STAGED_FILES = 5

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

type AttachmentSectionProps = {
  staged: StagedFile[]
  onChange: (staged: StagedFile[]) => void
  disabled?: boolean
}

/**
 * Staged attachments on Create Ticket (ui-spec §5.5). Files are only selected here;
 * they upload one request each after the ticket exists (BR-29).
 */
export default function AttachmentSection({
  staged,
  onChange,
  disabled = false,
}: AttachmentSectionProps) {
  const inputId = useId()
  const validCount = staged.filter((item) => !item.error).length
  const limitReached = validCount >= MAX_STAGED_FILES

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? [])
    let accepted = validCount

    const added = chosen.map((file, index) => {
      // The pre-check gives instant feedback; the server re-checks every byte.
      let error = checkStagedFile(file)
      if (!error && accepted >= MAX_STAGED_FILES) error = 'Not staged - attachment limit reached'
      if (!error) accepted += 1

      return { id: `${file.name}-${file.size}-${staged.length + index}`, file, error }
    })

    onChange([...staged, ...added])
    // Allow re-selecting the same file after removing it.
    event.target.value = ''
  }

  return (
    <section className="zen-card mb-4">
      <h2>Attachments ({validCount} of {MAX_STAGED_FILES})</h2>

      <div className="d-flex flex-wrap align-items-center gap-3">
        <label className="btn btn-outline-primary mb-0" htmlFor={inputId}>
          Choose files
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          className="visually-hidden"
          accept={PERMITTED_EXTENSIONS.join(',')}
          disabled={disabled || limitReached}
          onChange={handleSelect}
        />
        <p className="zen-help mb-0">
          JPG, PNG, WEBP or PDF · max 5 MB each · up to {MAX_STAGED_FILES} files
        </p>
      </div>

      {limitReached && <p className="zen-help">Attachment limit reached</p>}

      {staged.length > 0 && (
        <ul className="list-unstyled mt-3 mb-0">
          {staged.map((item) => (
            <li
              key={item.id}
              className="d-flex flex-wrap align-items-center gap-2 border-top py-2"
              data-testid="staged-file"
            >
              <span className="zen-filename text-truncate" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="zen-help mb-0">{formatSize(item.file.size)}</span>
              {item.error && (
                <span className="zen-error-text mb-0" role="alert">
                  {item.error}
                </span>
              )}
              <Button
                variant="destructive"
                className="ms-auto"
                disabled={disabled}
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onChange(staged.filter((other) => other.id !== item.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
