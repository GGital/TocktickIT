const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
const STATUSES = ['NEW'] as const
const SORT_FIELDS = ['createdAt', 'updatedAt', 'ticketNumber', 'requestedPriority'] as const
const SORT_ORDERS = ['asc', 'desc'] as const
const PAGE_SIZES = [10, 20, 50] as const

export type TicketListQuery = {
  search?: string
  categoryId?: number
  relatedSystemId?: number
  requestedPriority?: (typeof PRIORITIES)[number]
  status?: (typeof STATUSES)[number]
  sortBy: (typeof SORT_FIELDS)[number]
  sortOrder: (typeof SORT_ORDERS)[number]
  page: number
  pageSize: (typeof PAGE_SIZES)[number]
}

/** Carries the offending parameter name so the message can name it (BR-39, AC-39). */
export class QueryParameterError extends Error {
  parameter: string

  constructor(parameter: string, message: string) {
    super(message)
    this.name = 'QueryParameterError'
    this.parameter = parameter
  }
}

/** Express gives `string | string[] | undefined`; a repeated parameter is not valid input. */
function readSingle(query: Record<string, unknown>, name: string): string | undefined {
  const value = query[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new QueryParameterError(name, `${name} must be supplied at most once.`)
  }

  return value
}

function readEnum<T extends readonly string[]>(
  query: Record<string, unknown>,
  name: string,
  allowed: T,
): T[number] | undefined {
  const value = readSingle(query, name)
  if (value === undefined || value === '') return undefined
  if (!allowed.includes(value)) {
    throw new QueryParameterError(name, `${name} must be one of ${allowed.join(', ')}.`)
  }

  return value
}

function readPositiveInt(query: Record<string, unknown>, name: string): number | undefined {
  const value = readSingle(query, name)
  if (value === undefined || value === '') return undefined
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new QueryParameterError(name, `${name} must be a positive integer.`)
  }

  return Number(value)
}

/**
 * Query parsing for `GET /api/tickets` (api-spec §3.6). An unsupported value is
 * rejected outright — never silently coerced or ignored, which would show the user
 * a list that does not match the controls they set (BR-39, AC-39).
 */
export function parseTicketListQuery(query: Record<string, unknown>): TicketListQuery {
  const search = readSingle(query, 'search')?.trim()
  const page = readPositiveInt(query, 'page') ?? 1

  const pageSizeRaw = readSingle(query, 'pageSize')
  const pageSize = pageSizeRaw === undefined || pageSizeRaw === '' ? 10 : Number(pageSizeRaw)
  if (!PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])) {
    throw new QueryParameterError('pageSize', `pageSize must be one of ${PAGE_SIZES.join(', ')}.`)
  }

  return {
    // An empty term means no search at all, not a match on the empty string (BR-35).
    search: search ? search : undefined,
    categoryId: readPositiveInt(query, 'categoryId'),
    relatedSystemId: readPositiveInt(query, 'relatedSystemId'),
    requestedPriority: readEnum(query, 'requestedPriority', PRIORITIES),
    status: readEnum(query, 'status', STATUSES),
    sortBy: readEnum(query, 'sortBy', SORT_FIELDS) ?? 'createdAt',
    sortOrder: readEnum(query, 'sortOrder', SORT_ORDERS) ?? 'desc',
    page,
    pageSize: pageSize as (typeof PAGE_SIZES)[number],
  }
}
