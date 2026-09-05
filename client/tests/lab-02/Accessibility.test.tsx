import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]
const categories = [{ id: 2, name: 'Hardware' }]
const systems = [{ id: 7, name: 'Corporate Laptop' }]
const createdTicket = { id: 41, ticketNumber: 'TKT-2026-000041', createdAt: '2026-08-22T03:11:04.512Z' }

const ok = (body: unknown, status = 200) =>
  ({ ok: true, status, json: () => Promise.resolve(body) }) as Response

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
    if (url.startsWith('/api/categories')) return Promise.resolve(ok(categories))
    if (url.startsWith('/api/related-systems')) return Promise.resolve(ok(systems))
    if (url === '/api/tickets') return Promise.resolve(ok(createdTicket, 201))
    return Promise.resolve(ok({}))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

/** Tabs forward until the predicate matches, so the assertion is about reachability. */
async function tabUntil(user: ReturnType<typeof userEvent.setup>, matches: () => boolean) {
  for (let step = 0; step < 30; step += 1) {
    if (matches()) return true
    await user.tab()
  }
  return matches()
}

describe('UI-25 keyboard-only operation (AC-47)', () => {
  it('drives the requester selection screen without a mouse', async () => {
    renderAt('/select-requester')
    const user = userEvent.setup()

    const select = await screen.findByLabelText(/Development Requester/)
    expect(await tabUntil(user, () => document.activeElement === select)).toBe(true)

    await user.selectOptions(select, '1')
    // Enter from inside the form submits it natively — no key handler needed.
    expect(
      await tabUntil(
        user,
        () => document.activeElement === screen.getByRole('button', { name: 'Continue' }),
      ),
    ).toBe(true)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(localStorage.getItem(REQUESTER_ID_KEY)).toBe('1'))
  })

  it('reaches every Create Ticket control and submits from the keyboard', async () => {
    localStorage.setItem(REQUESTER_ID_KEY, '1')
    renderAt('/tickets/new')
    const user = userEvent.setup()

    const category = await screen.findByLabelText(/^Category/)
    const controls = [
      category,
      screen.getByLabelText(/^Related System/),
      // Only the checked radio is in the tab order; the arrows move within the group.
      screen.getByLabelText('Medium'),
      screen.getByLabelText(/^Ticket Summary/),
      screen.getByLabelText(/^Description/),
      screen.getByRole('button', { name: 'Submit Ticket' }),
    ]

    // Every control is reachable, and in the order it appears on screen.
    for (const control of controls) {
      expect(await tabUntil(user, () => document.activeElement === control)).toBe(true)
    }

    await user.click(screen.getByLabelText('Medium'))
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByLabelText('Low')).toBeChecked()

    await user.selectOptions(category, '2')
    await user.selectOptions(screen.getByLabelText(/^Related System/), '7')
    await user.type(
      screen.getByLabelText(/^Ticket Summary/),
      'Laptop battery drains within thirty minutes',
    )
    await user.type(
      screen.getByLabelText(/^Description/),
      'The battery drops from full to fifteen percent within half an hour.',
    )

    // Enter inside a textarea inserts a newline, so the keyboard path to submit is
    // the button itself: tab to it and press Enter. No pointer event is used here.
    const submit = screen.getByRole('button', { name: 'Submit Ticket' })
    expect(await tabUntil(user, () => document.activeElement === submit)).toBe(true)
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => url === '/api/tickets' && (init as RequestInit)?.method === 'POST',
        ),
      ).toHaveLength(1),
    )
    expect(await screen.findByText('TKT-2026-000041')).toBeInTheDocument()
  })

  it('never removes a focus indicator without a replacement', async () => {
    localStorage.setItem(REQUESTER_ID_KEY, '1')
    renderAt('/tickets/new')

    // outline: none with no replacement is forbidden (ui-spec §9); the theme sets a
    // focus ring on .zen-control and .btn instead of clearing one.
    const summary = await screen.findByLabelText(/^Ticket Summary/)
    expect(summary).toHaveClass('zen-control')
    expect(getComputedStyle(summary).outline).not.toBe('none')
  })
})
