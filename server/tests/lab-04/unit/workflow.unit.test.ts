import { describe, expect, it } from 'vitest'
import type { TicketStatus } from '@prisma/client'
import { isPermittedTransition, resolutionBlockers, workflowState } from '../../../src/statusTransition.js'

const STATUSES: TicketStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']

// Specification BR-33, transcribed so the module is checked against the document.
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
const work = (total: number, voided = 0, outstandingFollowUps = 0) => ({ total, voided, outstandingFollowUps })

describe('UNIT-01 the transition matrix with an owner present (BR-33, BR-34, AC-19)', () => {
  it('permits exactly the 21 documented pairs and refuses every other, including self-transitions', () => {
    const permitted = pairs.filter(([from, to]) => isPermittedTransition(from, to, true))

    expect(permitted).toEqual(pairs.filter(([from, to]) => MATRIX[from].includes(to)))
    expect(permitted).toHaveLength(21)
    for (const status of STATUSES) expect(isPermittedTransition(status, status, true)).toBe(false)
  })
})

describe('UNIT-02 the owner condition (BR-33)', () => {
  it('refuses IN_PROGRESS and WAITING_FOR_REQUESTER targets when unassigned', () => {
    for (const [from, to] of pairs) {
      if (to === 'IN_PROGRESS' || to === 'WAITING_FOR_REQUESTER') expect(isPermittedTransition(from, to, false), `${from} → ${to}`).toBe(false)
    }
  })

  it('leaves OPEN, CANCELLED, CLOSED, and REOPENED targets to the matrix alone', () => {
    for (const [from, to] of pairs) {
      if (['OPEN', 'CANCELLED', 'CLOSED', 'REOPENED'].includes(to)) {
        expect(isPermittedTransition(from, to, false), `${from} → ${to}`).toBe(MATRIX[from].includes(to))
      }
    }
  })

  it('leaves the owner of a RESOLVED target to the gate, which reports it as UNASSIGNED', () => {
    expect(isPermittedTransition('OPEN', 'RESOLVED', false)).toBe(true)
    expect(resolutionBlockers(false, work(1))).toEqual(['UNASSIGNED'])
  })
})

describe('UNIT-03 allowedTransitions and resolutionBlockers (BR-35, BR-40, AC-28)', () => {
  it('no actions: RESOLVED withheld, blocked by NO_ACTIONS', () => {
    expect(workflowState({ status: 'IN_PROGRESS', assigned: true }, work(0))).toEqual({
      allowedTransitions: ['OPEN', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
      resolutionBlockers: ['NO_ACTIONS'],
    })
  })

  it('only voided actions count as none', () => {
    expect(workflowState({ status: 'OPEN', assigned: true }, work(2, 2)).resolutionBlockers).toEqual(['NO_ACTIONS'])
  })

  it('an outstanding follow-up blocks', () => {
    expect(workflowState({ status: 'WAITING_FOR_REQUESTER', assigned: true }, work(3, 0, 1))).toEqual({
      allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
      resolutionBlockers: ['OUTSTANDING_FOLLOW_UPS'],
    })
  })

  it('unassigned: every failure listed in the documented order, and the owner-only targets withheld too', () => {
    expect(workflowState({ status: 'OPEN', assigned: false }, work(0, 0, 0))).toEqual({
      allowedTransitions: ['CANCELLED'],
      resolutionBlockers: ['UNASSIGNED', 'NO_ACTIONS'],
    })
    expect(resolutionBlockers(false, work(1, 0, 1))).toEqual(['UNASSIGNED', 'OUTSTANDING_FOLLOW_UPS'])
  })

  it('a passing gate offers RESOLVED and reports no blockers', () => {
    expect(workflowState({ status: 'REOPENED', assigned: true }, work(4, 1, 0))).toEqual({
      allowedTransitions: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
      resolutionBlockers: [],
    })
  })

  it('blockers are [] whenever RESOLVED is not a matrix target from the current status', () => {
    expect(workflowState({ status: 'RESOLVED', assigned: true }, work(0))).toEqual({
      allowedTransitions: ['CLOSED', 'REOPENED'],
      resolutionBlockers: [],
    })
    for (const status of ['NEW', 'CLOSED', 'CANCELLED'] as const) {
      expect(workflowState({ status, assigned: false }, work(0, 0, 3)).resolutionBlockers).toEqual([])
    }
    expect(workflowState({ status: 'CANCELLED', assigned: true }, work(1)).allowedTransitions).toEqual([])
  })
})
