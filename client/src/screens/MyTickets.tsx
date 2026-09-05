import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Badge, { type Priority } from '../components/Badge'
import Button from '../components/Button'
import Callout from '../components/Callout'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import SelectField from '../components/SelectField'
import { SkeletonCard, SkeletonRows } from '../components/Skeleton'
import { apiFetch } from '../lib/apiClient'
import { useRequesterId } from '../lib/requesterContext'

type Reference = { id: number; name: string }

type TicketSummary = {
  id: number
  ticketNumber: string
  summary: string
  category: Reference
  relatedSystem: Reference
  requestedPriority: Priority
  status: 'NEW'
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

type PageMeta = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

type Result = { data: TicketSummary[]; meta: PageMeta }

/** Sort options map to the sortBy + sortOrder pair the API documents (ui-spec §6.4). */
const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'ticketNumber:asc', label: 'Ticket Number ascending' },
  { value: 'ticketNumber:desc', label: 'Ticket Number descending' },
  { value: 'requestedPriority:desc', label: 'Priority high to low' },
  { value: 'requestedPriority:asc', label: 'Priority low to high' },
]

const FILTER_KEYS = ['search', 'categoryId', 'relatedSystemId', 'requestedPriority', 'status']

const bangkokDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

/** My Tickets (ui-spec §6). Every query runs server-side; the URL holds the state
 * so a filtered view can be reloaded, shared, and screenshotted (BR-34). */
