/**
 * Client mirror of the server field rules (BR-16, BR-17). The server stays
 * authoritative; this exists so the user gets an answer without a round trip, and
 * the messages are word-for-word the ones the API returns.
 */
export const MESSAGES = {
  summary: 'Summary must be between 10 and 120 characters.',
  description: 'Description must be between 20 and 2000 characters.',
  categoryId: 'Select a valid category.',
  relatedSystemId: 'Select a valid related system.',
  requestedPriority: 'Select a requested priority.',
  removalReason: 'Removal reason must be between 5 and 200 characters.',
} as const

export type TicketFormValues = {
  summary: string
  description: string
  categoryId: string
  relatedSystemId: string
  requestedPriority: string
}

export type FieldErrors = Partial<Record<keyof TicketFormValues, string>>

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

// Trim first, then measure: whitespace-only input counts as missing (BR-16).
const lengthOf = (value: string) => value.trim().length

export const validateSummary = (value: string) =>
  lengthOf(value) < 10 || lengthOf(value) > 120 ? MESSAGES.summary : undefined

export const validateDescription = (value: string) =>
  lengthOf(value) < 20 || lengthOf(value) > 2000 ? MESSAGES.description : undefined

/** Comments and Internal Notes share the Lab 2 long-text bound (BR-44, A-10). */
export const MESSAGE_MAX_LENGTH = 2000

/** A Comment or Note body: 1–2000 characters after trimming; whitespace-only is empty (BR-44). */
export const isValidMessageBody = (value: string) => lengthOf(value) >= 1 && lengthOf(value) <= MESSAGE_MAX_LENGTH

export const validateRemovalReason = (value: string) =>
  lengthOf(value) < 5 || lengthOf(value) > 200 ? MESSAGES.removalReason : undefined

/** Returns every offending field at once, so the form can mark them together (BR-18). */
export function validateTicketForm(values: TicketFormValues): FieldErrors {
  const errors: FieldErrors = {}

  const summary = validateSummary(values.summary)
  if (summary) errors.summary = summary

  const description = validateDescription(values.description)
  if (description) errors.description = description

  if (!values.categoryId) errors.categoryId = MESSAGES.categoryId
  if (!values.relatedSystemId) errors.relatedSystemId = MESSAGES.relatedSystemId
  if (!PRIORITIES.includes(values.requestedPriority)) {
    errors.requestedPriority = MESSAGES.requestedPriority
  }

  return errors
}

/** Client pre-check before staging a file (BR-23, BR-24); the server re-checks everything. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const PERMITTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf']

export function checkStagedFile(file: { name: string; size: number }): string | undefined {
  const dot = file.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase()

  if (!PERMITTED_EXTENSIONS.includes(extension)) return 'File type not allowed'
  if (file.size > MAX_FILE_BYTES) return 'File is larger than 5 MB'

  return undefined
}

/** Login field rules, word-for-word the API's messages (Lab 3 api-spec §3.1). */
export const LOGIN_MESSAGES = {
  email: 'Enter a valid email address.',
  password: 'Enter your password.',
} as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLogin(email: string, password: string) {
  const errors: { email?: string; password?: string } = {}
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = LOGIN_MESSAGES.email
  // Never trimmed: surrounding spaces are part of a password (Lab 3 BR-11).
  if (password.trim() === '') errors.password = LOGIN_MESSAGES.password
  return errors
}

/** Shown under the New password field before any typing (Lab 3 ui-spec §5.2). */
export const PASSWORD_RULES =
  'At least 10 characters. Must differ from your current password and from your email address.'

/** Client mirror of the server's new-password rules and messages (Lab 3 BR-11); the server re-checks. */
export function validateNewPassword(newPassword: string, context: { currentPassword: string; email: string }) {
  const length = [...newPassword].length
  const lowered = newPassword.toLowerCase()
  const email = context.email.toLowerCase()

  if (newPassword.trim() === '') return 'Your password cannot be only spaces.'
  if (length < 10) return 'Use at least 10 characters.'
  if (length > 128) return 'Use no more than 128 characters.'
  if (newPassword === context.currentPassword) return 'Choose a password you have not used here before.'
  if (lowered === email || lowered === email.split('@')[0]) return 'Your password cannot be your email address.'
  return undefined
}
