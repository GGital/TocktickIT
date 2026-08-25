import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Callout from '../components/Callout'
import SelectField from '../components/SelectField'
import { apiFetch, type Requester } from '../lib/apiClient'
import { contextWasRejected, setRequesterId } from '../lib/requesterContext'

type Load =
  | { status: 'loading' }
  | { status: 'loaded'; requesters: Requester[] }
  | { status: 'error' }

/**
 * Development Requester Selection (ui-spec §4). Chooses the testing context —
 * deliberately not a login screen, and the copy says so (BR-08, BR-50, AC-50).
 */
export default function SelectRequester() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Read once on mount: the flag is cleared as soon as a new context is stored.
  const [rejected] = useState(contextWasRejected)
  const navigate = useNavigate()

  const loadRequesters = useCallback(() => {
    setLoad({ status: 'loading' })
    apiFetch<Requester[]>('/requesters')
      .then((requesters) => setLoad({ status: 'loaded', requesters }))
      .catch(() => setLoad({ status: 'error' }))
  }, [])

  useEffect(loadRequesters, [loadRequesters])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedId) return

    setSubmitting(true)
    setRequesterId(Number(selectedId))
    navigate('/tickets')
  }

  const isEmpty = load.status === 'loaded' && load.requesters.length === 0

  return (
    <main id="main" className="container py-4 d-flex justify-content-center">
      <div className="zen-card w-100" style={{ maxWidth: '480px' }}>
        <h1 className="text-center">TokTickIT</h1>
        <h2 className="text-center mb-4">Select a Development Requester</h2>

        <Callout variant="info">
          This is a Lab 2 testing mechanism, not a login screen. Authentication and role-based
          access arrive in Lab 3.
        </Callout>

        {rejected && (
          <div className="mt-3">
            <Callout variant="warning">
              The selected requester is no longer available. Choose another.
            </Callout>
          </div>
        )}

        {load.status === 'loading' && (
          <div className="mt-4" aria-busy="true">
            <div className="zen-skeleton zen-skeleton-row" style={{ height: '42px' }} />
            <p className="zen-help">Loading requesters…</p>
          </div>
        )}

        {load.status === 'error' && (
          <div className="mt-4">
            <Callout variant="error" onRetry={loadRequesters}>
              Unable to load the development requesters.
            </Callout>
          </div>
        )}

        {isEmpty && (
          <div className="mt-4">
            <Callout variant="warning" title="No active Development Requesters found.">
              Run <code>npx prisma db seed</code> in the server directory, then reload.
            </Callout>
          </div>
        )}

        {load.status === 'loaded' && !isEmpty && (
          <form className="mt-4" onSubmit={handleSubmit}>
            <SelectField
              id="requester"
              label="Development Requester"
              required
              helper="Choose who you are testing as."
              placeholder="Select a requester…"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              options={load.requesters.map((requester) => ({
                value: String(requester.id),
                // Department disambiguates seeded names in the selector (A-16).
                label: `${requester.fullName} — ${requester.department}`,
              }))}
            />

            <Button
              type="submit"
              className="w-100"
              disabled={!selectedId}
              busy={submitting}
              busyLabel="Continuing…"
            >
              Continue
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
