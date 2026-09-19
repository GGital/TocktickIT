import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Callout from '../components/Callout'
import EmptyState from '../components/EmptyState'
import ForbiddenState from '../components/ForbiddenState'
import Pagination from '../components/Pagination'
import PriorityBadge, { type Priority } from '../components/PriorityBadge'
import SelectField from '../components/SelectField'
import { SkeletonCard, SkeletonRows } from '../components/Skeleton'
import StatusBadge, { ResolutionFlagBadge } from '../components/StatusBadge'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import { OPEN_WORK, PRIORITIES, STATUS_LABELS, TICKET_STATUSES, type TicketStatus } from '../lib/ticketLabels'

type Reference = { id: number; name: string }
type Person = { id: number; fullName: string }

/** QueueTicketSummary (api-spec §2.5). */
type QueueRow = {
  id: number
  ticketNumber: string
  summary: string
  category: Reference
  relatedSystem: Reference
  requester: Person
  assignee: Person | null
  requestedPriority: Priority
  itPriority: Priority
  status: TicketStatus
  requesterResolvedFlagged: boolean
  createdAt: string
  updatedAt: string
}

type Result = {
  data: QueueRow[]
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; sortBy: string; sortOrder: string }
}

type SortField = 'ticketNumber' | 'createdAt' | 'itPriority' | 'status' | 'updatedAt'

const FILTER_KEYS = ['search', 'status', 'itPriority', 'assignee', 'requestedPriority', 'categoryId', 'relatedSystemId', 'flaggedResolved']

// The heading counts are three fixed Queue requests read for their totals — the only analytics in Lab 3 (X-06).
const OPEN_WORK_QUERY = OPEN_WORK.map((status) => `status=${status}`).join('&')
const COUNT_PATHS = {
  open: `/staff/tickets?${OPEN_WORK_QUERY}&pageSize=10`,
  unassigned: `/staff/tickets?${OPEN_WORK_QUERY}&assignee=unassigned&pageSize=10`,
  waiting: '/staff/tickets?status=WAITING_FOR_REQUESTER&pageSize=10',
}

const isResult = (value: unknown): value is Result =>
  Array.isArray((value as Result)?.data) && typeof (value as Result)?.meta?.totalItems === 'number'

const createdDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
/** "2 hr. ago" — age and activity are how a queue is triaged (ui-spec §7.1). */
function updatedAgo(iso: string) {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute')
  if (Math.abs(minutes) < 60 * 24) return relativeTime.format(Math.round(minutes / 60), 'hour')
  return relativeTime.format(Math.round(minutes / (60 * 24)), 'day')
}

