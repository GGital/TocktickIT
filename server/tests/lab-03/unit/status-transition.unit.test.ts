import { describe, expect, it } from 'vitest'
import type { TicketStatus } from '@prisma/client'
import { isPermittedTransition } from '../../../src/statusTransition.js'

const STATUSES: TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

// Transcribed from specification BR-35 rather than imported, so the test checks the code against the document.
const MATRIX: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  CANCELLED: [],
}

const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const))

describe('UNIT-07 every pair in the transition matrix (BR-35, AC-42)', () => {
  it('covers all 64 pairs', () => expect(pairs).toHaveLength(64))

  it.each(pairs.filter(([from, to]) => MATRIX[from].includes(to)))('permits %s → %s on an assigned Ticket', (from, to) => {
    expect(isPermittedTransition(from, to, true)).toBe(true)
  })

  it.each(pairs.filter(([from, to]) => !MATRIX[from].includes(to)))('refuses %s → %s on an assigned Ticket', (from, to) => {
    expect(isPermittedTransition(from, to, true)).toBe(false)
  })

  it('leaves CANCELLED terminal', () => {
    for (const to of STATUSES) expect(isPermittedTransition('CANCELLED', to, true)).toBe(false)
  })
})

describe('UNIT-08 a status transitioning to itself (BR-36)', () => {
  it.each(STATUSES)('refuses %s → itself, assigned or not', (status) => {
    expect(isPermittedTransition(status, status, true)).toBe(false)
    expect(isPermittedTransition(status, status, false)).toBe(false)
  })
})

describe('UNIT-09 an unassigned Ticket (BR-30, api-spec §3.13 step 5)', () => {
  it('refuses NEW → IN_PROGRESS; permits NEW → OPEN and NEW → CANCELLED', () => {
    expect(isPermittedTransition('NEW', 'IN_PROGRESS', false)).toBe(false)
    expect(isPermittedTransition('NEW', 'OPEN', false)).toBe(true)
    expect(isPermittedTransition('NEW', 'CANCELLED', false)).toBe(true)
  })

  it.each(pairs)('%s → %s unassigned is permitted only when the matrix allows it and the target is OPEN or CANCELLED', (from, to) => {
    const expected = MATRIX[from].includes(to) && (to === 'OPEN' || to === 'CANCELLED')
    expect(isPermittedTransition(from, to, false)).toBe(expected)
  })
})
