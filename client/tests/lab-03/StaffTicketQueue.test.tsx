import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

const staffUser = { id: 7, fullName: 'Ada Chaiyawat', email: 'ada@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const OPEN_WORK = 'status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED'
// The three count requests the heading summary makes (ui-spec §7.4); everything else is the list itself.
const COUNT_URLS = new Set([
  `/api/staff/tickets?${OPEN_WORK}&pageSize=10`,
  `/api/staff/tickets?${OPEN_WORK}&assignee=unassigned&pageSize=10`,
  '/api/staff/tickets?status=WAITING_FOR_REQUESTER&pageSize=10',
])

const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
  summary: `Queue ticket ${id}`,
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'VPN' },
  requester: { id: 12, fullName: 'Nara Sukjai' },
  assignee: { id: 7, fullName: 'Ada Chaiyawat' },
  requestedPriority: 'LOW',
  itPriority: 'URGENT',
  status: 'IN_PROGRESS',
  requesterResolvedFlagged: false,
  createdAt: '2026-09-04T02:20:00.000Z',
  updatedAt: '2026-09-09T08:02:31.000Z',
  ...overrides,
})

const page = (data: unknown[], meta: Record<string, unknown> = {}) => ({
  data,
  meta: { page: 1, pageSize: 20, totalItems: data.length, totalPages: data.length ? 1 : 0, sortBy: 'itPriority', sortOrder: 'desc', ...meta },
})

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response

let onList: (url: string) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  onList = () =>
    Promise.resolve(
      response(200, page([row(41), row(38, { itPriority: 'MEDIUM', status: 'NEW', assignee: null, requesterResolvedFlagged: true })])),
    )
  fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(response(200, staffUser))
    if (COUNT_URLS.has(url)) {
      const totals = [24, 6, 3]
      return Promise.resolve(response(200, page([], { totalItems: totals[[...COUNT_URLS].indexOf(url)] })))
    }
    if (url.startsWith('/api/staff/tickets')) return onList(url)
    if (url === '/api/categories') return Promise.resolve(response(200, [{ id: 2, name: 'Network' }]))
    if (url === '/api/related-systems') return Promise.resolve(response(200, [{ id: 3, name: 'VPN' }]))
    if (url === '/api/staff/assignees') return Promise.resolve(response(200, [{ id: 9, fullName: 'Bee Somchai', role: 'IT_STAFF' }]))
    return Promise.resolve(response(200, []))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{`${pathname}${search}`}</output>
}

const renderAt = (path = '/staff/tickets') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )

const listCalls = () =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/staff/tickets') && !COUNT_URLS.has(url))
const lastListParams = () => new URLSearchParams(listCalls().at(-1)!.split('?')[1] ?? '')

describe('UI-18 the Queue table (ui-spec §7.1)', () => {
  it('renders exactly the eight documented columns', async () => {
    renderAt()
    const table = await screen.findByRole('table')

    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.replace(/[▲▼]/g, '').trim())).toEqual([
      'Ticket Number',
      'Created',
      'Summary',
      'Category',
      'IT Priority',
      'Status',
      'Owner',
      'Updated',
    ])
    // Requested Priority, Related System, and the requester's email are deliberately not columns.
    expect(within(table).queryByText(/Requested:/)).not.toBeInTheDocument()
    expect(within(table).queryByText('VPN')).not.toBeInTheDocument()
  })

  it('renders the IT Priority, status, owner, and resolution flag as documented', async () => {
    renderAt()
    const table = await screen.findByRole('table')

    const first = within(table).getByRole('link', { name: 'TKT-2026-000041' }).closest('tr')!
    expect(within(first).getByText('IT: URGENT')).toHaveClass('zen-badge')
    expect(within(first).getByText('In Progress')).toHaveClass('zen-badge')
    expect(within(first).getByText('Ada Chaiyawat')).toBeInTheDocument()

    const second = within(table).getByRole('link', { name: 'TKT-2026-000038' }).closest('tr')!
    expect(within(second).getByText('Unassigned')).toBeInTheDocument()
    // The flag is a full-width sub-row under its own Ticket, not a ninth column.
    const flagRow = second.nextElementSibling as HTMLTableRowElement
    expect(within(flagRow).getByText('Requester says resolved')).toBeInTheDocument()
    expect(flagRow.querySelector('td')).toHaveAttribute('colspan', '8')
  })

  it('shows the three plain counts under the heading', async () => {
    renderAt()

    expect(await screen.findByText('24 open · 6 unassigned · 3 waiting for requester')).toBeInTheDocument()
  })

  it('opens staff Ticket Detail from a row click', async () => {
    renderAt()
    const table = await screen.findByRole('table')

    await userEvent.click(within(table).getByText('Queue ticket 41'))

    expect(screen.getByTestId('location')).toHaveTextContent('/staff/tickets/41')
  })
})

