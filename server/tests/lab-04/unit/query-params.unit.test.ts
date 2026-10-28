import { describe, expect, it } from 'vitest'
import { parseQueueQuery, STATUSES } from '../../../src/queueQuery.js'
import { QueryParameterError, parseTicketListQuery } from '../../../src/ticketQuery.js'

const rejection = (parse: () => unknown) => {
  try {
    parse()
  } catch (error) {
    expect(error).toBeInstanceOf(QueryParameterError)
    return (error as QueryParameterError).parameter
  }
  return expect.unreachable('the parser must throw')
}

describe('UNIT-10 the Queue followUp parameter (FR-23, BR-62)', () => {
  const parse = (followUp: unknown) => parseQueueQuery({ followUp }, 7)

  it('parses outstanding and mine, and ignores an empty value', () => {
    expect(parse('outstanding').followUp).toBe('outstanding')
    expect(parse('mine').followUp).toBe('mine')
    expect(parse('').followUp).toBeUndefined()
    expect(parseQueueQuery({}, 7).followUp).toBeUndefined()
  })

  it('rejects any other value and a repeat, naming followUp', () => {
    expect(rejection(() => parse('all'))).toBe('followUp')
    expect(rejection(() => parse('OUTSTANDING'))).toBe('followUp')
    expect(rejection(() => parse(['outstanding', 'mine']))).toBe('followUp')
  })
})

describe('UNIT-11 the My Tickets status parameter (FR-23)', () => {
  it('accepts each of the eight statuses', () => {
    for (const status of STATUSES) expect(parseTicketListQuery({ status }).statuses).toEqual([status])
  })

  it('turns repeats into a de-duplicated set', () => {
    expect(parseTicketListQuery({ status: ['RESOLVED', 'CLOSED', 'RESOLVED'] }).statuses).toEqual(['RESOLVED', 'CLOSED'])
    expect(parseTicketListQuery({}).statuses).toBeUndefined()
  })

  it('rejects an unknown value, alone or among valid ones, naming status', () => {
    expect(rejection(() => parseTicketListQuery({ status: 'NONSENSE' }))).toBe('status')
    expect(rejection(() => parseTicketListQuery({ status: ['OPEN', 'NONSENSE'] }))).toBe('status')
  })
})
