import { useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import Button from '../components/Button'
import Callout from '../components/Callout'
import PasswordField from '../components/PasswordField'
import { SkeletonCard } from '../components/Skeleton'
import TextField from '../components/TextField'
import { ApiError, apiFetch } from '../lib/apiClient'
import { homeFor, useAuth } from '../lib/auth'
import { validateLogin } from '../lib/validation'

type Failure = 'invalid' | 'throttled' | 'unavailable'

const FAILURE_MESSAGES: Record<Failure, string> = {
  // One message for unknown email, wrong password, and inactive account (BR-01, AC-02).
  invalid: 'Email or password is incorrect, or the account is not active.',
  throttled: 'Too many attempts. Please wait a few minutes and try again.',
  unavailable: 'We could not sign you in right now. Please try again.',
}

/**
 * Login (ui-spec §4). The form is uncontrolled: the password is read from the input once, at submit, and never
 * enters React state, a URL, or a log (ui-spec §2.1, §4.3).
 */
export default function Login() {
  const { state, refresh } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in: go where the session says, never offer a second sign-in (ui-spec §4.3, BR-17).
  if (state.status === 'authenticated') {
    const { user } = state
    return <Navigate to={user.mustChangePassword ? '/change-password' : homeFor(user.role)} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')

    const found = validateLogin(email, password)
    setErrors(found)
    setFailure(null)
    if (found.email || found.password) {
      document.getElementById(found.email ? 'email' : 'password')?.focus()
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      // The session, not the login response, decides where to go next.
      await refresh()
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (code === 'INVALID_CREDENTIALS') {
        setFailure('invalid')
        // The email survives; the password is cleared and refocused (ui-spec §4.2).
        if (passwordRef.current) passwordRef.current.value = ''
        passwordRef.current?.focus()
      } else if (code === 'TOO_MANY_ATTEMPTS') {
        setFailure('throttled')
      } else if (code === 'VALIDATION_FAILED' && error instanceof ApiError && error.fields) {
        setErrors(Object.fromEntries(error.fields.map((field) => [field.field, field.message])))
      } else {
        setFailure('unavailable')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main id="main" className="zen-auth">
      <div className="zen-card zen-auth-card">
        <h1 className="text-center">TokTickIT</h1>
        <h2 id="sign-in-heading" className="text-center mb-4">
          Sign in
        </h2>

        {state.status === 'loading' ? (
          <SkeletonCard label="Checking your session…" />
        ) : (
          <form ref={formRef} aria-labelledby="sign-in-heading" onSubmit={handleSubmit} noValidate>
            <TextField
              id="email"
              name="email"
              label="Email address"
              type="email"
              autoComplete="username"
              required
              autoFocus
              readOnly={submitting}
              error={errors.email}
            />
            <PasswordField
              ref={passwordRef}
              id="password"
              name="password"
              label="Password"
              autoComplete="current-password"
              required
              readOnly={submitting}
              error={errors.password}
            />

            {failure && (
              <div className="mb-3">
                <Callout
                  variant="error"
                  onRetry={failure === 'unavailable' ? () => formRef.current?.requestSubmit() : undefined}
                >
                  {FAILURE_MESSAGES[failure]}
                </Callout>
              </div>
            )}

            <Button type="submit" className="w-100" busy={submitting} busyLabel="Signing in…">
              Sign in
            </Button>
          </form>
        )}

        <p className="zen-muted text-center mt-3 mb-0">
          Lost your password? Ask your IT administrator to issue a new one.
        </p>
      </div>
    </main>
  )
}