export default function MyTickets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requesterId = useRequesterId()
  const navigate = useNavigate()

  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [categories, setCategories] = useState<Reference[]>([])
  const [systems, setSystems] = useState<Reference[]>([])
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const [reloadToken, setReloadToken] = useState(0)

  const query = searchParams.toString()
  const hasCriteria = FILTER_KEYS.some((key) => searchParams.get(key))
  const previousRequester = useRef(requesterId)
  // Set while a requester switch is clearing the query, so no request goes out
  // carrying the previous requester's search and page (BR-12, AC-04).
  const pendingReset = useRef<number | null>(null)

  // Switching requester discards every requester-scoped piece of state before the
  // new request resolves, so requester A's rows are never seen under B (BR-12, AC-04).
  useEffect(() => {
    if (previousRequester.current === requesterId) return

    previousRequester.current = requesterId
    pendingReset.current = requesterId
    setResult(null)
    setSearchInput('')
    setSearchParams({}, { replace: true })
  }, [requesterId, setSearchParams])

  useEffect(() => {
    Promise.all([apiFetch<Reference[]>('/categories'), apiFetch<Reference[]>('/related-systems')])
      .then(([loadedCategories, loadedSystems]) => {
        setCategories(loadedCategories)
        setSystems(loadedSystems)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (pendingReset.current === requesterId) {
      // Params are cleared one render later; wait for that rather than querying twice.
      if (query !== '') return
      pendingReset.current = null
    }

    let active = true
    setLoading(true)
    setFailed(false)

    apiFetch<Result>(`/tickets${query ? `?${query}` : ''}`)
      .then((loaded) => active && setResult(loaded))
      .catch(() => {
        if (!active) return
        // No stale rows may be shown as if they were current (AC-40).
        setResult(null)
        setFailed(true)
      })
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [query, requesterId, reloadToken])

  // Debounced so a search does not fire a request per keystroke (ui-spec §6.4).
  useEffect(() => {
    const current = searchParams.get('search') ?? ''
    if (searchInput === current) return

    const timer = setTimeout(() => update({ search: searchInput }), 350)
    return () => clearTimeout(timer)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Any change to search, a filter, or the page size returns to page 1 (BR-41, AC-38). */
  function update(changes: Record<string, string>, keepPage = false) {
    const next = new URLSearchParams(searchParams)

    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }

    // Reset is explicit rather than implied by omission, so the request the server
    // sees says page=1 (BR-41, AC-38).
    if (!keepPage) next.set('page', '1')
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    setSearchInput('')
    setSearchParams({}, { replace: true })
  }

  const sortValue = `${searchParams.get('sortBy') ?? 'createdAt'}:${searchParams.get('sortOrder') ?? 'desc'}`
  const firstLoad = loading && result === null
  const isEmpty = result?.meta?.totalItems === 0 && !hasCriteria
  const isNoResults = result?.meta?.totalItems === 0 && hasCriteria

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="mb-0">My Tickets</h1>
        <Button onClick={() => navigate('/tickets/new')}>Create Ticket</Button>
      </div>

      {/* Nothing to filter when the requester owns no tickets at all (BR-42). */}
      {!isEmpty && (
        <section className="zen-card mb-3">
          <label className="zen-label" htmlFor="search">
            Search
          </label>
          <input
            id="search"
            type="search"
            className="zen-control mb-3"
            placeholder="Search ticket number, summary, description"
            disabled={firstLoad}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />

          <div className="row">
            <div className="col-md-3">
              <SelectField
                id="categoryId"
                label="Category"
                placeholder="All"
                disabled={firstLoad}
                value={searchParams.get('categoryId') ?? ''}
                onChange={(event) => update({ categoryId: event.target.value })}
                options={categories.map((item) => ({ value: String(item.id), label: item.name }))}
              />
            </div>
            <div className="col-md-3">
              <SelectField
                id="relatedSystemId"
                label="Related System"
                placeholder="All"
                disabled={firstLoad}
                value={searchParams.get('relatedSystemId') ?? ''}
                onChange={(event) => update({ relatedSystemId: event.target.value })}
                options={systems.map((item) => ({ value: String(item.id), label: item.name }))}
              />
            </div>
            <div className="col-md-3">
              <SelectField
                id="requestedPriority"
                label="Requested Priority"
                placeholder="All"
                disabled={firstLoad}
                value={searchParams.get('requestedPriority') ?? ''}
                onChange={(event) => update({ requestedPriority: event.target.value })}
                options={['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </div>
            <div className="col-md-3">
              <SelectField
                id="status"
                label="Current Status"
                placeholder="All"
                disabled={firstLoad}
                value={searchParams.get('status') ?? ''}
                onChange={(event) => update({ status: event.target.value })}
                options={[{ value: 'NEW', label: 'NEW' }]}
              />
            </div>
            <div className="col-md-4">
              <SelectField
                id="sort"
                label="Sort"
                disabled={firstLoad}
                value={sortValue}
                onChange={(event) => {
                  const [sortBy, sortOrder] = event.target.value.split(':')
                  update({ sortBy, sortOrder }, true)
                }}
                options={SORT_OPTIONS}
              />
            </div>
            <div className="col-md-3">
              <SelectField
                id="pageSize"
                label="Show"
                disabled={firstLoad}
                value={searchParams.get('pageSize') ?? '10'}
                onChange={(event) => update({ pageSize: event.target.value })}
                options={['10', '20', '50'].map((value) => ({ value, label: value }))}
              />
            </div>
          </div>

          {hasCriteria && (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </section>
      )}

      {failed && (
        <Callout variant="error" onRetry={() => setReloadToken((token) => token + 1)}>
          Unable to load your tickets.
        </Callout>
      )}

      {firstLoad && !failed && (
        <>
          <div className="d-none d-md-block zen-card">
            <SkeletonRows rows={6} label="Loading your tickets…" />
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
          heading="You have not created any tickets yet."
          body="When you submit a ticket it will appear here."
          action={<Button onClick={() => navigate('/tickets/new')}>Create Ticket</Button>}
        />
      )}

      {isNoResults && (
        <EmptyState
          heading="No tickets match your search."
          body="Try a different search term, or clear the filters to see every ticket."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )}

      {result && result.data.length > 0 && (
        // Refetching dims the existing rows instead of removing them, so the layout
        // does not jump between pages (ui-spec §6.5).
        <div aria-busy={loading || undefined} className={loading ? 'zen-dimmed' : undefined}>
          <div className="zen-card d-none d-md-block p-0 overflow-x-auto">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Related System
                  </th>
                  <th scope="col">Requested Priority</th>
                  <th scope="col">Current Status</th>
                  <th scope="col">Ticket Date</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="zen-mono">
                      <Link to={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link>
                    </td>
                    <td className="zen-filename text-truncate" title={ticket.summary}>
                      {ticket.summary}
                      {ticket.attachmentCount > 0 && (
                        <span className="zen-help ms-2">📎 {ticket.attachmentCount}</span>
                      )}
                    </td>
                    <td>{ticket.category.name}</td>
                    <td className="d-none d-lg-table-cell">{ticket.relatedSystem.name}</td>
                    <td>
                      <Badge kind="priority" value={ticket.requestedPriority} />
                    </td>
                    <td>
                      <Badge kind="status" value={ticket.status} />
                    </td>
                    <td>{bangkokDate(ticket.createdAt)}</td>
                    <td className="d-none d-lg-table-cell">{bangkokDate(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="list-unstyled d-md-none mb-0">
            {result.data.map((ticket) => (
              <li key={ticket.id} className="zen-card zen-ticket-card mb-3">
                <Link to={`/tickets/${ticket.id}`} className="d-block text-decoration-none">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <span className="zen-mono">{ticket.ticketNumber}</span>
                    <span className="d-flex gap-1">
                      <Badge kind="priority" value={ticket.requestedPriority} />
                      <Badge kind="status" value={ticket.status} />
                    </span>
                  </div>
                  <p className="mb-1 text-truncate" title={ticket.summary}>
                    {ticket.summary}
                  </p>
                  <p className="zen-help mb-0">
                    {ticket.category.name} · {ticket.relatedSystem.name}
                  </p>
                  <p className="zen-help mb-0">
                    {bangkokDate(ticket.createdAt)}
                    {ticket.attachmentCount > 0 && <> · 📎 {ticket.attachmentCount}</>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <Pagination
              page={result.meta.page}
              pageSize={result.meta.pageSize}
              totalItems={result.meta.totalItems}
              totalPages={result.meta.totalPages}
              onPageChange={(page) => update({ page: String(page) }, true)}
            />
          </div>
        </div>
      )}
    </>
  )
}
