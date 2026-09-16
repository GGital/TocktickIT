import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import Button from './Button'
import Callout from './Callout'
import PasswordField from './PasswordField'
import RadioGroup from './RadioGroup'
import TextField from './TextField'
import { ApiError, apiFetch } from '../lib/apiClient'
import { ROLE_LABELS, type Role } from '../lib/roles'
import { EMAIL_PATTERN, validateNewPassword } from '../lib/validation'

/** UserSummary (api-spec §2.2). */
export type ManagedUser = {
  id: number
  fullName: string
  email: string
  role: Role
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
}

type Field = 'fullName' | 'email' | 'role' | 'isActive' | 'initialPassword'
type Notice = { variant: 'warning' | 'error'; text: string; retry?: () => void }

const ROLES: Role[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']
const MESSAGES = {
  fullName: "Enter the user's full name.",
  email: 'Enter a valid email address.',
  role: 'Choose one role.',
  isActive: 'Choose whether the account is active.',
  duplicate: 'That email address is already in use.',
  self: 'You cannot deactivate your own account or change your own role.',
  lastAdministrator: 'There must be at least one active administrator.',
} as const
const JSON_HEADERS = { 'Content-Type': 'application/json' }

type UserFormDialogProps = {
  /** `null` creates a user; a user edits that user. */
  user: ManagedUser | null
  /** The signed-in Administrator: resetting their own password ends their own session. */
  selfId: number
  /** Called after anything was stored, with a message to announce when the dialog closes on success. */
  onSaved: (message?: string) => void
  onClose: () => void
}

/**
 * The one Create / Edit dialog (ui-spec §9.2). Mounted only while open, so every value — above all an issued
 * password — is gone once it closes and cannot be shown again (BR-13).
 */
export default function UserFormDialog({ user, selfId, onSaved, onClose }: UserFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  // Never defaulted on create: the Administrator states the role and the activation explicitly (BR-47).
  const [role, setRole] = useState<Role | ''>(user?.role ?? '')
  const [isActive, setIsActive] = useState<'true' | 'false' | ''>(user ? String(user.isActive) as 'true' | 'false' : '')
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'form' | 'reset' | { heading: string; password: string }>('form')
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current!
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    // Focus goes back to whatever opened the dialog (ui-spec §2.4).
    return () => opener?.focus()
  }, [])

  const close = () => {
    if (!busy) onClose()
  }

  function validate(includePassword: boolean) {
    const found: Partial<Record<Field, string>> = {}
    const name = fullName.trim()
    if (name.length < 2 || name.length > 120) found.fullName = MESSAGES.fullName
    if (!EMAIL_PATTERN.test(email.trim())) found.email = MESSAGES.email
    if (!role) found.role = MESSAGES.role
    if (!isActive) found.isActive = MESSAGES.isActive
    if (includePassword) {
      const rule = validateNewPassword(passwordRef.current?.value ?? '', { currentPassword: '', email: email.trim() })
      if (rule) found.initialPassword = rule
    }
    return found
  }

  /** Maps a refusal to its place on the form; returns false when the caller should show a generic failure. */
  function applyRefusal(error: unknown) {
    if (!(error instanceof ApiError)) return false
    switch (error.code) {
      case 'EMAIL_ALREADY_EXISTS':
        setErrors({ email: MESSAGES.duplicate })
        return true
      case 'SELF_DEACTIVATION_FORBIDDEN':
      case 'LAST_ACTIVE_ADMINISTRATOR':
        // The refused controls go back to their stored values, so the form never shows a state the API refused.
        setRole(user!.role)
        setIsActive(String(user!.isActive) as 'true' | 'false')
        setNotice({ variant: 'warning', text: error.code === 'SELF_DEACTIVATION_FORBIDDEN' ? MESSAGES.self : MESSAGES.lastAdministrator })
        return true
      case 'VALIDATION_FAILED':
        setErrors(Object.fromEntries((error.fields ?? []).map((field) => [field.field, field.message])))
        setNotice({ variant: 'error', text: 'Check the highlighted fields.' })
        return true
      case 'USER_NOT_FOUND':
        setNotice({ variant: 'error', text: 'This user no longer exists.' })
        onSaved()
        return true
      default:
        return false
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const found = validate(user === null)
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length > 0) return

    const values = { fullName: fullName.trim(), email: email.trim(), role: role as Role, isActive: isActive === 'true' }
    // Edit sends only what changed; an unchanged form closes without a request.
    const changes = user
      ? Object.fromEntries(
          Object.entries(values).filter(([key, value]) =>
            key === 'email' ? String(value).toLowerCase() !== user.email : value !== user[key as keyof typeof values],
          ),
        )
      : { ...values, initialPassword: passwordRef.current!.value }
    if (user && Object.keys(changes).length === 0) return onClose()

    setBusy(true)
    try {
      if (user) {
        await apiFetch<ManagedUser>(`/admin/users/${user.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(changes) })
        onSaved(`Changes saved for ${values.fullName}.`)
        onClose()
      } else {
        const created = await apiFetch<{ user: ManagedUser; initialPassword: string }>('/admin/users', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(changes),
        })
        setStage({ heading: 'Account created', password: created.initialPassword })
        onSaved()
      }
    } catch (error) {
      if (!applyRefusal(error)) setNotice({ variant: 'error', text: 'The user was not saved.', retry: () => void submit() })
    } finally {
      setBusy(false)
    }
  }

  async function issuePassword(event?: FormEvent) {
    event?.preventDefault()
    const password = passwordRef.current?.value ?? ''
    const rule = validateNewPassword(password, { currentPassword: '', email: user!.email })
    setErrors(rule ? { initialPassword: rule } : {})
    setNotice(null)
    if (rule) return

    setBusy(true)
    try {
      const issued = await apiFetch<{ initialPassword: string }>(`/admin/users/${user!.id}/initial-password`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ initialPassword: password }),
      })
      setStage({ heading: 'New initial password issued', password: issued.initialPassword })
      // Resetting one's own password ends one's own session; refreshing now would sign out before the panel is read.
      if (user!.id !== selfId) onSaved()
    } catch (error) {
      if (!applyRefusal(error)) setNotice({ variant: 'error', text: 'The password was not changed.', retry: () => void issuePassword() })
    } finally {
      setBusy(false)
    }
  }

  async function copy(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  const title = stage === 'form' ? (user ? `Edit ${user.fullName}` : 'Create user') : stage === 'reset' ? 'Set a new initial password' : stage.heading

  return (
    <dialog
      ref={dialogRef}
      className="zen-dialog zen-dialog-form"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      {typeof stage === 'object' ? (
        <>
          <h2 id={titleId}>
            <span aria-hidden="true">✔ </span>
            {stage.heading}
          </h2>
          <p className="zen-label mb-2 mt-3">Initial password</p>
          <div className="d-flex flex-wrap align-items-center gap-2">
            {/* Plain text on purpose: the Administrator has to read it out or copy it (ui-spec §9.2). */}
            <output className="zen-mono zen-one-time">{stage.password}</output>
            <Button variant="secondary" onClick={() => copy(stage.password)}>
              Copy
            </Button>
          </div>
          <p role="status" className="zen-help">
            {copied === 'copied' ? 'Copied.' : copied === 'failed' ? 'Copy was blocked. Select the password and copy it manually.' : ''}
          </p>
          <p>Give this to the user directly. It is shown only once and they must change it at first sign-in.</p>
          <div className="zen-dialog-actions d-flex justify-content-end">
            <Button
              onClick={() => {
                if (user?.id === selfId) onSaved()
                onClose()
              }}
            >
              Done
            </Button>
          </div>
        </>
      ) : (
        <form noValidate onSubmit={stage === 'reset' ? issuePassword : submit}>
          <h2 id={titleId}>{title}</h2>

          {notice && (
            <div className="my-3">
              <Callout variant={notice.variant} onRetry={notice.retry}>
                {notice.text}
              </Callout>
            </div>
          )}

          <fieldset disabled={busy} className="border-0 p-0 m-0 mt-3">
            {stage === 'reset' ? (
              <>
                <p>
                  Issuing a new initial password signs {user!.fullName} out and requires them to change it at their next
                  sign-in.
                </p>
                <PasswordField
                  ref={passwordRef}
                  id="resetPassword"
                  label="New initial password"
                  required
                  autoComplete="new-password"
                  helper="At least 10 characters, and not the user's email address."
                  error={errors.initialPassword}
                />
              </>
            ) : (
              <>
                <TextField id="userFullName" label="Full name" required autoComplete="off" value={fullName} error={errors.fullName} onChange={(event) => setFullName(event.target.value)} />
                <TextField id="userEmail" label="Email address" type="email" required autoComplete="off" value={email} error={errors.email} onChange={(event) => setEmail(event.target.value)} />
                <RadioGroup
                  id="userRole"
                  name="userRole"
                  label="Role"
                  required
                  options={ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
                  value={role}
                  error={errors.role}
                  onChange={(value) => setRole(value as Role)}
                />
                <RadioGroup
                  id="userStatus"
                  name="userStatus"
                  label="Account status"
                  required
                  options={[
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Inactive' },
                  ]}
                  value={isActive}
                  error={errors.isActive}
                  onChange={(value) => setIsActive(value as 'true' | 'false')}
                />
                {user === null && (
                  <PasswordField
                    ref={passwordRef}
                    id="userInitialPassword"
                    label="Initial password"
                    required
                    autoComplete="new-password"
                    helper="At least 10 characters. The user must change it at first sign-in."
                    error={errors.initialPassword}
                  />
                )}
                {user && (
                  <Button variant="tertiary" className="px-0 mb-3" onClick={() => setStage('reset')}>
                    Set a new initial password
                  </Button>
                )}
              </>
            )}
          </fieldset>

          <div className="zen-dialog-actions d-flex flex-wrap justify-content-end gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (stage !== 'reset') return close()
                setStage('form')
                setErrors({})
                setNotice(null)
              }}
            >
              {stage === 'reset' ? 'Back' : 'Cancel'}
            </Button>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              {stage === 'reset' ? 'Issue password' : user ? 'Save changes' : 'Create user'}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
