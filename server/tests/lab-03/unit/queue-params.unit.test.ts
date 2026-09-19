import { describe, expect, it } from 'vitest'
import { QueryParameterError } from '../../../src/ticketQuery.js'
import { parseQueueQuery } from '../../../src/queueQuery.js'

const SESSION_USER = 42

const parse = (query: Record<string, unknown>) => parseQueueQuery(query, SESSION_USER)

describe('UNIT-10 Queue defaults (BR-61, BR-62)', () => {
  it('orders by IT Priority descending, then Ticket Date ascending, then id, on page 1 of 20', () => {
    expect(parse({})).toEqual({
      search: undefined,
      statuses: undefined,
      itPriority: undefined,
      requestedPriority: undefined,
      categoryId: undefined,
      relatedSystemId: undefined,
      assigneeId: undefined,
      flaggedResolved: undefined,
      sortBy: 'itPriority',
      sortOrder: 'desc',
      orderBy: [{ itPriority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      page: 1,
      pageSize: 20,
    })
  })

  it('keeps id ascending as the final tiebreaker under any explicit sort', () => {
    expect(parse({ sortBy: 'ticketNumber', sortOrder: 'asc' }).orderBy).toEqual([{ ticketNumber: 'asc' }, { id: 'asc' }])
    expect(parse({ sortBy: 'status' }).orderBy).toEqual([{ status: 'desc' }, { id: 'asc' }])
    // Sorting by IT Priority always keeps the longest-waiting Ticket first within one urgency.
    expect(parse({ sortBy: 'itPriority', sortOrder: 'asc' }).orderBy).toEqual([{ itPriority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }])
    expect(parse({ sortOrder: 'asc' }).orderBy).toEqual([{ itPriority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }])
  })

  it('accepts every documented value', () => {
    expect(
      parse({
        search: '  printer  ',
        itPriority: 'URGENT',
        requestedPriority: 'LOW',
        categoryId: '2',
        relatedSystemId: '7',
        assignee: '15',
        flaggedResolved: 'false',
        sortBy: 'updatedAt',
        sortOrder: 'asc',
        page: '3',
        pageSize: '50',
      }),
    ).toMatchObject({
      search: 'printer',
      itPriority: 'URGENT',
      requestedPriority: 'LOW',
      categoryId: 2,
      relatedSystemId: 7,
      assigneeId: 15,
      flaggedResolved: false,
      sortBy: 'updatedAt',
      sortOrder: 'asc',
      page: 3,
      pageSize: 50,
    })
    for (const pageSize of ['10', '20', '50']) expect(parse({ pageSize }).pageSize).toBe(Number(pageSize))
  })
})

describe('UNIT-11 invalid parameters are rejected, never coerced (BR-63, AC-34)', () => {
  it.each([
    [{ pageSize: '999' }, 'pageSize'],
    [{ pageSize: '25' }, 'pageSize'],
    [{ page: 'abc' }, 'page'],
    [{ page: '0' }, 'page'],
    [{ sortBy: 'secret' }, 'sortBy'],
    [{ sortBy: 'requestedPriority' }, 'sortBy'],
    [{ sortOrder: 'up' }, 'sortOrder'],
    [{ status: 'NONSENSE' }, 'status'],
    [{ status: ['NEW', 'NONSENSE'] }, 'status'],
    [{ itPriority: 'CRITICAL' }, 'itPriority'],
    [{ requestedPriority: 'critical' }, 'requestedPriority'],
    [{ assignee: 'nobody' }, 'assignee'],
    [{ assignee: '0' }, 'assignee'],
    [{ assignee: 'ME' }, 'assignee'],
    [{ flaggedResolved: 'yes' }, 'flaggedResolved'],
    [{ categoryId: '-1' }, 'categoryId'],
    [{ relatedSystemId: 'two' }, 'relatedSystemId'],
    // Only status is repeatable (BR-60); any other parameter arriving twice is invalid.
    [{ itPriority: ['HIGH', 'LOW'] }, 'itPriority'],
    [{ assignee: ['me', 'unassigned'] }, 'assignee'],
  ])('rejects %o naming %s', (query, parameter) => {
    let thrown: unknown
    try {
      parse(query as Record<string, unknown>)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(QueryParameterError)
    expect((thrown as QueryParameterError).parameter).toBe(parameter)
    expect((thrown as QueryParameterError).message).toContain(parameter)
  })
})

describe('UNIT-12 repeated status and the owner sentinels (BR-60, FR-20)', () => {
  it('collects repeated statuses into one set and drops duplicates', () => {
    expect(parse({ status: ['NEW', 'OPEN', 'NEW'] }).statuses).toEqual(['NEW', 'OPEN'])
    expect(parse({ status: 'WAITING_FOR_REQUESTER' }).statuses).toEqual(['WAITING_FOR_REQUESTER'])
  })

  it('resolves "me" to the session user and "unassigned" to a null owner', () => {
    expect(parse({ assignee: 'me' }).assigneeId).toBe(SESSION_USER)
    expect(parse({ assignee: 'unassigned' }).assigneeId).toBeNull()
    expect(parse({}).assigneeId).toBeUndefined()
  })

  it('reads the resolution flag as a real boolean', () => {
    expect(parse({ flaggedResolved: 'true' }).flaggedResolved).toBe(true)
    expect(parse({ flaggedResolved: 'false' }).flaggedResolved).toBe(false)
  })
})
