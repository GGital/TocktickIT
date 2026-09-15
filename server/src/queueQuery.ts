import {
  PAGE_SIZES,
  PRIORITIES,
  QueryParameterError,
  readEnum,
  readPositiveInt,
  readSingle,
} from './ticketQuery.js'

export const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
] as const
const SORT_FIELDS = ['itPriority', 'createdAt', 'updatedAt', 'ticketNumber', 'status'] as const
const SORT_ORDERS = ['asc', 'desc'] as const

type SortField = (typeof SORT_FIELDS)[number]
type SortOrder = (typeof SORT_ORDERS)[number]

export type QueueQuery = {
  search?: string
  statuses?: (typeof STATUSES)[number][]
  itPriority?: (typeof PRIORITIES)[number]
  requestedPriority?: (typeof PRIORITIES)[number]
  categoryId?: number
  relatedSystemId?: number
  /** A user id, or null for "unassigned". "me" has already been resolved to the session user. */
  assigneeId?: number | null
  flaggedResolved?: boolean
  sortBy: SortField
  sortOrder: SortOrder
  orderBy: Partial<Record<SortField | 'id', SortOrder>>[]
  page: number
  pageSize: (typeof PAGE_SIZES)[number]
}

/** `status` is the one repeatable parameter (BR-60, A-14): repeats form an OR set, each value validated. */
function readStatuses(query: Record<string, unknown>) {
  const raw = query.status
  if (raw === undefined) return undefined

  const values = (Array.isArray(raw) ? raw : [raw]).filter((value) => value !== '')
  for (const value of values) {
    if (typeof value !== 'string' || !(STATUSES as readonly string[]).includes(value)) {
      throw new QueryParameterError('status', `status must be one of ${STATUSES.join(', ')}.`)
    }
  }
  return values.length > 0 ? [...new Set(values as (typeof STATUSES)[number][])] : undefined
}

function readAssignee(query: Record<string, unknown>, sessionUserId: number) {
  const value = readSingle(query, 'assignee')
  if (value === undefined || value === '') return undefined
  if (value === 'me') return sessionUserId
  if (value === 'unassigned') return null
  if (/^\d+$/.test(value) && Number(value) > 0) return Number(value)
  throw new QueryParameterError('assignee', 'assignee must be a user id, me, or unassigned.')
}

function readBoolean(query: Record<string, unknown>, name: string) {
  const value = readSingle(query, name)
  if (value === undefined || value === '') return undefined
  if (value === 'true' || value === 'false') return value === 'true'
  throw new QueryParameterError(name, `${name} must be true or false.`)
}

/**
 * Query parsing for `GET /api/staff/tickets` (api-spec §3.9). Anything outside the accepted values is rejected
 * naming the parameter — never coerced, never ignored (BR-63). Unknown parameter names are ignored, as in Lab 2.
 */
export function parseQueueQuery(query: Record<string, unknown>, sessionUserId: number): QueueQuery {
  const pageSizeRaw = readSingle(query, 'pageSize')
  const pageSize = pageSizeRaw === undefined || pageSizeRaw === '' ? 20 : Number(pageSizeRaw)
  if (!PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])) {
    throw new QueryParameterError('pageSize', `pageSize must be one of ${PAGE_SIZES.join(', ')}.`)
  }

  const search = readSingle(query, 'search')?.trim()
  const sortBy = readEnum(query, 'sortBy', SORT_FIELDS) ?? 'itPriority'
  const sortOrder = readEnum(query, 'sortOrder', SORT_ORDERS) ?? 'desc'

  // Enums sort by declaration order: IT Priority by severity, status by lifecycle (api-spec §3.9). Within one IT
  // Priority the longest-waiting Ticket leads (BR-61); id is always the last word, so paging is stable.
  const orderBy =
    sortBy === 'itPriority'
      ? [{ itPriority: sortOrder }, { createdAt: 'asc' as const }, { id: 'asc' as const }]
      : [{ [sortBy]: sortOrder }, { id: 'asc' as const }]

  return {
    search: search ? search : undefined,
    statuses: readStatuses(query),
    itPriority: readEnum(query, 'itPriority', PRIORITIES),
    requestedPriority: readEnum(query, 'requestedPriority', PRIORITIES),
    categoryId: readPositiveInt(query, 'categoryId'),
    relatedSystemId: readPositiveInt(query, 'relatedSystemId'),
    assigneeId: readAssignee(query, sessionUserId),
    flaggedResolved: readBoolean(query, 'flaggedResolved'),
    sortBy,
    sortOrder,
    orderBy,
    page: readPositiveInt(query, 'page') ?? 1,
    pageSize: pageSize as (typeof PAGE_SIZES)[number],
  }
}
