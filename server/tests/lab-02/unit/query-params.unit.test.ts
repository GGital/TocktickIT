import { describe, expect, it } from 'vitest'
import { QueryParameterError, parseTicketListQuery } from '../../../src/ticketQuery.js'

describe('UNIT-09 query defaults (BR-38, BR-39)', () => {
  it('applies the documented defaults to an empty query', () => {
    expect(parseTicketListQuery({})).toEqual({
      search: undefined,
      categoryId: undefined,
      relatedSystemId: undefined,
      requestedPriority: undefined,
      status: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 10,
    })
  })

  it('trims the search term and treats a blank one as no search', () => {
    expect(parseTicketListQuery({ search: '  laptop  ' }).search).toBe('laptop')
    expect(parseTicketListQuery({ search: '   ' }).search).toBeUndefined()
  })

  it('accepts every documented value', () => {
    expect(
      parseTicketListQuery({
        categoryId: '2',
        relatedSystemId: '7',
        requestedPriority: 'URGENT',
        status: 'NEW',
        sortBy: 'ticketNumber',
        sortOrder: 'asc',
        page: '3',
        pageSize: '50',
      }),
    ).toMatchObject({
      categoryId: 2,
      relatedSystemId: 7,
      requestedPriority: 'URGENT',
      status: 'NEW',
      sortBy: 'ticketNumber',
      sortOrder: 'asc',
      page: 3,
      pageSize: 50,
    })
  })
})

describe('UNIT-10 unsupported values are rejected, never coerced (BR-39, AC-39)', () => {
  it.each([
    [{ pageSize: '999' }, 'pageSize'],
    [{ page: 'abc' }, 'page'],
    [{ page: '0' }, 'page'],
    [{ sortBy: 'secret' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
    [{ requestedPriority: 'CRITICAL' }, 'requestedPriority'],
    [{ status: 'CLOSED' }, 'status'],
    [{ categoryId: '-1' }, 'categoryId'],
    [{ relatedSystemId: 'two' }, 'relatedSystemId'],
    // A repeated parameter arrives as an array and is not valid input either.
    [{ sortBy: ['createdAt', 'updatedAt'] }, 'sortBy'],
  ])('rejects %o naming the offending parameter', (query, parameter) => {
    expect(() => parseTicketListQuery(query as Record<string, unknown>)).toThrowError(
      QueryParameterError,
    )

    try {
      parseTicketListQuery(query as Record<string, unknown>)
      expect.unreachable('the parser must throw')
    } catch (error) {
      expect((error as QueryParameterError).parameter).toBe(parameter)
      expect((error as QueryParameterError).message).toContain(parameter)
    }
  })

  it('ignores an unknown parameter name rather than failing', () => {
    expect(parseTicketListQuery({ sortDirection: 'up' }).sortBy).toBe('createdAt')
  })
})
