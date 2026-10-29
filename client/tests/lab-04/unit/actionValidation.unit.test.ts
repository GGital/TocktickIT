import { describe, expect, it } from 'vitest'
import { ACTION_MESSAGES, defaultActionAt, validateAction, type ActionPayload } from '../../../src/lib/actionValidation'
import { fromBangkokInput } from '../../../src/lib/formatBangkok'

// The same accept / reject set as the server's UNIT-04 – UNIT-06 (server/src/actionInput.ts).
const now = new Date('2026-10-20T03:00:00.000Z')
const ticketCreatedAt = '2026-10-01T00:00:00.000Z'

const valid = (overrides: Partial<ActionPayload> = {}): ActionPayload => ({
  actionAt: '2026-10-19T10:15:00+07:00',
  description: 'Replaced the VPN client profile.',
  result: 'Stable for 30 minutes.',
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  ...overrides,
})

const check = (overrides: Partial<ActionPayload>) => validateAction(valid(overrides), { now, ticketCreatedAt })

describe('UNIT-13 the client action validator mirrors the server bounds (AC-39, BR-10)', () => {
  it('accepts a complete action', () => {
    expect(check({})).toEqual({})
  })

  it.each([
    ['description', '', ACTION_MESSAGES.description],
    ['description', '   ', ACTION_MESSAGES.description],
    ['description', 'x'.repeat(2001), ACTION_MESSAGES.description],
    ['result', '', ACTION_MESSAGES.result],
    ['result', '\n\t ', ACTION_MESSAGES.result],
    ['result', 'x'.repeat(1001), ACTION_MESSAGES.result],
    ['attachmentNotes', 'x'.repeat(501), ACTION_MESSAGES.attachmentNotes],
  ] as const)('rejects %s = %j', (field, value, message) => {
    expect(check({ [field]: value })).toEqual({ [field]: message })
  })

  it.each([
    ['description', 'x'],
    ['description', 'x'.repeat(2000)],
    ['result', 'x'],
    ['result', 'x'.repeat(1000)],
    ['attachmentNotes', 'x'.repeat(500)],
    ['attachmentNotes', '   '],
  ] as const)('accepts %s at the bound', (field, value) => {
    expect(check({ [field]: value })).toEqual({})
  })

  it('reports every failing field together', () => {
    expect(Object.keys(check({ description: '', result: '', followUpRequired: null, actionAt: '' })).sort()).toEqual([
      'actionAt',
      'description',
      'followUpRequired',
      'result',
    ])
  })

  it('pairs the follow-up note with Follow-Up Required (BR-10)', () => {
    expect(check({ followUpRequired: true, followUpNote: 'Call back Monday.' })).toEqual({})
    expect(check({ followUpRequired: true, followUpNote: null })).toEqual({ followUpNote: ACTION_MESSAGES.noteMissing })
    expect(check({ followUpRequired: true, followUpNote: '   ' })).toEqual({ followUpNote: ACTION_MESSAGES.noteMissing })
    expect(check({ followUpRequired: true, followUpNote: 'x'.repeat(1001) })).toEqual({ followUpNote: ACTION_MESSAGES.noteMissing })
    expect(check({ followUpRequired: false, followUpNote: null })).toEqual({})
    expect(check({ followUpRequired: false, followUpNote: '' })).toEqual({})
    expect(check({ followUpRequired: false, followUpNote: 'Call back Monday.' })).toEqual({ followUpNote: ACTION_MESSAGES.noteNotWanted })
    expect(check({ followUpRequired: null })).toEqual({ followUpRequired: ACTION_MESSAGES.followUpRequired })
  })

  it('bounds actionAt: offset required, not before the ticket, at most five minutes ahead (BR-06)', () => {
    expect(check({ actionAt: '' })).toEqual({ actionAt: ACTION_MESSAGES.actionAt })
    expect(check({ actionAt: '2026-10-19T10:15' })).toEqual({ actionAt: ACTION_MESSAGES.actionAt })
    expect(check({ actionAt: '2026-09-30T23:59:00Z' })).toEqual({ actionAt: ACTION_MESSAGES.beforeTicket })
    expect(check({ actionAt: '2026-10-20T03:04:00Z' })).toEqual({})
    expect(check({ actionAt: '2026-10-20T03:06:00Z' })).toEqual({ actionAt: ACTION_MESSAGES.future })
  })
})

describe('the default action time is valid on a Ticket opened this minute (BR-06)', () => {
  it('rounds up to the next minute when the input’s dropped seconds would put it before the Ticket', () => {
    const value = defaultActionAt('2026-10-20T03:00:40.000Z', Date.parse('2026-10-20T03:00:52.000Z'))
    expect(value).toBe('2026-10-20T10:01')
    expect(validateAction(valid({ actionAt: fromBangkokInput(value) }), { now: new Date('2026-10-20T03:00:52.000Z'), ticketCreatedAt: '2026-10-20T03:00:40.000Z' })).toEqual({})
  })

  it('is the current Bangkok minute otherwise', () => {
    expect(defaultActionAt(ticketCreatedAt, Date.parse('2026-10-20T03:00:52.000Z'))).toBe('2026-10-20T10:00')
  })
})
