import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Anucha Pimwan', email: 'anucha@toktickit.test', department: 'Engineering' },
  { id: 2, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(REQUESTER_ID_KEY, '2')
  vi.stubGlobal(
    'fetch',
    vi.fn(() => jsonResponse(requesters)),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

describe('UI-05 application shell after selection (AC-03)', () => {
  it('shows the requester as a testing context, never as a signed-in user', async () => {
    renderAt('/tickets')

    // "Testing as" wording is required so nobody reads this as authentication (BR-08, BR-50).
    expect(await screen.findByText(/Testing as:/)).toBeInTheDocument()
    expect(await screen.findByText('Nadia Charoen')).toBeInTheDocument()
    expect(screen.queryByText(/log(ged)? ?in|sign(ed)? ?in|logout/i)).not.toBeInTheDocument()
  })

  it('marks the active navigation item with aria-current', async () => {
    renderAt('/tickets/new')

    expect(await screen.findByRole('link', { name: 'Create Ticket' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'My Tickets' })).not.toHaveAttribute('aria-current')
  })

  it('sends the stored context as X-Requester-Id on every scoped call (BR-10, BR-48)', async () => {
    renderAt('/tickets')
    await screen.findByText('Nadia Charoen')

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(new Headers(init?.headers).get('X-Requester-Id')).toBe('2')
  })

  it('offers Change Requester, which returns to the selection screen', async () => {
    renderAt('/tickets')

    await userEvent.click(await screen.findByRole('button', { name: 'Change Requester' }))

    expect(
      screen.getByRole('heading', { name: 'Select a Development Requester' }),
    ).toBeInTheDocument()
  })
})
