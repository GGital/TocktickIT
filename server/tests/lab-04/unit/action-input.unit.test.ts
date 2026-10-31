import { describe, expect, it } from 'vitest'
import { readActionInput } from '../../../src/actionInput.js'

const NOW = new Date('2026-10-19T03:00:00.000Z')
const CREATED = new Date('2026-10-18T00:00:00.000Z')
const MINUTE = 60 * 1000

const valid = (overrides: Record<string, unknown> = {}) => ({
  clientRequestId: '6f1c2d7e-9a4b-4c1e-8d2f-0b7a3e5c9d11',
  actionAt: '2026-10-19T09:15:00+07:00',
  description: 'Replaced the VPN client profile.',
  result: 'Connection stable for 30 minutes.',
  followUpRequired: false,
  ...overrides,
})

const create = (body: unknown) => readActionInput(body, { mode: 'create', now: NOW, ticketCreatedAt: CREATED })
const fields = (body: unknown) => create(body).errors.map((error) => error.field)

describe('UNIT-04 action text bounds (BR-07, BR-08, BR-11, AC-04)', () => {
  it('accepts in-range text and stores it trimmed', () => {
    const { data, errors } = create(
      valid({ description: `  ${'d'.repeat(2000)}  `, result: 'r'.repeat(1000), attachmentNotes: 'a'.repeat(500) }),
    )

    expect(errors).toEqual([])
    expect(data.description).toBe('d'.repeat(2000))
    expect(data.result).toBe('r'.repeat(1000))
    expect(data.attachmentNotes).toBe('a'.repeat(500))
  })

  it('accepts one character', () => {
    expect(create(valid({ description: 'd', result: 'r', attachmentNotes: 'a' })).errors).toEqual([])
  })

  it('reports every out-of-range field together', () => {
    expect(fields(valid({ description: 'd'.repeat(2001), result: 'r'.repeat(1001), attachmentNotes: 'a'.repeat(501) }))).toEqual([
      'description',
      'result',
      'attachmentNotes',
    ])
  })

  it('rejects empty and whitespace-only description and result with the documented messages', () => {
    const { errors } = create(valid({ description: '', result: '   \n ' }))

    expect(errors).toEqual([
      { field: 'description', message: 'Describe the action in up to 2000 characters.' },
      { field: 'result', message: 'Enter the result in up to 1000 characters.' },
    ])
  })

  it('stores empty attachment notes as null', () => {
    expect(create(valid({ attachmentNotes: '   ' })).data.attachmentNotes).toBeNull()
    expect(create(valid({ attachmentNotes: null })).data.attachmentNotes).toBeNull()
  })

  it('requires every create field', () => {
    expect(fields({})).toEqual(['clientRequestId', 'actionAt', 'description', 'result', 'followUpRequired'])
  })

  it('requires a canonical lower-case UUID', () => {
    expect(fields(valid({ clientRequestId: 'not-a-uuid' }))).toEqual(['clientRequestId'])
    expect(fields(valid({ clientRequestId: '6F1C2D7E-9A4B-4C1E-8D2F-0B7A3E5C9D11' }))).toEqual(['clientRequestId'])
  })
})

describe('UNIT-05 follow-up pairing (BR-10, AC-03)', () => {
  it('accepts true with a note, false with none, and normalises false with "" to null', () => {
    expect(create(valid({ followUpRequired: true, followUpNote: '  Call back Monday  ' })).data.followUpNote).toBe('Call back Monday')
    expect(create(valid({ followUpRequired: false })).data.followUpNote).toBeNull()
    expect(create(valid({ followUpRequired: false, followUpNote: null })).errors).toEqual([])

    const blank = create(valid({ followUpRequired: false, followUpNote: '' }))
    expect(blank.errors).toEqual([])
    expect(blank.data.followUpNote).toBeNull()
  })

  it('rejects true with no note', () => {
    expect(create(valid({ followUpRequired: true })).errors).toEqual([
      { field: 'followUpNote', message: 'Describe the follow-up that is needed.' },
    ])
    expect(fields(valid({ followUpRequired: true, followUpNote: '   ' }))).toEqual(['followUpNote'])
  })

  it('rejects false with text instead of discarding it', () => {
    expect(create(valid({ followUpRequired: false, followUpNote: 'Forgotten text' })).errors).toEqual([
      { field: 'followUpNote', message: 'Remove the follow-up note or mark follow-up as required.' },
    ])
  })

  it('rejects a follow-up note over 1000 characters and a non-boolean flag', () => {
    expect(fields(valid({ followUpRequired: true, followUpNote: 'n'.repeat(1001) }))).toEqual(['followUpNote'])
    expect(fields(valid({ followUpRequired: 'yes' }))).toEqual(['followUpRequired'])
  })
})