describe('UI-19 empty versus no results (AC-35, exit criterion)', () => {
  it('shows the empty message with Refresh and no Clear filters when no Tickets exist at all', async () => {
    onList = () => Promise.resolve(response(200, page([])))
    renderAt()

    expect(await screen.findByRole('heading', { name: 'No tickets have been created yet.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    expect(screen.queryByText('No tickets match these filters.')).not.toBeInTheDocument()
  })

  it('shows a different message with Clear filters as the primary action when filters match nothing', async () => {
    onList = (url) => Promise.resolve(response(200, url.includes('search=') ? page([]) : page([row(41)])))
    renderAt('/staff/tickets?search=kingfisher&itPriority=LOW')

    const heading = await screen.findByRole('heading', { name: 'No tickets match these filters.' })
    expect(screen.queryByText('No tickets have been created yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()

    const clear = within(heading.closest('.zen-empty') as HTMLElement).getByRole('button', { name: 'Clear filters' })
    expect(clear).toHaveClass('btn-primary')
    await userEvent.click(clear)

    await waitFor(() => expect(lastListParams().has('search')).toBe(false))
    expect(lastListParams().has('itPriority')).toBe(false)
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('renders a page past the end as no results', async () => {
    onList = () => Promise.resolve(response(200, page([], { page: 9, totalItems: 25, totalPages: 2 })))
    renderAt('/staff/tickets?page=9')

    expect(await screen.findByRole('heading', { name: 'No tickets match these filters.' })).toBeInTheDocument()
  })
})

describe('UI-20 changing the query returns to page 1 (BR-62, ui-spec §7.4)', () => {
  it.each([
    ['the search term', async (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByLabelText('Search'), 'vpn')],
    ['the IT Priority filter', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('IT Priority'), 'HIGH')],
    ['the Owner filter', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('Owner'), 'unassigned')],
    ['the page size', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByLabelText('Per page'), '50')],
  ])('re-issues the request with page=1 after changing %s on page 2', async (_label, change) => {
    onList = () => Promise.resolve(response(200, page([row(41)], { page: 2, totalItems: 25, totalPages: 2 })))
    renderAt('/staff/tickets?page=2')
    await screen.findByRole('table')
    expect(lastListParams().get('page')).toBe('2')
    const user = userEvent.setup()

    await change(user)

    await waitFor(() => expect(lastListParams().get('page')).toBe('1'), { timeout: 2000 })
  })

  it('applies the Open work preset as a repeated status filter, also on page 1', async () => {
    renderAt('/staff/tickets?page=2')
    await screen.findByRole('table')
    const user = userEvent.setup()

    await user.click(screen.getByText(/^Status/, { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: 'Open work' }))

    await waitFor(() =>
      expect(lastListParams().getAll('status')).toEqual(['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']),
    )
    expect(lastListParams().get('page')).toBe('1')
    expect(screen.getByRole('checkbox', { name: 'Closed' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Reopened' })).toBeChecked()
  })
})

describe('UI-21 the API answers 403 (AC-17, AC-21)', () => {
  it('renders the shared forbidden state naming the role and none of the Queue', async () => {
    onList = () => Promise.resolve(response(403, { error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } }))
    renderAt()

    expect(await screen.findByRole('heading', { name: 'You do not have access to this page.' })).toBeInTheDocument()
    expect(screen.getByText(/IT Staff role/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })
})

describe('UI-22 sortable column headers (AC-29, AC-67, ui-spec §11)', () => {
  it('exposes the default IT Priority descending sort through aria-sort', async () => {
    renderAt()
    const table = await screen.findByRole('table')

    const itPriority = within(table).getByRole('columnheader', { name: /IT Priority/ })
    expect(itPriority).toHaveAttribute('aria-sort', 'descending')
    expect(within(table).getByRole('columnheader', { name: /Ticket Number/ })).toHaveAttribute('aria-sort', 'none')
    // Summary, Category, and Owner are not sortable, so they carry no button and no aria-sort.
    expect(within(within(table).getByRole('columnheader', { name: 'Summary' })).queryByRole('button')).toBeNull()
  })

  it('is a button that toggles ascending and descending and re-sorts on the server', async () => {
    renderAt()
    const table = await screen.findByRole('table')
    const user = userEvent.setup()
    const header = () => within(screen.getByRole('table')).getByRole('columnheader', { name: /Ticket Number/ })

    await user.click(within(header()).getByRole('button', { name: /Ticket Number/ }))
    await waitFor(() => expect(header()).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastListParams().get('sortBy')).toBe('ticketNumber')
    expect(lastListParams().get('sortOrder')).toBe('asc')

    await user.click(within(header()).getByRole('button', { name: /Ticket Number/ }))
    await waitFor(() => expect(header()).toHaveAttribute('aria-sort', 'descending'))
    expect(lastListParams().get('sortOrder')).toBe('desc')
    expect(within(table).getByRole('columnheader', { name: /IT Priority/ })).toHaveAttribute('aria-sort', 'none')
  })
})

describe('Queue states (ui-spec §7.5, FR-22)', () => {
  it('shows skeletons while the first page loads, with the filters already usable', async () => {
    onList = () => new Promise(() => undefined)
    renderAt()

    expect(await screen.findByText('Loading the ticket queue…')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeEnabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a failure with Try again and never a stale list', async () => {
    let fail = false
    onList = () => (fail ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(response(200, page([row(41)]))))
    renderAt()
    await screen.findByRole('table')
    const user = userEvent.setup()

    fail = true
    await user.selectOptions(screen.getByLabelText('IT Priority'), 'LOW')

    expect(await screen.findByText('Unable to load the ticket queue.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('keeps the previous page visible and busy while the next page loads', async () => {
    let release: (value: Response) => void = () => undefined
    onList = (url) =>
      url.includes('page=2')
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve(response(200, page([row(41)], { totalItems: 25, totalPages: 2 })))
    renderAt()
    await screen.findByRole('table')

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    const busy = await waitFor(() => {
      const region = screen.getByRole('table').closest('[aria-busy="true"]')
      expect(region).not.toBeNull()
      return region
    })
    // The previous page stays on screen inside the busy region (table and mobile cards both carry it).
    expect(busy).toContainElement(within(screen.getByRole('table')).getByText('Queue ticket 41'))
    release(response(200, page([row(99)], { page: 2, totalItems: 25, totalPages: 2 })))
    expect(await within(screen.getByRole('table')).findByText('Queue ticket 99')).toBeInTheDocument()
  })

  it('resets a rejected parameter and names it in a warning (BR-63)', async () => {
    onList = (url) =>
      Promise.resolve(
        url.includes('pageSize=999')
          ? response(400, { error: { code: 'INVALID_QUERY_PARAMETER', message: 'pageSize must be one of 10, 20, 50.' } })
          : response(200, page([row(41)])),
      )
    renderAt('/staff/tickets?pageSize=999')

    expect(await screen.findByRole('alert')).toHaveTextContent(/pageSize/)
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('pageSize=999'))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('offers More filters and a Clear filters action only while a filter is active', async () => {
    renderAt()
    await screen.findByRole('table')
    const user = userEvent.setup()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    await user.click(screen.getByText('More filters', { selector: 'summary' }))
    await user.click(screen.getByRole('checkbox', { name: 'Requester says resolved' }))

    await waitFor(() => expect(lastListParams().get('flaggedResolved')).toBe('true'))
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(lastListParams().has('flaggedResolved')).toBe(false))
  })

  it('lists active staff in the Owner filter after Any, Unassigned, and Assigned to me', async () => {
    renderAt()
    await screen.findByRole('table')

    await waitFor(() => expect(within(screen.getByLabelText('Owner')).getAllByRole('option')).toHaveLength(4))
    const options = within(screen.getByLabelText('Owner')).getAllByRole('option').map((option) => option.textContent)
    expect(options.slice(0, 3)).toEqual(['Any', 'Unassigned', 'Assigned to me'])
    expect(screen.getByRole('option', { name: 'Bee Somchai' })).toHaveValue('9')
  })
})
