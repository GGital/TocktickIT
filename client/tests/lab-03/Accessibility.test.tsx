import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import ForbiddenState from '../../src/components/ForbiddenState'

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response

afterEach(() => vi.unstubAllGlobals())

const renderForbidden = (role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
  render(
    <MemoryRouter>
      <ForbiddenState role={role} />
    </MemoryRouter>,
  )

describe('UI-35 the shared forbidden state (AC-21, ui-spec §2.5)', () => {
  it.each([
    ['REQUESTER', 'Requester', '/tickets'],
    ['IT_STAFF', 'IT Staff', '/staff/tickets'],
    ['ADMINISTRATOR', 'Administrator', '/staff/tickets'],
  ] as const)('for a %s: one heading, the role named, and one action back home', (role, label, home) => {
    const { container } = renderForbidden(role)

    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('You do not have access to this page.')
    expect(screen.getByText(`Your account has the ${label} role, which cannot open this screen.`)).toBeInTheDocument()

    const actions = [...screen.queryAllByRole('link'), ...screen.queryAllByRole('button')]
    expect(actions).toHaveLength(1)
    expect(actions[0]).toHaveAttribute('href', home)
    expect(actions[0]).toHaveClass('btn', 'btn-primary')

    // States the fact without naming anything protected: no identifier, title, or count (BR-24).
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('is announced and looks different from the Lab 2 not-found state', () => {
    const { container } = renderForbidden('REQUESTER')

    const callout = screen.getByRole('alert')
    expect(callout).toHaveClass('zen-callout-warning')
    expect(within(callout).getByRole('heading')).toBeInTheDocument()
    expect(container.querySelector('.zen-empty')).toBeNull()
  })
})

describe('UI-36 announcements and real links (AC-67, ui-spec §11)', () => {
  it('announces a login failure through role="alert"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url === '/api/auth/me'
            ? response(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } })
            : response(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect, or the account is not active.' } }),
        ),
      ),
    )
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/^Email address/), 'ada@toktickit.test')
    await user.type(screen.getByLabelText(/^Password/), 'fixture-password-1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect, or the account is not active.')
  })

  it('exposes each Queue Ticket Number as a real link inside a table row, not a clickable div', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(response(200, { id: 7, fullName: 'Ada Chaiyawat', email: 'ada@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }))
        }
        if (url.startsWith('/api/staff/tickets')) {
          return Promise.resolve(
            response(200, {
              data: [
                {
                  id: 41,
                  ticketNumber: 'TKT-2026-000041',
                  summary: 'VPN disconnects every few minutes',
                  category: { id: 2, name: 'Network' },
                  relatedSystem: { id: 3, name: 'VPN' },
                  requester: { id: 12, fullName: 'Nara Sukjai' },
                  assignee: null,
                  requestedPriority: 'HIGH',
                  itPriority: 'URGENT',
                  status: 'NEW',
                  requesterResolvedFlagged: false,
                  createdAt: '2026-09-04T02:20:00.000Z',
                  updatedAt: '2026-09-09T08:02:31.000Z',
                },
              ],
              meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, sortBy: 'itPriority', sortOrder: 'desc' },
            }),
          )
        }
        return Promise.resolve(response(200, []))
      }),
    )
    render(
      <MemoryRouter initialEntries={['/staff/tickets']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const table = await screen.findByRole('table')
    const link = within(table).getByRole('link', { name: 'TKT-2026-000041' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/staff/tickets/41')
    expect(link.closest('tr')).not.toBeNull()
    expect(table.querySelector('div[onclick], div[role="button"]')).toBeNull()

    // The mobile cards are links too, never click-only containers.
    const cardLink = screen.getAllByRole('link', { name: /TKT-2026-000041/ }).find((candidate) => !table.contains(candidate))
    expect(cardLink).toHaveAttribute('href', '/staff/tickets/41')
  })
})

// --- AC-67 beyond Login: the visual pass (ui-spec §13) found no keyboard or aria-required proof for these forms. ---

/** Tabs forward until `matches` holds, so the assertion is about reachability rather than a fixed tab count. */
async function tabUntil(user: ReturnType<typeof userEvent.setup>, matches: () => boolean, limit = 40) {
  for (let step = 0; step < limit && !matches(); step += 1) await user.tab()
  return matches()
}

const staffUser = { id: 7, fullName: 'Ada Chaiyawat', email: 'ada@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }
const emptyQueue = { data: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, sortBy: 'itPriority', sortOrder: 'desc' } }

describe('UI-36 keyboard operation and required fields on the Lab 3 forms (AC-67, ui-spec §2.2, §11)', () => {
  it('operates mandatory Change Password from the keyboard alone and marks every field aria-required', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(response(200, { ...staffUser, role: 'REQUESTER', mustChangePassword: true }))
      if (url === '/api/auth/change-password') return Promise.resolve(response(200, { ...staffUser, role: 'REQUESTER', mustChangePassword: false }))
      return Promise.resolve(response(200, { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    const current = await screen.findByLabelText(/^Current password/)
    const next = screen.getByLabelText(/^New password/)
    const confirm = screen.getByLabelText(/^Confirm new password/)
    for (const field of [current, next, confirm]) expect(field).toHaveAttribute('aria-required', 'true')

    for (const [field, value] of [[current, 'fixture-issued-1'], [next, 'fixture-chosen-1'], [confirm, 'fixture-chosen-1']] as const) {
      expect(await tabUntil(user, () => document.activeElement === field)).toBe(true)
      await user.keyboard(value)
    }
    // Every reveal toggle and the submit button are in the tab order too.
    expect(await tabUntil(user, () => document.activeElement === screen.getByRole('button', { name: 'Save new password' }))).toBe(true)
    await user.keyboard('{Enter}')

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/change-password')).toBe(true))
  })

  it('reaches every Queue filter with Tab', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(response(200, staffUser))
      if (url.startsWith('/api/staff/tickets')) return Promise.resolve(response(200, emptyQueue))
      return Promise.resolve(response(200, []))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter initialEntries={['/staff/tickets']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    const search = await screen.findByLabelText('Search')
    const status = screen.getByText('Status', { selector: 'summary' })
    for (const control of [search, status, screen.getByLabelText('IT Priority'), screen.getByLabelText('Owner'), screen.getByText('More filters', { selector: 'summary' })]) {
      expect(await tabUntil(user, () => document.activeElement === control), control.textContent || control.id).toBe(true)
    }

    // Opening the disclosure with Enter and applying a preset needs a real browser: the AC-67 keyboard test in e2e/lab-03/staff-ticket-flow.spec.ts.
  })

  it('marks the Login fields and every create-user field aria-required', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return Promise.resolve(response(200, { ...staffUser, role: 'ADMINISTRATOR' }))
        return Promise.resolve(response(200, []))
      }),
    )
    const { unmount } = render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Create user' }))
    const dialog = await screen.findByRole('dialog')

    for (const label of [/^Full name/, /^Email address/, /^Initial password/]) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('aria-required', 'true')
    }
    for (const group of [/^Role/, /^Account status/]) {
      expect(within(dialog).getByRole('group', { name: group })).toHaveAttribute('aria-required', 'true')
    }
    unmount()

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }))),
    )
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText(/^Email address/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('aria-required', 'true')
  })
})