describe('UNIT-06 actionAt (BR-06, AC-04)', () => {
  const at = (date: Date) => date.toISOString()

  it('rejects a timestamp without an offset', () => {
    expect(create(valid({ actionAt: '2026-10-19T09:15:00' })).errors).toEqual([
      { field: 'actionAt', message: 'Enter when the action was performed.' },
    ])
    expect(fields(valid({ actionAt: 'yesterday' }))).toEqual(['actionAt'])
  })

  it('rejects a time before the Ticket was created', () => {
    expect(create(valid({ actionAt: at(new Date(CREATED.getTime() - 1)) })).errors).toEqual([
      { field: 'actionAt', message: 'The action time cannot be before the ticket was created.' },
    ])
  })

  it('allows 5 minutes of clock skew: +4 min accepted, +6 min rejected', () => {
    expect(create(valid({ actionAt: at(new Date(NOW.getTime() + 4 * MINUTE)) })).errors).toEqual([])
    expect(create(valid({ actionAt: at(new Date(NOW.getTime() + 6 * MINUTE)) })).errors).toEqual([
      { field: 'actionAt', message: 'The action time cannot be in the future.' },
    ])
  })

  it('stores the instant in UTC', () => {
    expect(create(valid()).data.actionAt).toEqual(new Date('2026-10-19T02:15:00.000Z'))
  })

  it('skips the creation bound when the Ticket is not yet known', () => {
    const early = valid({ actionAt: at(new Date(CREATED.getTime() - 1)) })
    expect(readActionInput(early, { mode: 'create', now: NOW }).errors).toEqual([])
  })
})

describe('UNIT-07 server-owned keys (BR-03, AC-02)', () => {
  it('rejects each by name; performer keys say the performer is recorded automatically', () => {
    const { errors } = create(
      valid({ performedById: 9, performedBy: { id: 9 }, createdAt: '2026-01-01T00:00:00Z', ticketId: 4, version: 3, foo: 1 }),
    )

    expect(errors).toEqual([
      { field: 'performedById', message: 'Performed by is recorded automatically.' },
      { field: 'performedBy', message: 'Performed by is recorded automatically.' },
      { field: 'createdAt', message: 'This value cannot be set.' },
      { field: 'ticketId', message: 'This value cannot be set.' },
      { field: 'version', message: 'This value cannot be set.' },
      { field: 'foo', message: 'This value cannot be set.' },
    ])
  })
})

describe('edit bodies (api-spec §3.4)', () => {
  const update = (body: unknown) => readActionInput(body, { mode: 'update', now: NOW, ticketCreatedAt: CREATED })

  it('takes expectedVersion plus any subset of the editable fields', () => {
    const { data, errors, expectedVersion } = update({ expectedVersion: 2, result: ' Stable all day. ', attachmentNotes: null })

    expect(errors).toEqual([])
    expect(expectedVersion).toBe(2)
    expect(data).toEqual({ result: 'Stable all day.', attachmentNotes: null })
  })

  it('requires a positive integer expectedVersion and at least one editable field', () => {
    expect(update({}).errors).toEqual([
      { field: 'expectedVersion', message: 'Reload the action and try again.' },
      { field: 'body', message: 'Change at least one field.' },
    ])
    expect(update({ expectedVersion: 0, result: 'x' }).errors.map((e) => e.field)).toEqual(['expectedVersion'])
    expect(update({ expectedVersion: '2', result: 'x' }).errors.map((e) => e.field)).toEqual(['expectedVersion'])
  })

  it('refuses clientRequestId and server-owned keys on edit', () => {
    expect(update({ expectedVersion: 1, result: 'x', clientRequestId: 'a', performedById: 2 }).errors.map((e) => e.field)).toEqual([
      'clientRequestId',
      'performedById',
    ])
  })

  it('leaves the follow-up pairing to the resulting action, so a lone note edit is accepted here', () => {
    expect(update({ expectedVersion: 1, followUpNote: 'New note' }).errors).toEqual([])
    expect(update({ expectedVersion: 1, followUpRequired: false, followUpNote: null }).data).toEqual({
      followUpRequired: false,
      followUpNote: null,
    })
  })
})
