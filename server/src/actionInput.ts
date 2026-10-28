import type { FieldError } from './errors.js'

/**
 * Reads Action Taken request bodies (api-spec §3.3 – §3.6). Every offending field is reported at once (BR-13), and
 * any key the endpoint does not list is an error naming it — never silently ignored, so a client can never believe
 * it set the performer (BR-03).
 */

const CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_INT4 = 2_147_483_647
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// ISO-8601 with an explicit offset: a bare local time is ambiguous across time zones (BR-06).
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

export const MESSAGES = {
  clientRequestId: 'A request identifier is required.',
  actionAt: 'Enter when the action was performed.',
  beforeTicket: 'The action time cannot be before the ticket was created.',
  future: 'The action time cannot be in the future.',
  description: 'Describe the action in up to 2000 characters.',
  result: 'Enter the result in up to 1000 characters.',
  followUpRequired: 'Choose whether follow-up is required.',
  noteMissing: 'Describe the follow-up that is needed.',
  noteNotWanted: 'Remove the follow-up note or mark follow-up as required.',
  attachmentNotes: 'Attachment notes can be up to 500 characters.',
  expectedVersion: 'Reload the action and try again.',
  reason: 'Explain why this action is being voided (up to 500 characters).',
  noChange: 'Change at least one field.',
  performer: 'Performed by is recorded automatically.',
  unknown: 'This value cannot be set.',
} as const

const EDITABLE = ['actionAt', 'description', 'result', 'followUpRequired', 'followUpNote', 'attachmentNotes'] as const
const PERFORMER_KEYS = ['performedById', 'performedBy']

export type ActionFields = {
  clientRequestId?: string
  actionAt?: Date
  description?: string
  result?: string
  followUpRequired?: boolean
  followUpNote?: string | null
  attachmentNotes?: string | null
}

const asObject = (body: unknown) =>
  (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>

/** Keys outside `allowed`, each named; performer keys get their own message (BR-03). */
const unknownKeys = (input: Record<string, unknown>, allowed: readonly string[]): FieldError[] =>
  Object.keys(input)
    .filter((key) => !allowed.includes(key))
    .map((field) => ({ field, message: PERFORMER_KEYS.includes(field) ? MESSAGES.performer : MESSAGES.unknown }))

/** Trimmed text within [min, max], or undefined when it is not. */
const text = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : undefined
}

const isVersion = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_INT4

/**
 * The BR-10 pairing on a resulting action: a note exactly when follow-up is required. Edits call it with the
 * merged values, because the rule holds for the action as it will be stored, not for the request alone.
 */
export function followUpPairingError(required: boolean, note: string | null): FieldError | null {
  if (required && note === null) return { field: 'followUpNote', message: MESSAGES.noteMissing }
  if (!required && note !== null) return { field: 'followUpNote', message: MESSAGES.noteNotWanted }
  return null
}

/**
 * A create body (all fields) or an edit body (`expectedVersion` plus any non-empty subset). `ticketCreatedAt` is
 * passed once the Ticket is known; before that only the clock-skew bound applies (api-spec §3.3 steps 2 and 5).
 */
export function readActionInput(
  body: unknown,
  options: { mode: 'create' | 'update'; now?: Date; ticketCreatedAt?: Date },
) {
  const { mode, now = new Date(), ticketCreatedAt } = options
  const input = asObject(body)
  const has = (key: string) => mode === 'create' || key in input
  const data: ActionFields = {}
  const errors: FieldError[] = []
  let expectedVersion: number | undefined

  if (mode === 'update') {
    if (isVersion(input.expectedVersion)) expectedVersion = input.expectedVersion
    else errors.push({ field: 'expectedVersion', message: MESSAGES.expectedVersion })
  }

  if (mode === 'create') {
    const id = input.clientRequestId
    if (typeof id === 'string' && UUID_PATTERN.test(id)) data.clientRequestId = id
    else errors.push({ field: 'clientRequestId', message: MESSAGES.clientRequestId })
  }

  if (has('actionAt')) {
    const raw = input.actionAt
    const at = typeof raw === 'string' && ISO_WITH_OFFSET.test(raw) ? new Date(raw) : null
    if (!at || Number.isNaN(at.getTime())) errors.push({ field: 'actionAt', message: MESSAGES.actionAt })
    else if (ticketCreatedAt && at < ticketCreatedAt) errors.push({ field: 'actionAt', message: MESSAGES.beforeTicket })
    else if (at.getTime() > now.getTime() + CLOCK_SKEW_MS) errors.push({ field: 'actionAt', message: MESSAGES.future })
    else data.actionAt = at
  }

  if (has('description')) {
    const value = text(input.description, 1, 2000)
    if (value === undefined) errors.push({ field: 'description', message: MESSAGES.description })
    else data.description = value
  }

  if (has('result')) {
    const value = text(input.result, 1, 1000)
    if (value === undefined) errors.push({ field: 'result', message: MESSAGES.result })
    else data.result = value
  }

  if (has('followUpRequired')) {
    if (typeof input.followUpRequired === 'boolean') data.followUpRequired = input.followUpRequired
    else errors.push({ field: 'followUpRequired', message: MESSAGES.followUpRequired })
  }

  // Absent, null, and blank are all "no note"; a note over 1000 characters is an error whatever the flag says.
  const noteRaw = input.followUpNote
  const noteBlank = noteRaw === undefined || noteRaw === null || (typeof noteRaw === 'string' && noteRaw.trim() === '')
  const note = noteBlank ? null : text(noteRaw, 1, 1000)
  if (note === undefined) errors.push({ field: 'followUpNote', message: MESSAGES.noteMissing })
  else if (mode === 'create') {
    if (data.followUpRequired !== undefined) {
      const pairing = followUpPairingError(data.followUpRequired, note)
      if (pairing) errors.push(pairing)
      else data.followUpNote = note
    }
  } else if ('followUpNote' in input) data.followUpNote = note

  if (has('attachmentNotes')) {
    const raw = input.attachmentNotes
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) data.attachmentNotes = null
    else {
      const value = text(raw, 1, 500)
      if (value === undefined) errors.push({ field: 'attachmentNotes', message: MESSAGES.attachmentNotes })
      else data.attachmentNotes = value
    }
  }

  errors.push(...unknownKeys(input, mode === 'create' ? ['clientRequestId', ...EDITABLE] : ['expectedVersion', ...EDITABLE]))

  if (mode === 'update' && !EDITABLE.some((key) => key in input)) {
    errors.push({ field: 'body', message: MESSAGES.noChange })
  }

  return { data, errors, expectedVersion }
}

/** `{ expectedVersion }` for complete-follow-up, plus `reason` for void (api-spec §3.5, §3.6). */
export function readVersionInput(body: unknown, withReason: boolean) {
  const input = asObject(body)
  const errors: FieldError[] = []
  const expectedVersion = isVersion(input.expectedVersion) ? input.expectedVersion : undefined
  if (expectedVersion === undefined) errors.push({ field: 'expectedVersion', message: MESSAGES.expectedVersion })

  const reason = withReason ? text(input.reason, 1, 500) : undefined
  if (withReason && reason === undefined) errors.push({ field: 'reason', message: MESSAGES.reason })

  errors.push(...unknownKeys(input, withReason ? ['expectedVersion', 'reason'] : ['expectedVersion']))
  return { expectedVersion, reason, errors }
}
