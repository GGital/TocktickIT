import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import Button from './Button'
import Callout from './Callout'
import FollowUpBadge from './FollowUpBadge'
import RadioGroup from './RadioGroup'
import StaleCallout from './StaleCallout'
import TextArea from './TextArea'
import TextField from './TextField'
import { ApiError, apiFetch } from '../lib/apiClient'
import { validateAction, type ActionErrors, type ActionField, type ActionPayload } from '../lib/actionValidation'
import { formatBangkok, fromBangkokInput, toBangkokInput } from '../lib/formatBangkok'
import type { Role } from '../lib/roles'

type Person = { id: number; fullName: string; role: Role }

/** The staff ActionTaken projection (api-spec §2.1). */
export type ActionTaken = {
  id: number
  ticketId: number
  actionAt: string
  description: string
  result: string
  followUpRequired: boolean
  followUpNote: string | null
  followUpCompletedAt: string | null
  followUpCompletedBy: Person | null
  followUpOutstanding: boolean
  attachmentNotes: string | null
  performedBy: Person
  lastEditedBy: Person | null
  voided: boolean
  voidedAt: string | null
  voidedBy: Person | null
  voidReason: string | null
  version: number
  createdAt: string
  updatedAt: string
  canEdit: boolean
}

type Values = {
  actionAt: string
  description: string
  result: string
  followUp: '' | 'yes' | 'no'
  followUpNote: string
  attachmentNotes: string
}
type Notice = { variant: 'warning' | 'error'; text: string; retry?: boolean }

/** Control id and label per API field, so server field errors land under the same control (BR-13). */
const FIELDS: Record<ActionField, { id: string; label: string }> = {
  actionAt: { id: 'actionAt', label: 'Action date and time (Bangkok time)' },
  description: { id: 'actionDescription', label: 'Action description' },
  result: { id: 'actionResult', label: 'Result' },
  followUpRequired: { id: 'followUpRequired', label: 'Follow-up required?' },
  followUpNote: { id: 'followUpNote', label: 'Follow-up note' },
  attachmentNotes: { id: 'attachmentNotes', label: 'Attachment notes' },
}
const JSON_HEADERS = { 'Content-Type': 'application/json' }
const FORBIDDEN = 'Only the person who recorded this action, the ticket owner, or an administrator can change it.'

const fromAction = (action: ActionTaken): Values => ({
  actionAt: toBangkokInput(action.actionAt),
  description: action.description,
  result: action.result,
  followUp: action.followUpRequired ? 'yes' : 'no',
  followUpNote: action.followUpNote ?? '',
  attachmentNotes: action.attachmentNotes ?? '',
})

/** The values as the API takes them. A hidden note stays in state but is never sent (AC-39). */
const toPayload = (values: Values): ActionPayload => ({
  actionAt: values.actionAt ? fromBangkokInput(values.actionAt) : '',
  description: values.description.trim(),
  result: values.result.trim(),
  followUpRequired: values.followUp === '' ? null : values.followUp === 'yes',
  followUpNote: values.followUp === 'yes' ? values.followUpNote.trim() : null,
  attachmentNotes: values.attachmentNotes.trim() || null,
})

/** Counter shown once the text nears its limit (ui-spec §2.4). */
const near = (value: string, from: number, max: number) => (value.length >= from ? max : undefined)

type ActionTakenFormProps = {
  ticketId: number
  ticketCreatedAt: string
  /** `null` records a new action; an action edits it. */
  action: ActionTaken | null
  me: { id: number; fullName: string }
  onSaved: (saved: ActionTaken) => void
  onClose: () => void
  /** Re-reads the list and returns this action as now stored — for stale and conflict recovery. */
  loadLatest: () => Promise<ActionTaken | undefined>
}

/**
 * The Record / Edit action dialog (ui-spec §2.4, §6.3). Mounted only while open, so each new form gets a new
 * clientRequestId, and every retry of the same unsaved form reuses it (BR-24).
 */
