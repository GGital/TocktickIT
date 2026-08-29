import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AttachmentSection, { type StagedFile } from '../components/AttachmentSection'
import Button from '../components/Button'
import Callout from '../components/Callout'
import RadioGroup from '../components/RadioGroup'
import SelectField from '../components/SelectField'
import TextArea from '../components/TextArea'
import TextField from '../components/TextField'
import { RequiredLegend } from '../components/FormField'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentRequester } from '../lib/useCurrentRequester'
import { validateTicketForm, type FieldErrors, type TicketFormValues } from '../lib/validation'

type Reference = { id: number; name: string }

type ReferenceLoad =
  | { status: 'loading' }
  | { status: 'loaded'; categories: Reference[]; systems: Reference[] }
  | { status: 'error' }

type CreatedTicket = {
  id: number
  ticketNumber: string
  createdAt: string
}

type UploadResult = { name: string; ok: boolean; message?: string }

const EMPTY_VALUES: TicketFormValues = {
  summary: '',
  description: '',
  categoryId: '',
  relatedSystemId: '',
  // MEDIUM is pre-selected as a convenience, and is still sent explicitly (BR-06).
  requestedPriority: 'MEDIUM',
}

const FIELD_LABELS: Record<keyof TicketFormValues, string> = {
  summary: 'Ticket Summary',
  description: 'Description',
  categoryId: 'Category',
  relatedSystemId: 'Related System',
  requestedPriority: 'Requested Priority',
}

const bangkok = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Live character counter; turns amber near the limit (ui-spec §5.2). */
const counter = (value: string, max: number, warnAt: number) => (
  <span className={value.length >= warnAt ? 'zen-counter-warning' : undefined}>
    {value.length} / {max}
  </span>
)

