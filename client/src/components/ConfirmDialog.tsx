import { useEffect, useId, useRef, type ReactNode } from 'react'
import Button from './Button'

// ui-spec §7.3. The native <dialog> supplies the modal semantics, the focus
// trap, Esc-to-close, and focus restoration — no focus-trap dependency needed.
type ConfirmDialogProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  confirmVariant?: 'primary' | 'destructive'
  confirmDisabled?: boolean
  busy?: boolean
  busyLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmVariant = 'destructive',
  confirmDisabled = false,
  busy = false,
  busyLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Unique per dialog: a screen can hold several (attachment removal and the resolution flag share Ticket Detail).
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="zen-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div className="my-3">{children}</div>
      <div className="zen-dialog-actions d-flex justify-content-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={confirmDisabled}
          busy={busy}
          busyLabel={busyLabel}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
