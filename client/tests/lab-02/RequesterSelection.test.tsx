import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const activeRequesters = [
  { id: 1, fullName: 'Anucha Pimwan', email: 'anucha@toktickit.test', department: 'Engineering' },
  { id: 2, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

const renderSelection = () =>
  render(
    <MemoryRouter initialEntries={['/select-requester']}>
      <AppRoutes />
    </MemoryRouter>,
  )

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('UI-01 requester selection renders (AC-01, AC-50)', () => {
  it('lists the requesters returned by the API and states it is not a login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(activeRequesters)),
    )

    renderSelection()

    const select = await screen.findByLabelText(/Development Requester/)
    expect(select).toHaveValue('')

    const options = screen.getAllByRole('option')
    // Placeholder plus one option per active requester — the inactive seeded
    // requester never reaches the client because the API filters it out (BR-47).
    expect(options).toHaveLength(activeRequesters.length + 1)
    expect(options[1]).toHaveTextContent('Anucha Pimwan — Engineering')

    expect(
      screen.getByText(/Lab 2 testing mechanism, not a login screen/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Authentication and role-based access arrive in Lab 3/i)).toBeInTheDocument()
  })

  it('stores the chosen id under the documented key and moves on (BR-10)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        jsonResponse(url.startsWith('/api/tickets') ? { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } } : activeRequesters),
      ),
    )

    renderSelection()

    const select = await screen.findByLabelText(/Development Requester/)
    const submit = screen.getByRole('button', { name: 'Continue' })
    expect(submit).toBeDisabled()

    await userEvent.selectOptions(select, '2')
    await userEvent.click(submit)

    expect(localStorage.getItem(REQUESTER_ID_KEY)).toBe('2')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Tickets' })).toBeInTheDocument())
  })
})

describe('UI-02 requesters fetch fails (AC-05)', () => {
  it('shows an error callout with a retry and stores nothing', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)

    renderSelection()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Unable to load the development requesters/i)
    expect(screen.queryByLabelText(/Development Requester/)).not.toBeInTheDocument()
    expect(localStorage.getItem(REQUESTER_ID_KEY)).toBeNull()

    // Try again re-issues the request rather than only clearing the message.
    fetchMock.mockImplementation(() => jsonResponse(activeRequesters) as never)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByLabelText(/Development Requester/)).toBeInTheDocument()
  })
})

describe('UI-03 no active requesters (AC-06)', () => {
  it('shows the empty state, not the error state, and offers no Continue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse([])),
    )

    renderSelection()

    expect(await screen.findByText(/No active Development Requesters found/i)).toBeInTheDocument()
    expect(screen.getByText(/npx prisma db seed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Development Requester/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Unable to load/i)).not.toBeInTheDocument()
  })
})
