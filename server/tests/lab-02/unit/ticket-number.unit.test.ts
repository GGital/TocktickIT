import { describe, expect, it } from 'vitest'
import { bangkokYear, formatTicketNumber } from '../../../src/ticketNumber.js'

describe('UNIT-01 ticket number format (BR-03, AC-09)', () => {
  it('zero-pads the counter to six digits', () => {
    expect(formatTicketNumber(2026, 41)).toBe('TKT-2026-000041')
  })
})

describe('UNIT-02 ticket number boundaries (BR-03)', () => {
  it('formats the first and last number of a year', () => {
    expect(formatTicketNumber(2026, 1)).toBe('TKT-2026-000001')
    expect(formatTicketNumber(2026, 999999)).toBe('TKT-2026-999999')
  })
})

describe('UNIT-03 year resolution uses Asia/Bangkok (BR-03, A-10)', () => {
  it('rolls over at Bangkok midnight, not at UTC midnight', () => {
    // 31 Dec 17:30Z is already 1 Jan 00:30 in Bangkok (UTC+7).
    expect(bangkokYear(new Date('2026-12-31T17:30:00Z'))).toBe(2027)
    // 30 minutes earlier is still 31 December in Bangkok.
    expect(bangkokYear(new Date('2026-12-31T16:30:00Z'))).toBe(2026)
  })
})
