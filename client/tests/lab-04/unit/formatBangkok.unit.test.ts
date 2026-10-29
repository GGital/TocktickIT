import { describe, expect, it } from 'vitest'
import { formatBangkok, fromBangkokInput, toBangkokInput } from '../../../src/lib/formatBangkok'

describe('UNIT-12 formatBangkok renders every timestamp in Asia/Bangkok (ui-spec §9)', () => {
  it('formats a UTC instant as "20 Oct 2026 00:15" regardless of the machine time zone', () => {
    expect(formatBangkok('2026-10-19T17:15:00Z')).toBe('20 Oct 2026 00:15')
  })

  it('uses a 24-hour clock and a two-digit minute', () => {
    expect(formatBangkok('2026-10-19T03:05:00.000Z')).toBe('19 Oct 2026 10:05')
    expect(formatBangkok('2026-01-01T06:00:00.000Z')).toBe('1 Jan 2026 13:00')
  })

  it('round-trips the datetime-local value through a +07:00 offset', () => {
    expect(toBangkokInput('2026-10-19T17:15:00Z')).toBe('2026-10-20T00:15')
    expect(fromBangkokInput('2026-10-20T00:15')).toBe('2026-10-20T00:15:00+07:00')
    expect(new Date(fromBangkokInput(toBangkokInput('2026-10-19T03:15:00Z'))).toISOString()).toBe('2026-10-19T03:15:00.000Z')
  })
})
