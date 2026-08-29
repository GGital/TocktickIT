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
