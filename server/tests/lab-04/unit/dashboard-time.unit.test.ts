import { describe, expect, it } from 'vitest'
import { bangkokDayStart, recentWindowStart } from '../../../src/dashboard.js'

describe('UNIT-08 Bangkok start of day (BR-49, AC-32)', () => {
  it.each([
    ['2026-10-19T16:59:59.000Z', '2026-10-18T17:00:00.000Z'],
    ['2026-10-19T17:00:00.000Z', '2026-10-19T17:00:00.000Z'],
    ['2026-10-19T17:00:01.000Z', '2026-10-19T17:00:00.000Z'],
  ])('%s starts its Bangkok day at %s', (now, start) => {
    expect(bangkokDayStart(new Date(now)).toISOString()).toBe(start)
  })

  it('is fixed at UTC+07:00 all year: no daylight saving', () => {
    expect(bangkokDayStart(new Date('2026-03-29T12:00:00.000Z')).toISOString()).toBe('2026-03-28T17:00:00.000Z')
    expect(bangkokDayStart(new Date('2026-07-01T00:00:00.000Z')).toISOString()).toBe('2026-06-30T17:00:00.000Z')
  })
})

describe('UNIT-09 the rolling 7-day window (BR-49, AC-33)', () => {
  it('starts exactly 604,800,000 ms before now', () => {
    const now = new Date('2026-10-20T04:00:00.123Z')
    expect(now.getTime() - recentWindowStart(now).getTime()).toBe(604_800_000)
  })
})