/** Create Ticket (ui-spec §5). */
export default function CreateTicket() {
  const [reference, setReference] = useState<ReferenceLoad>({ status: 'loading' })
  const [values, setValues] = useState<TicketFormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<{ duplicate: boolean; message: string } | null>(null)
  const [created, setCreated] = useState<{ ticket: CreatedTicket; uploads: UploadResult[] } | null>(
    null,
  )
  const requester = useCurrentRequester()
  const navigate = useNavigate()

  const loadReference = useCallback(() => {
    setReference({ status: 'loading' })
    Promise.all([apiFetch<Reference[]>('/categories'), apiFetch<Reference[]>('/related-systems')])
      .then(([categories, systems]) => setReference({ status: 'loaded', categories, systems }))
      .catch(() => setReference({ status: 'error' }))
  }, [])

  useEffect(loadReference, [loadReference])

  const set = (field: keyof TicketFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  /** Uploads run after the ticket exists, one request per file, and a failure never
   * undoes the ticket (BR-29, AC-23). */
  async function uploadStaged(ticketId: number): Promise<UploadResult[]> {
    const results: UploadResult[] = []

    for (const item of staged.filter((file) => !file.error)) {
      const body = new FormData()
      body.append('file', item.file)

      try {
        await apiFetch(`/tickets/${ticketId}/attachments`, { method: 'POST', body })
        results.push({ name: item.file.name, ok: true })
      } catch (error) {
        results.push({
          name: item.file.name,
          ok: false,
          message: error instanceof ApiError ? error.message : 'Upload failed.',
        })
      }
    }

    return results
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const found = validateTicketForm(values)
    setErrors(found)

    if (Object.keys(found).length > 0) {
      // Focus moves to the first invalid control; no request is sent (AC-11, BR-18).
      document.getElementById(Object.keys(found)[0])?.focus()
      return
    }

    setSubmitting(true)
    setFailure(null)

    try {
      const ticket = await apiFetch<CreatedTicket>('/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: values.summary.trim(),
          description: values.description.trim(),
          categoryId: Number(values.categoryId),
          relatedSystemId: Number(values.relatedSystemId),
          requestedPriority: values.requestedPriority,
        }),
      })

      setCreated({ ticket, uploads: await uploadStaged(ticket.id) })
    } catch (error) {
      // Nothing the user typed or staged is discarded on failure (BR-20, AC-16).
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && error.fields) {
        setErrors(
          Object.fromEntries(error.fields.map((field) => [field.field, field.message])) as FieldErrors,
        )
      }

      setFailure({
        duplicate: error instanceof ApiError && error.code === 'DUPLICATE_SUBMISSION',
        message:
          error instanceof ApiError
            ? error.message
            : 'The ticket could not be submitted. Check your connection and try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    const uploaded = created.uploads.filter((result) => result.ok).length
    const failed = created.uploads.filter((result) => !result.ok)

    return (
      <div className="zen-card zen-callout-success" role="status">
        <h1>✓ Ticket created</h1>

        <dl className="row mt-3">
          <dt className="col-sm-3">Ticket Number</dt>
          <dd className="col-sm-9 zen-mono zen-ticket-number">{created.ticket.ticketNumber}</dd>
          <dt className="col-sm-3">Submitted</dt>
          <dd className="col-sm-9">{bangkok(created.ticket.createdAt)}</dd>
          {created.uploads.length > 0 && (
            <>
              <dt className="col-sm-3">Attachments</dt>
              <dd className="col-sm-9">
                {uploaded} uploaded · {failed.length} failed
                {failed.length > 0 && (
                  <ul className="mt-2">
                    {failed.map((result) => (
                      <li key={result.name} className="zen-error-text">
                        {result.name} — {result.message}{' '}
                        <Link to={`/tickets/${created.ticket.id}`}>Retry on Ticket Detail</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </>
          )}
        </dl>

        <div className="d-flex flex-wrap gap-2">
          <Button onClick={() => navigate(`/tickets/${created.ticket.id}`)}>View Ticket</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCreated(null)
              setValues(EMPTY_VALUES)
              setStaged([])
              setErrors({})
              setFailure(null)
            }}
          >
            Create Another
          </Button>
          <Button variant="secondary" onClick={() => navigate('/tickets')}>
            My Tickets
          </Button>
        </div>
      </div>
    )
  }

  const referenceLoading = reference.status === 'loading'
  const errorCount = Object.keys(errors).length

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Create Ticket</h1>
      <RequiredLegend />

      {errorCount > 0 && (
        <div className="mb-4">
          <Callout variant="error">
            {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention:{' '}
            {Object.keys(errors)
              .map((field) => FIELD_LABELS[field as keyof TicketFormValues])
              .join(', ')}
          </Callout>
        </div>
      )}

      {failure && (
        <div className="mb-4">
          <Callout variant={failure.duplicate ? 'warning' : 'error'}>
            {failure.message}{' '}
            {failure.duplicate && <Link to="/tickets">Go to My Tickets</Link>}
          </Callout>
        </div>
      )}

      <section className="zen-card mb-4">
        <h2>System information</h2>
        <div className="row">
          <div className="col-md-4">
            <TextField id="ticketNumber" label="Ticket Number" value="Generated on submit" readOnly />
          </div>
          <div className="col-md-4">
            <TextField id="ticketDate" label="Ticket Date" value="Set on submit" readOnly />
          </div>
          <div className="col-md-4">
            <TextField id="status" label="Current Status" value="NEW" readOnly />
          </div>
          <div className="col-12">
            <TextField
              id="requester"
              label="Requester"
              readOnly
              value={requester ? `${requester.fullName} — ${requester.department}` : ''}
            />
          </div>
        </div>
      </section>

      <section className="zen-card mb-4">
        <h2>Classification</h2>

        {reference.status === 'error' && (
          <div className="mb-3">
            <Callout variant="error" onRetry={loadReference}>
              Unable to load categories and related systems.
            </Callout>
          </div>
        )}

        {referenceLoading && (
          <div className="zen-skeleton zen-skeleton-row mb-3" aria-hidden="true" />
        )}

        <div className="row">
          <div className="col-md-6">
            <SelectField
              id="categoryId"
              label="Category"
              required
              placeholder="Select a category…"
              disabled={reference.status !== 'loaded' || submitting}
              error={errors.categoryId}
              value={values.categoryId}
              onChange={(event) => set('categoryId')(event.target.value)}
              options={
                reference.status === 'loaded'
                  ? reference.categories.map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    }))
                  : []
              }
            />
          </div>
          <div className="col-md-6">
            <SelectField
              id="relatedSystemId"
              label="Related System"
              required
              placeholder="Select a system…"
              disabled={reference.status !== 'loaded' || submitting}
              error={errors.relatedSystemId}
              value={values.relatedSystemId}
              onChange={(event) => set('relatedSystemId')(event.target.value)}
              options={
                reference.status === 'loaded'
                  ? reference.systems.map((item) => ({ value: String(item.id), label: item.name }))
                  : []
              }
            />
          </div>
        </div>

        <RadioGroup
          id="requestedPriority"
          label="Requested Priority"
          required
          name="requestedPriority"
          disabled={submitting}
          error={errors.requestedPriority}
          value={values.requestedPriority}
          onChange={set('requestedPriority')}
          options={[
            { value: 'LOW', label: 'Low' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HIGH', label: 'High' },
            { value: 'URGENT', label: 'Urgent' },
          ]}
        />
      </section>

      <section className="zen-card mb-4">
        <h2>Problem description</h2>

        <TextField
          id="summary"
          label="Ticket Summary"
          required
          maxLength={120}
          readOnly={submitting}
          error={errors.summary}
          helper={counter(values.summary, 120, 110)}
          value={values.summary}
          onChange={(event) => set('summary')(event.target.value)}
        />

        <TextArea
          id="description"
          label="Description"
          required
          maxLength={2000}
          readOnly={submitting}
          error={errors.description}
          helper={counter(values.description, 2000, 1900)}
          value={values.description}
          onChange={(event) => set('description')(event.target.value)}
        />
      </section>

      <AttachmentSection staged={staged} onChange={setStaged} disabled={submitting} />

      <div className="d-flex flex-wrap justify-content-end gap-2">
        <Button variant="secondary" disabled={submitting} onClick={() => navigate('/tickets')}>
          Cancel
        </Button>
        <Button type="submit" busy={submitting} busyLabel="Submitting…">
          Submit Ticket
        </Button>
      </div>
    </form>
  )
}
