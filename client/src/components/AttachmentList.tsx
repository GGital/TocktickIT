import { useId, useState, type ChangeEvent } from 'react'
import Badge from './Badge'
import Button from './Button'
import Callout from './Callout'
import ConfirmDialog from './ConfirmDialog'
import { ApiError, apiFetch } from '../lib/apiClient'

export type Attachment = {
  id: number
  ticketId: number
  originalFilename: string
  mimeType: string
  sizeBytes: number
  uploadedBy: { id: number; fullName: string }
  uploadedAt: string
  isRemoved: boolean
  removedAt: string | null
  removalReason: string | null
  removedBy: { id: number; fullName: string } | null
  downloadUrl: string | null
}

const MAX_ACTIVE = 5
const PERMITTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf']
// Same 5–200 rule the server enforces (BR-17); the server stays authoritative.
const MIN_REASON = 5
const MAX_REASON = 200

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const bangkokTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

type AttachmentListProps = {
  ticketId: number
  attachments: Attachment[]
  /** Called after an upload or a removal so the parent can reload the section. */
  onChanged: () => void
}

/**
 * Attachment section on Ticket Detail (ui-spec §7.2). A removed attachment keeps
 * its metadata and loses every control that could reach its bytes (BR-32, AC-26).
 */
export default function AttachmentList({ ticketId, attachments, onChanged }: AttachmentListProps) {
  const inputId = useId()
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  const [reason, setReason] = useState('')
  const [removeBusy, setRemoveBusy] = useState(false)

  const active = attachments.filter((item) => !item.isRemoved)
  const removed = attachments.filter((item) => item.isRemoved)
  const limitReached = active.length >= MAX_ACTIVE

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(file.name)

    const body = new FormData()
    body.append('file', file)

    try {
      await apiFetch(`/tickets/${ticketId}/attachments`, { method: 'POST', body })
      onChanged()
    } catch (error) {
      // The exact server reason is shown, not a generic failure (ui-spec §7.2).
      setUploadError(error instanceof ApiError ? error.message : 'The file could not be uploaded.')
    } finally {
      setUploading(null)
    }
  }

  async function confirmRemoval() {
    if (!removing) return

    setRemoveBusy(true)
    try {
      await apiFetch(`/attachments/${removing.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removalReason: reason.trim() }),
      })
      setRemoving(null)
      setReason('')
      onChanged()
    } catch (error) {
      setUploadError(
        error instanceof ApiError ? error.message : 'The attachment could not be removed.',
      )
      setRemoving(null)
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <section className="zen-card">
      <h2>
        Attachments ({active.length} active of {MAX_ACTIVE})
      </h2>

      <div className="d-flex flex-wrap align-items-center gap-3">
        <label
          className={`btn btn-outline-primary mb-0 ${limitReached || uploading ? 'disabled' : ''}`}
          htmlFor={inputId}
        >
          Add attachment
        </label>
        <input
          id={inputId}
          type="file"
          className="visually-hidden"
          accept={PERMITTED_EXTENSIONS.join(',')}
          disabled={limitReached || uploading !== null}
          onChange={handleUpload}
        />
        <p className="zen-help mb-0">JPG, PNG, WEBP or PDF · max 5 MB each</p>
      </div>

      {limitReached && (
        <p className="zen-help">Attachment limit reached. Remove an attachment to add another.</p>
      )}

      {uploading && (
        <div className="mt-3" aria-busy="true">
          <p className="zen-help mb-1">Uploading… {uploading}</p>
          <div className="zen-skeleton zen-skeleton-row" />
        </div>
      )}

      {uploadError && (
        <div className="mt-3">
          <Callout variant="error">
            {uploadError}
            <button
              type="button"
              className="btn btn-link p-0 ms-2"
              onClick={() => setUploadError(null)}
            >
              Dismiss
            </button>
          </Callout>
        </div>
      )}

      {attachments.length === 0 && !uploading && (
        <p className="zen-help mt-3 mb-0">No attachments on this ticket.</p>
      )}

      {active.length > 0 && (
        <ul className="list-unstyled mt-3 mb-0">
          {active.map((attachment) => (
            <li
              key={attachment.id}
              className="d-flex flex-wrap align-items-center gap-2 border-top py-2"
            >
              {IMAGE_TYPES.includes(attachment.mimeType) ? (
                // Preview is fetched through the ownership-checked download route (A-15).
                <img
                  src={attachment.downloadUrl ?? ''}
                  alt={attachment.originalFilename}
                  width={48}
                  height={48}
                  className="zen-thumbnail"
                />
              ) : (
                <span aria-hidden="true">📄</span>
              )}

              <span className="zen-filename text-truncate" title={attachment.originalFilename}>
                {attachment.originalFilename}
              </span>
              <span className="zen-help mb-0">{formatSize(attachment.sizeBytes)}</span>
              <span className="zen-help mb-0">{bangkokTime(attachment.uploadedAt)}</span>

              <span className="ms-auto d-flex gap-2">
                <a
                  className="btn btn-outline-primary"
                  href={attachment.downloadUrl ?? undefined}
                  download={attachment.originalFilename}
                >
                  Download
                </a>
                <Button
                  variant="destructive"
                  aria-label={`Remove ${attachment.originalFilename}`}
                  onClick={() => {
                    setReason('')
                    setRemoving(attachment)
                  }}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <>
          <h3 className="mt-4">Removed</h3>
          <ul className="list-unstyled mb-0">
            {removed.map((attachment) => (
              <li key={attachment.id} className="border-top py-2" data-testid="removed-attachment">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span
                    className="zen-filename text-truncate text-decoration-line-through"
                    title={attachment.originalFilename}
                  >
                    {attachment.originalFilename}
                  </span>
                  <Badge kind="attachment" value="REMOVED" />
                </div>
                {/* Metadata is retained; no download, preview, or remove control exists. */}
                <p className="zen-help mb-0">
                  {attachment.removalReason} · {bangkokTime(attachment.removedAt!)}
                  {attachment.removedBy && <> · {attachment.removedBy.fullName}</>}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove attachment"
        confirmLabel="Remove attachment"
        confirmDisabled={reason.trim().length < MIN_REASON}
        busy={removeBusy}
        busyLabel="Removing…"
        onConfirm={confirmRemoval}
        onCancel={() => {
          setRemoving(null)
          setReason('')
        }}
      >
        <p>
          {removing?.originalFilename} will no longer be downloadable. Its record is kept on the
          ticket.
        </p>
        <label className="zen-label" htmlFor="removalReason">
          Reason for removal
          <span className="zen-required" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="removalReason"
          className="zen-control"
          maxLength={MAX_REASON}
          aria-required="true"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="zen-help mb-0">
          {reason.length} / {MAX_REASON} characters, at least {MIN_REASON}
        </p>
      </ConfirmDialog>
    </section>
  )
}
