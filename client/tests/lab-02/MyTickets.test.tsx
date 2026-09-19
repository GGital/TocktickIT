import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { isAuthMe, signedInRequester } from '../helpers/auth'

const categories = [{ id: 2, name: 'Hardware' }]
const systems = [{ id: 7, name: 'Corporate Laptop' }]

const ticket = (id: number, summary: string) => ({
  id,
  ticketNumber: `TKT-2026-${String(id).padStart(6, '0')}`,
  summary,
  category: categories[0],
  relatedSystem: systems[0],
  requestedPriority: 'HIGH',
  status: 'NEW',
  attachmentCount: 0,
  createdAt: '2026-08-22T03:11:04.512Z',
  updatedAt: '2026-08-22T03:19:47.980Z',
})

const page = (data: ReturnType<typeof ticket>[], meta: Partial<Record<string, number>> = {}) => ({
  data,
  meta: {
    page: 1,
    pageSize: 10,
    totalItems: data.length,
    totalPages: Math.ceil(data.length / 10),
    ...meta,
  },
})

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response

/** `onList` decides what the ticket-list request returns for a given URL. */
function stubApi(onList: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn((url: string) => {
    if (isAuthMe(url)) return Promise.resolve(ok(signedInRequester))
    if (url.startsWith('/api/categories')) return Promise.resolve(ok(categories))
    if (url.startsWith('/api/related-systems')) return Promise.resolve(ok(systems))
    if (url.startsWith('/api/tickets')) return onList(url)
    return Promise.resolve(ok({}))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const listCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/tickets'))

/** Both the desktop table and the mobile cards are in the DOM; CSS picks one per
 * viewport, so assertions scope to the table rather than matching twice. */
const rowText = async (text: string) => within(await screen.findByRole('table')).findByText(text)
const rowCount = (text: string) => screen.queryAllByText(text).length

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('UI-16 empty and no-results are different states (AC-32, AC-33, BR-42)', () => {
  it('offers Create Ticket when the requester owns nothing, with no filter controls', async () => {
    stubApi(() => Promise.resolve(ok(page([]))))
    renderAt('/tickets')

    expect(await screen.findByText('You have not created any tickets yet.')).toBeInTheDocument()
    expect(screen.queryByText('No tickets match your search.')).not.toBeInTheDocument()
    // Nothing to filter, so the toolbar is not shown at all.
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('offers Clear filters when a search matched nothing, and restores the list', async () => {
    const fetchMock = stubApi((url) =>
      Promise.resolve(ok(url.includes('search=') ? page([]) : page([ticket(41, 'Laptop battery drains')]))),
    )
    renderAt('/tickets?search=nothing-matches')

    expect(await screen.findByText('No tickets match your search.')).toBeInTheDocument()
    expect(screen.queryByText('You have not created any tickets yet.')).not.toBeInTheDocument()
    // The toolbar stays, because there is something to clear.
    expect(screen.getByLabelText('Search')).toBeInTheDocument()

    // The no-results card carries the primary action; the toolbar keeps its own.
    const noResults = screen.getByText('No tickets match your search.').closest('.zen-card')!
    await userEvent.click(within(noResults as HTMLElement).getByRole('button', { name: 'Clear filters' }))

    expect(await rowText('Laptop battery drains')).toBeInTheDocument()
    expect(listCalls(fetchMock).at(-1)).not.toContain('search=')
  })
})

describe('UI-17 changing a filter returns to page 1 (AC-38, BR-41)', () => {
  it('sends page=1 on the next request', async () => {
    const fetchMock = stubApi(() =>
      Promise.resolve(ok(page([ticket(41, 'Laptop battery drains')], { page: 2, totalItems: 12, totalPages: 2 }))),
    )
    renderAt('/tickets?page=2')

    await rowText('Laptop battery drains')
    expect(listCalls(fetchMock)[0]).toContain('page=2')

    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '2')

    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toContain('categoryId=2'))
    const latest = listCalls(fetchMock).at(-1)!
    expect(latest).toContain('page=1')
    expect(latest).not.toContain('page=2')
  })

  it('keeps the page when only the page number changes', async () => {
    const fetchMock = stubApi(() =>
      Promise.resolve(
        ok(page([ticket(41, 'Laptop battery drains')], { page: 1, totalItems: 12, totalPages: 2 })),
      ),
    )
    renderAt('/tickets')

    await rowText('Laptop battery drains')
    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toContain('page=2'))
  })
})

describe('UI-18 the list request fails (AC-40)', () => {
  it('shows a retryable failure and no stale rows', async () => {
    let shouldFail = false
    const fetchMock = stubApi(() =>
      shouldFail
        ? Promise.reject(new Error('backend down'))
        : Promise.resolve(ok(page([ticket(41, 'Laptop battery drains')]))),
    )
    renderAt('/tickets')

    expect(await rowText('Laptop battery drains')).toBeInTheDocument()

    // A later request fails: the rows it would have replaced must not survive as current.
    shouldFail = true
    await userEvent.selectOptions(screen.getByLabelText(/^Category/), '2')

    expect(await screen.findByText('Unable to load your tickets.')).toBeInTheDocument()
    await waitFor(() => expect(rowCount('Laptop battery drains')).toBe(0))

    shouldFail = false
    const before = listCalls(fetchMock).length
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await rowText('Laptop battery drains')).toBeInTheDocument()
    expect(listCalls(fetchMock).length).toBeGreaterThan(before)
  })
})

// UI-19 (switching requester) is replaced by its authenticated equivalent in tests/lab-03/AuthSession.test.tsx:
// a lost session unmounts the list at once, so another user's sign-in always starts clean (BR-58).
