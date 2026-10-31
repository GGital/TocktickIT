import { fromBangkokInput, toBangkokInput } from './formatBangkok'

/**
 * Client mirror of the Action Taken field rules (api-spec §3.3, server/src/actionInput.ts). The server stays
 * authoritative; this answers before a round trip, with the API's messages word for word.
 */
export const ACTION_MESSAGES = {
  actionAt: 'Enter when the action was performed.',
  beforeTicket: 'The action time cannot be before the ticket was created.',
  future: 'The action time cannot be in the future.',
  description: 'Describe the action in up to 2000 characters.',
  result: 'Enter the result in up to 1000 characters.',
  followUpRequired: 'Choose whether follow-up is required.',
  noteMissing: 'Describe the follow-up that is needed.',
  noteNotWanted: 'Remove the follow-up note or mark follow-up as required.',
  attachmentNotes: 'Attachment notes can be up to 500 characters.',
} as const

/** The editable fields as they are sent; `followUpRequired` is null until the user chooses (ui-spec §2.4). */
export type ActionPayload = {
  actionAt: string
  description: string
  result: string
  followUpRequired: boolean | null
  followUpNote: string | null
  attachmentNotes: string | null
}

export type ActionField = keyof ActionPayload
export type ActionErrors = Partial<Record<ActionField, string>>

const CLOCK_SKEW_MS = 5 * 60 * 1000
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

const within = (value: string | null, min: number, max: number) => {
  const length = (value ?? '').trim().length
  return length >= min && length <= max
}

/** Every offending field at once (BR-13). */
/**
 * The form's starting `datetime-local` value: now, in Bangkok. The input has no seconds, so on a Ticket opened in
 * this same minute "now" would read as before it (BR-06); it rounds up a minute instead, well inside the skew.
 */
export function defaultActionAt(ticketCreatedAt: string, now = Date.now()) {
  const value = toBangkokInput(new Date(now).toISOString())
  return new Date(fromBangkokInput(value)) < new Date(ticketCreatedAt) ? toBangkokInput(new Date(now + 60_000).toISOString()) : value
}

export function validateAction(values: ActionPayload, context: { now?: Date; ticketCreatedAt: string }): ActionErrors {
  const { now = new Date(), ticketCreatedAt } = context
  const errors: ActionErrors = {}

  const at = ISO_WITH_OFFSET.test(values.actionAt) ? new Date(values.actionAt) : null
  if (!at || Number.isNaN(at.getTime())) errors.actionAt = ACTION_MESSAGES.actionAt
  else if (at < new Date(ticketCreatedAt)) errors.actionAt = ACTION_MESSAGES.beforeTicket
  else if (at.getTime() > now.getTime() + CLOCK_SKEW_MS) errors.actionAt = ACTION_MESSAGES.future

  if (!within(values.description, 1, 2000)) errors.description = ACTION_MESSAGES.description
  if (!within(values.result, 1, 1000)) errors.result = ACTION_MESSAGES.result

  // BR-10: a note exactly when follow-up is required; blank counts as no note.
  const hasNote = (values.followUpNote ?? '').trim() !== ''
  if (values.followUpRequired === null) errors.followUpRequired = ACTION_MESSAGES.followUpRequired
  else if (values.followUpRequired && !within(values.followUpNote, 1, 1000)) errors.followUpNote = ACTION_MESSAGES.noteMissing
  else if (!values.followUpRequired && hasNote) errors.followUpNote = ACTION_MESSAGES.noteNotWanted

  if (!within(values.attachmentNotes, 0, 500)) errors.attachmentNotes = ACTION_MESSAGES.attachmentNotes

  return errors
}