/** IT Staff Ticket Queue (ui-spec §7). Every query runs server-side; the URL holds the state. */
export default function TicketQueue() {
  const user = useCurrentUser()!
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [rejectedParameter, setRejectedParameter] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [counts, setCounts] = useState<{ open: number; unassigned: number; waiting: number } | null>(null)
  const [staff, setStaff] = useState<Person[]>([])
  const [categories, setCategories] = useState<Reference[]>([])
  const [systems, setSystems] = useState<Reference[]>([])
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const query = searchParams.toString()
  const statuses = searchParams.getAll('status') as TicketStatus[]
  const activeFilters = FILTER_KEYS.filter((key) => key !== 'search' && searchParams.getAll(key).length > 0).length
  const hasCriteria = FILTER_KEYS.some((key) => searchParams.getAll(key).length > 0)
  const sortBy = (searchParams.get('sortBy') ?? 'itPriority') as SortField
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

  useEffect(() => {
    Promise.all([apiFetch<unknown>(COUNT_PATHS.open), apiFetch<unknown>(COUNT_PATHS.unassigned), apiFetch<unknown>(COUNT_PATHS.waiting)])
      .then(([open, unassigned, waiting]) =>
        setCounts(
          isResult(open) && isResult(unassigned) && isResult(waiting)
            ? { open: open.meta.totalItems, unassigned: unassigned.meta.totalItems, waiting: waiting.meta.totalItems }
            : null,
        ),
      )
      .catch(() => setCounts(null))
  }, [reloadToken])

  useEffect(() => {
    // Reference lists only feed the filter controls; the Queue still works without them.
    apiFetch<Person[]>('/staff/assignees').then((people) => Array.isArray(people) && setStaff(people)).catch(() => undefined)
    Promise.all([apiFetch<Reference[]>('/categories'), apiFetch<Reference[]>('/related-systems')])
      .then(([loadedCategories, loadedSystems]) => {
        if (Array.isArray(loadedCategories)) setCategories(loadedCategories)
        if (Array.isArray(loadedSystems)) setSystems(loadedSystems)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)

    apiFetch<unknown>(`/staff/tickets${query ? `?${query}` : ''}`)
      .then((loaded) => {
        if (!active) return
        if (!isResult(loaded)) throw new Error('Unexpected queue response')
        setResult(loaded)
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof ApiError && error.code === 'FORBIDDEN') {
          setForbidden(true)
        } else if (error instanceof ApiError && error.code === 'INVALID_QUERY_PARAMETER') {
          // The server names the parameter first; reset that control and reload with valid values (BR-63).
          const parameter = error.message.split(' ')[0]
          setRejectedParameter(parameter)
          const next = new URLSearchParams(searchParams)
          next.delete(parameter)
          setSearchParams(next, { replace: true })
        } else {
          // No stale list is ever shown as though it were current (ui-spec §7.5).
          setResult(null)
          setFailed(true)
        }
      })
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [query, reloadToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced so typing does not issue a request per keystroke (ui-spec §7.4).
  useEffect(() => {
    if (searchInput === (searchParams.get('search') ?? '')) return
    const timer = setTimeout(() => update({ search: searchInput }), 300)
    return () => clearTimeout(timer)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Any change to search, a filter, the sort, or the page size returns to page 1 (BR-62, ui-spec §7.4). */
  function update(changes: Record<string, string | string[]>, keepPage = false) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key)
      for (const item of Array.isArray(value) ? value : [value]) if (item) next.append(key, item)
    }
    if (!keepPage) next.set('page', '1')
    setRejectedParameter(null)
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    setSearchInput('')
    const next = new URLSearchParams(searchParams)
    for (const key of FILTER_KEYS) next.delete(key)
    next.set('page', '1')
    setSearchParams(next, { replace: true })
  }

  const toggleStatus = (status: TicketStatus) =>
    update({ status: statuses.includes(status) ? statuses.filter((item) => item !== status) : [...statuses, status] })

  const sortHeader = (field: SortField, label: string, className = '') => {
    const active = sortBy === field
    return (
      <th scope="col" className={className} aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className="zen-sort"
          onClick={() => update({ sortBy: field, sortOrder: active && sortOrder === 'asc' ? 'desc' : 'asc' })}
        >
          {label}
          {active && <span aria-hidden="true">{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>}
        </button>
      </th>
    )
  }

  if (forbidden) return <ForbiddenState role={user.role} />

  const firstLoad = loading && result === null && !failed
  const isEmpty = !loading && result !== null && result.meta.totalItems === 0 && !hasCriteria
  const isNoResults = !loading && result !== null && result.data.length === 0 && !isEmpty

  const owner = (row: QueueRow): ReactNode => row.assignee?.fullName ?? <span className="zen-muted">Unassigned</span>

  return (
    <>
      <h1 className="mb-1">Ticket Queue</h1>
      <p className="zen-muted mb-3" aria-live="polite">
        {counts ? `${counts.open} open · ${counts.unassigned} unassigned · ${counts.waiting} waiting for requester` : ' '}
      </p>

      <section className="zen-card mb-3" aria-label="Queue filters">
        <label className="zen-label" htmlFor="queue-search">
          Search
        </label>
        <input
          id="queue-search"
          type="search"
          className="zen-control mb-3"
          placeholder="Search number, summary, requester"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />

        {/* Below 768 px the filters collapse behind one button that shows how many are active (ui-spec §7.3). */}
        <Button
          variant="secondary"
          className="d-md-none mb-3"
          aria-expanded={filtersOpen}
          aria-controls="queue-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </Button>

        <div id="queue-filters" className={`${filtersOpen ? 'd-flex' : 'd-none'} d-md-flex flex-wrap align-items-end gap-3`}>
          <details className="zen-disclosure">
            <summary className="btn btn-outline-primary">Status{statuses.length > 0 ? ` (${statuses.length})` : ''}</summary>
            <div className="zen-disclosure-panel">
              <Button variant="secondary" className="mb-2" onClick={() => update({ status: OPEN_WORK })}>
                Open work
              </Button>
              {TICKET_STATUSES.map((status) => (
                <label key={status} className="zen-check">
                  <input type="checkbox" checked={statuses.includes(status)} onChange={() => toggleStatus(status)} />{' '}
                  {STATUS_LABELS[status]}
                </label>
              ))}
            </div>
          </details>

          <SelectField
            id="itPriority"
            label="IT Priority"
            placeholder="Any"
            value={searchParams.get('itPriority') ?? ''}
            onChange={(event) => update({ itPriority: event.target.value })}
            options={PRIORITIES.map((value) => ({ value, label: value }))}
          />

          <SelectField
            id="assignee"
            label="Owner"
            placeholder="Any"
            value={searchParams.get('assignee') ?? ''}
            onChange={(event) => update({ assignee: event.target.value })}
            options={[
              { value: 'unassigned', label: 'Unassigned' },
              { value: 'me', label: 'Assigned to me' },
              ...staff.map((person) => ({ value: String(person.id), label: person.fullName })),
            ]}
          />

          <details className="zen-disclosure">
            <summary className="btn btn-outline-primary">More filters</summary>
            <div className="zen-disclosure-panel">
              <SelectField
                id="requestedPriority"
                label="Requested Priority"
                placeholder="Any"
                value={searchParams.get('requestedPriority') ?? ''}
                onChange={(event) => update({ requestedPriority: event.target.value })}
                options={PRIORITIES.map((value) => ({ value, label: value }))}
              />
              <SelectField
                id="categoryId"
                label="Category"
                placeholder="Any"
                value={searchParams.get('categoryId') ?? ''}
                onChange={(event) => update({ categoryId: event.target.value })}
                options={categories.map((item) => ({ value: String(item.id), label: item.name }))}
              />
              <SelectField
                id="relatedSystemId"
                label="Related System"
                placeholder="Any"
                value={searchParams.get('relatedSystemId') ?? ''}
                onChange={(event) => update({ relatedSystemId: event.target.value })}
                options={systems.map((item) => ({ value: String(item.id), label: item.name }))}
              />
              <label className="zen-check">
                <input
                  type="checkbox"
                  checked={searchParams.get('flaggedResolved') === 'true'}
                  onChange={(event) => update({ flaggedResolved: event.target.checked ? 'true' : '' })}
                />{' '}
                Requester says resolved
              </label>
            </div>
          </details>

          {hasCriteria && (
            // zen-field spacing keeps it on the same baseline as the labelled controls beside it.
            <div className="zen-field">
              <Button variant="tertiary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {rejectedParameter && (
        <div className="mb-3">
          <Callout variant="warning">
            The {rejectedParameter} value in the address was not valid, so it has been reset.
          </Callout>
        </div>
      )}

      {failed && (
        <Callout variant="error" onRetry={() => setReloadToken((token) => token + 1)}>
          Unable to load the ticket queue.
        </Callout>
      )}

      {firstLoad && (
        <>
          <div className="d-none d-md-block zen-card">
            <SkeletonRows rows={6} label="Loading the ticket queue…" />
          </div>
          <div className="d-md-none">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      )}

      {isEmpty && (
        <EmptyState
          heading="No tickets have been created yet."
          body="Tickets appear here as soon as a requester submits one."
          action={<Button onClick={() => setReloadToken((token) => token + 1)}>Refresh</Button>}
        />
      )}

      {isNoResults && (
        <EmptyState
          heading="No tickets match these filters."
          body="Try a different search, or clear the filters to see the whole queue."
          action={<Button onClick={clearFilters}>Clear filters</Button>}
        />
      )}

      {result && result.data.length > 0 && !failed && (
        // Changing page dims the current page in place instead of collapsing to a skeleton (ui-spec §7.5).
        <div aria-busy={loading || undefined} className={loading ? 'zen-dimmed' : undefined}>
          <div className="zen-card d-none d-md-block p-0 overflow-x-auto">
            <table className="table mb-0 zen-queue">
              <thead>
                <tr>
                  {sortHeader('ticketNumber', 'Ticket Number')}
                  {sortHeader('createdAt', 'Created', 'd-none d-lg-table-cell')}
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Category
                  </th>
                  {sortHeader('itPriority', 'IT Priority')}
                  {sortHeader('status', 'Status')}
                  <th scope="col">Owner</th>
                  {sortHeader('updatedAt', 'Updated')}
                </tr>
              </thead>
              {result.data.map((row) => (
                <tbody key={row.id}>
                  <tr
                    className="zen-queue-row"
                    // A convenience on top of the real link; clicks on the link itself are left to the link.
                    onClick={(event) => {
                      if (!(event.target as HTMLElement).closest('a')) navigate(`/staff/tickets/${row.id}`)
                    }}
                  >
                    {/* Compact columns never wrap, so a row stays one line tall; only the Summary truncates. */}
                    <td className="zen-mono text-nowrap">
                      <Link to={`/staff/tickets/${row.id}`}>{row.ticketNumber}</Link>
                    </td>
                    <td className="d-none d-lg-table-cell text-nowrap">{createdDate(row.createdAt)}</td>
                    <td className="zen-queue-summary">
                      <span className="d-block text-truncate" title={row.summary}>
                        {row.summary}
                      </span>
                      {/* Tablet folds Category under the Summary (ui-spec §7.2). */}
                      <span className="zen-help d-lg-none">{row.category.name}</span>
                    </td>
                    <td className="d-none d-lg-table-cell">{row.category.name}</td>
                    <td className="text-nowrap">
                      <PriorityBadge kind="it" value={row.itPriority} />
                    </td>
                    <td>
                      <StatusBadge value={row.status} />
                    </td>
                    <td>{owner(row)}</td>
                    <td className="text-nowrap">{updatedAgo(row.updatedAt)}</td>
                  </tr>
                  {row.requesterResolvedFlagged && (
                    <tr className="zen-flag-row">
                      <td colSpan={8}>
                        <ResolutionFlagBadge />
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>

          <ul className="list-unstyled d-md-none mb-0">
            {result.data.map((row) => (
              <li key={row.id} className="zen-card zen-ticket-card mb-3">
                <Link to={`/staff/tickets/${row.id}`} className="d-block text-decoration-none">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <span className="zen-mono">{row.ticketNumber}</span>
                    <PriorityBadge kind="it" value={row.itPriority} />
                  </div>
                  <p className="mb-1 text-truncate" title={row.summary}>
                    {row.summary}
                  </p>
                  <p className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <StatusBadge value={row.status} />
                    <span className="zen-help">{row.category.name}</span>
                  </p>
                  <p className="zen-help mb-0">
                    Owner: {row.assignee?.fullName ?? 'Unassigned'} · Updated {updatedAgo(row.updatedAt)}
                  </p>
                  {row.requesterResolvedFlagged && (
                    <p className="mb-0 mt-1">
                      <ResolutionFlagBadge />
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.meta.totalItems > 0 && !failed && (
        <div className="d-flex flex-wrap align-items-end gap-3 mt-3">
          <div className="flex-grow-1">
            <Pagination
              page={result.meta.page}
              pageSize={result.meta.pageSize}
              totalItems={result.meta.totalItems}
              totalPages={result.meta.totalPages}
              onPageChange={(next) => update({ page: String(next) }, true)}
            />
          </div>
          <SelectField
            id="pageSize"
            label="Per page"
            value={searchParams.get('pageSize') ?? '20'}
            onChange={(event) => update({ pageSize: event.target.value })}
            options={['10', '20', '50'].map((value) => ({ value, label: value }))}
          />
        </div>
      )}
    </>
  )
}