export default function ActionTakenForm({ ticketId, ticketCreatedAt, action, me, onSaved, onClose, loadLatest }: ActionTakenFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  const titleId = useId()
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [values, setValues] = useState<Values>(() =>
    action ? fromAction(action) : { actionAt: toBangkokInput(new Date().toISOString()), description: '', result: '', followUp: '', followUpNote: '', attachmentNotes: '' },
  )
  // The stored version the edit is based on; replaced only by an explicit stale-recovery choice.
  const [base, setBase] = useState(action)
  const [errors, setErrors] = useState<ActionErrors>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [stale, setStale] = useState<ActionTaken | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current!
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    document.getElementById(FIELDS.actionAt.id)?.focus()
    // Focus goes back to whatever opened the dialog (ui-spec §11).
    return () => opener?.focus()
  }, [])

  const set = (field: keyof Values) => (value: string) => setValues((current) => ({ ...current, [field]: value }))
  const close = () => {
    if (!busy) onClose()
  }

  /** Maps a refusal onto the form. Values are never cleared here (BR-81). */
  async function applyRefusal(error: unknown) {
    if (!(error instanceof ApiError)) return false
    switch (error.code) {
      case 'VALIDATION_FAILED': {
        const fields = (error.fields ?? []).filter((field) => field.field in FIELDS)
        setErrors(Object.fromEntries(fields.map((field) => [field.field, field.message])))
        if (fields.length === 0) setNotice({ variant: 'error', text: error.message })
        return true
      }
      case 'STALE_ACTION': {
        const latest = await loadLatest()
        if (latest) setStale(latest)
        else setNotice({ variant: 'warning', text: error.message })
        return true
      }
      case 'ACTION_ALREADY_VOIDED':
        setNotice({ variant: 'warning', text: 'This action was voided by someone else.' })
        await loadLatest()
        return true
      case 'FOLLOW_UP_NOT_OUTSTANDING':
        setNotice({ variant: 'warning', text: error.message })
        await loadLatest()
        return true
      case 'FORBIDDEN':
        setNotice({ variant: 'warning', text: FORBIDDEN })
        return true
      case 'TICKET_NOT_ACTIONABLE':
      case 'DUPLICATE_SUBMISSION':
        setNotice({ variant: 'warning', text: error.message })
        return true
      default:
        return false
    }
  }

  async function submit(event?: FormEvent, against = base) {
    event?.preventDefault()
    // A second click before React re-renders the busy button still sends nothing (BR-82).
    if (inFlight.current) return
    const payload = toPayload(values)
    const found = validateAction(payload, { ticketCreatedAt })
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length > 0) return

    let body: object
    if (against) {
      // Edit sends only what differs from the stored action; an unchanged form closes without a request.
      const stored = toPayload(fromAction(against))
      const changes = Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== stored[key as ActionField]))
      if (Object.keys(changes).length === 0) return onClose()
      body = { expectedVersion: against.version, ...changes }
    } else {
      const { followUpNote, ...rest } = payload
      body = { clientRequestId, ...rest, ...(payload.followUpRequired ? { followUpNote } : {}) }
    }

    inFlight.current = true
    setBusy(true)
    try {
      const path = `/staff/tickets/${ticketId}/actions${against ? `/${against.id}` : ''}`
      onSaved(await apiFetch<ActionTaken>(path, { method: against ? 'PATCH' : 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }))
    } catch (error) {
      if (!(await applyRefusal(error))) setNotice({ variant: 'error', text: 'The action was not saved.', retry: true })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const focusField = (field: ActionField) => {
    const { id } = FIELDS[field]
    ;(document.getElementById(id) ?? document.querySelector<HTMLElement>(`input[name="${id}"]`))?.focus()
  }

  const errorFields = Object.keys(errors) as ActionField[]
  const frozen = base?.followUpCompletedAt != null
  const performer = action ? action.performedBy : me
  const readOnly: [string, string][] = [['Performed by', performer.id === me.id ? `You (${performer.fullName})` : performer.fullName]]
  if (action) {
    readOnly.push(['Created', formatBangkok(action.createdAt)])
    readOnly.push(['Last edited', action.lastEditedBy ? `${action.lastEditedBy.fullName}, ${formatBangkok(action.updatedAt)}` : '—'])
  }

  return (
    <dialog
      ref={dialogRef}
      className="zen-dialog zen-dialog-form zen-dialog-action"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <form ref={formRef} noValidate onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>{action ? 'Edit action' : 'Record action'}</h2>

        <div className="my-3">
          <Callout variant="info">Visible to the Requester. Use Internal Notes for private details.</Callout>
        </div>

        {stale && (
          <div className="mb-3">
            <StaleCallout
              message="Someone else saved this action while you were editing."
              actions={
                <>
                  <Button
                    onClick={() => {
                      setBase(stale)
                      setStale(null)
                      void submit(undefined, stale)
                    }}
                  >
                    Keep my changes
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setValues(fromAction(stale))
                      setBase(stale)
                      setStale(null)
                      setErrors({})
                    }}
                  >
                    Discard my changes
                  </Button>
                </>
              }
            >
              <p className="zen-label mb-1">Latest saved values</p>
              <dl className="zen-stale-values mb-0">
                <dt>Action date and time</dt>
                <dd>{formatBangkok(stale.actionAt)}</dd>
                <dt>Description</dt>
                <dd>{stale.description}</dd>
                <dt>Result</dt>
                <dd>{stale.result}</dd>
                <dt>Follow-up</dt>
                <dd>
                  <FollowUpBadge required={stale.followUpRequired} completed={stale.followUpCompletedAt !== null} /> {stale.followUpNote}
                </dd>
                <dt>Attachment notes</dt>
                <dd>{stale.attachmentNotes ?? '—'}</dd>
                <dt>Last edited</dt>
                <dd>{stale.lastEditedBy ? `${stale.lastEditedBy.fullName}, ${formatBangkok(stale.updatedAt)}` : '—'}</dd>
              </dl>
            </StaleCallout>
          </div>
        )}

        {errorFields.length > 0 && (
          <div className="mb-3">
            <Callout variant="error" title={`${errorFields.length} ${errorFields.length === 1 ? 'field needs' : 'fields need'} attention`}>
              <ul className="mb-0">
                {errorFields.map((field) => (
                  <li key={field}>
                    <a
                      href={`#${FIELDS[field].id}`}
                      onClick={(event) => {
                        event.preventDefault()
                        focusField(field)
                      }}
                    >
                      {FIELDS[field].label}
                    </a>
                  </li>
                ))}
              </ul>
            </Callout>
          </div>
        )}

        {notice && (
          <div className="mb-3">
            <Callout variant={notice.variant} onRetry={notice.retry ? () => formRef.current?.requestSubmit() : undefined}>
              {notice.text}
            </Callout>
          </div>
        )}

        <fieldset disabled={busy} className="border-0 p-0 m-0">
          <TextField
            id={FIELDS.actionAt.id}
            label={FIELDS.actionAt.label}
            type="datetime-local"
            required
            helper="Cannot be in the future or before the ticket was opened."
            error={errors.actionAt}
            value={values.actionAt}
            onChange={(event) => set('actionAt')(event.target.value)}
          />
          <TextArea
            id={FIELDS.description.id}
            label={FIELDS.description.label}
            required
            rows={4}
            counterMax={near(values.description, 1800, 2000)}
            error={errors.description}
            value={values.description}
            onChange={(event) => set('description')(event.target.value)}
          />
          <TextArea
            id={FIELDS.result.id}
            label={FIELDS.result.label}
            required
            rows={3}
            counterMax={near(values.result, 900, 1000)}
            error={errors.result}
            value={values.result}
            onChange={(event) => set('result')(event.target.value)}
          />
          <RadioGroup
            id={FIELDS.followUpRequired.id}
            name={FIELDS.followUpRequired.id}
            label={FIELDS.followUpRequired.label}
            required
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
            value={values.followUp}
            disabled={frozen}
            helper={
              frozen ? 'This follow-up is done; its follow-up fields can no longer change.' : values.followUp === 'yes' ? 'A follow-up note will be required.' : undefined
            }
            error={errors.followUpRequired}
            onChange={set('followUp')}
          />
          {values.followUp === 'yes' && (
            <TextArea
              id={FIELDS.followUpNote.id}
              label={FIELDS.followUpNote.label}
              required
              rows={3}
              readOnly={frozen}
              counterMax={near(values.followUpNote, 900, 1000)}
              error={errors.followUpNote}
              value={values.followUpNote}
              onChange={(event) => set('followUpNote')(event.target.value)}
            />
          )}
          <TextField
            id={FIELDS.attachmentNotes.id}
            label={FIELDS.attachmentNotes.label}
            helper={
              <>
                Name the file in Attachments to look at, e.g. router-log.png.
                {values.attachmentNotes.length >= 450 && <span className="ms-1">{values.attachmentNotes.length} / 500 characters</span>}
              </>
            }
            error={errors.attachmentNotes}
            value={values.attachmentNotes}
            onChange={(event) => set('attachmentNotes')(event.target.value)}
          />
        </fieldset>

        {/* Text on the read-only ground, never inputs: the performer is recorded by the server (BR-03, AC-50). */}
        <dl className="mb-0">
          {readOnly.map(([term, value]) => (
            <div key={term}>
              <dt className="zen-label mb-1">{term}</dt>
              <dd className="zen-readonly-value">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="zen-dialog-actions d-flex flex-wrap justify-content-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel="Saving…">
            {action ? 'Save changes' : 'Save action'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
