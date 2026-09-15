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
