import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Callout from '../components/Callout'
import { RequiredLegend } from '../components/FormField'
import PasswordField from '../components/PasswordField'
import { ApiError, apiFetch } from '../lib/apiClient'
import { homeFor, useAuth, useCurrentUser } from '../lib/auth'
import { PASSWORD_RULES, validateNewPassword } from '../lib/validation'

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword'
type Errors = Partial<Record<Field, string>>

const FIELDS: { id: Field; label: string; autoComplete: string }[] = [
  { id: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { id: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { id: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
]

const PASSWORD_CHANGED_NOTICE =
  'Your password has been changed. You have been signed out on your other devices.'

/**
 * Change Password (ui-spec §5): mandatory while a change is outstanding, voluntary otherwise. Uncontrolled like
 * Login — the three passwords are read at submit and never held in React state (ui-spec §2.1).
 */
export default function ChangePassword() {
  // The route guard only renders this screen for a signed-in user.
  const user = useCurrentUser()!
  const { refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const mandatory = user.mustChangePassword

  const showErrors = (found: Errors) => {
    setErrors(found)
    const first = FIELDS.find((field) => found[field.id])
    if (first) document.getElementById(first.id)?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = event.currentTarget
    const data = new FormData(form)
    const [currentPassword, newPassword, confirmPassword] = FIELDS.map((field) => String(data.get(field.id) ?? ''))

    const found: Errors = {}
    if (currentPassword === '') found.currentPassword = 'Enter your current password.'
    const rule =
      newPassword === '' ? 'Enter a new password.' : validateNewPassword(newPassword, { currentPassword, email: user.email })
    if (rule) found.newPassword = rule
    if (confirmPassword === '') found.confirmPassword = 'Confirm your new password.'
    else if (confirmPassword !== newPassword) found.confirmPassword = 'The two passwords do not match.'

    setFailure(null)
    showErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      form.reset()

      // The gate lifts only because the server now says so, never because of a local flag (ui-spec §5.4).
      const next = await refresh()
      if (next.status === 'authenticated' && !next.user.mustChangePassword) {
        navigate(homeFor(next.user.role), { replace: true, state: { notice: PASSWORD_CHANGED_NOTICE } })
      }
    } catch (error) {
      // Nothing typed is discarded on failure (BR-66).
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && error.fields) {
        showErrors(Object.fromEntries(error.fields.map((field) => [field.field, field.message])))
      } else {
        setFailure('We could not change your password right now. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setFailure('We could not log you out right now. Please try again.')
      setSigningOut(false)
    }
  }

  const errorCount = Object.keys(errors).length

  return (
    <main id="main" className="zen-auth">
      <div className="zen-card zen-auth-card zen-auth-card-wide">
        <h1 className="text-center">Choose a new password</h1>

        {mandatory ? (
          <div className="mb-3">
            <Callout variant="info">
              Your account uses a password that was issued to you. Choose a new one to continue.
            </Callout>
          </div>
        ) : (
          <p>
            <Link to={homeFor(user.role)}>Back</Link>
          </p>
        )}

        {errorCount > 0 && (
          <div className="mb-3">
            <Callout variant="error">
              {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention:{' '}
              {FIELDS.filter((field) => errors[field.id])
                .map((field) => field.label)
                .join(', ')}
            </Callout>
          </div>
        )}

        {failure && (
          <div className="mb-3">
            <Callout variant="error" onRetry={() => formRef.current?.requestSubmit()}>
              {failure}
            </Callout>
          </div>
        )}

        <form ref={formRef} aria-label="Choose a new password" onSubmit={handleSubmit} noValidate>
          <RequiredLegend />
          {FIELDS.map((field) => (
            <PasswordField
              key={field.id}
              id={field.id}
              name={field.id}
              label={field.label}
              autoComplete={field.autoComplete}
              required
              readOnly={submitting}
              helper={field.id === 'newPassword' ? PASSWORD_RULES : undefined}
              error={errors[field.id]}
            />
          ))}

          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <Button type="submit" busy={submitting} busyLabel="Saving…">
              Save new password
            </Button>
            {/* No Cancel in either mode: in mandatory mode there is nowhere to cancel to (BR-15). */}
            {mandatory && (
              <Button variant="tertiary" onClick={handleLogOut} busy={signingOut} busyLabel="Logging out…">
                Log out
              </Button>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
