import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
const userWith = (role: Role) => ({
  id: 7,
  fullName: 'Ada Chaiyawat',
  email: 'ada@toktickit.test',
  role,
  mustChangePassword: false,
})

const response = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response

let session: ReturnType<typeof userWith> | null
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') {
      return Promise.resolve(
        session ? response(200, session) : response(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }),
      )
    }
    if (url === '/api/auth/logout') {
      session = null
      return Promise.resolve(response(204))
    }
    if (url.startsWith('/api/tickets')) {
      return Promise.resolve(response(200, { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }))
    }
    return Promise.resolve(response(200, []))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

async function renderAs(role: Role, path: string) {
  session = userWith(role)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )
  return screen.findByRole('navigation', { name: 'Main' })
}

const linkNames = (nav: HTMLElement) => within(nav).queryAllByRole('link').map((link) => link.textContent)

describe('UI-11 Requester navigation (AC-15, FR-11)', () => {
  it('renders My Tickets and Create Ticket only; the staff and admin links are not in the DOM', async () => {
    const nav = await renderAs('REQUESTER', '/tickets')

    expect(linkNames(nav)).toEqual(['My Tickets', 'Create Ticket'])
    // Not disabled, not CSS-hidden: absent (ui-spec §2.2).
    expect(document.querySelector('a[href="/staff/tickets"]')).toBeNull()
    expect(document.querySelector('a[href="/admin/users"]')).toBeNull()
    expect(screen.queryByText('Ticket Queue')).not.toBeInTheDocument()
    expect(screen.queryByText('User Management')).not.toBeInTheDocument()
  })
})

describe('UI-12 IT Staff navigation (AC-15)', () => {
  it('renders Ticket Queue and nothing else', async () => {
    const nav = await renderAs('IT_STAFF', '/staff/tickets')

    expect(linkNames(nav)).toEqual(['Ticket Queue'])
    expect(document.querySelector('a[href="/admin/users"]')).toBeNull()
    expect(document.querySelector('a[href="/tickets/new"]')).toBeNull()
  })
})

describe('UI-13 Administrator navigation (AC-15, A-01)', () => {
  it('renders Ticket Queue and User Management', async () => {
    const nav = await renderAs('ADMINISTRATOR', '/staff/tickets')

    expect(linkNames(nav)).toEqual(['Ticket Queue', 'User Management'])
    expect(document.querySelector('a[href="/tickets/new"]')).toBeNull()
  })
})

describe('UI-14 the identity cluster (FR-11, ui-spec §3)', () => {
  it.each([
    ['REQUESTER', 'Requester', '/tickets'],
    ['IT_STAFF', 'IT Staff', '/staff/tickets'],
    ['ADMINISTRATOR', 'Administrator', '/staff/tickets'],
  ] as const)('shows the name and the %s role badge, and the wordmark goes home', async (role, label, home) => {
    await renderAs(role, home)
    const banner = screen.getByRole('banner')

    expect(within(banner).getByText(/Signed in as/)).toHaveTextContent('Signed in as Ada Chaiyawat')
    expect(within(banner).getByText(label)).toHaveClass('zen-badge')
    expect(within(banner).getByRole('link', { name: 'TokTickIT' })).toHaveAttribute('href', home)
    expect(within(banner).queryByText('ada@toktickit.test')).not.toBeInTheDocument()
  })

  it('keeps Logout and Change Password outside the collapsible mobile menu', async () => {
    const nav = await renderAs('REQUESTER', '/tickets')
    const banner = screen.getByRole('banner')

    const logout = within(banner).getByRole('button', { name: 'Log out' })
    const changePassword = within(banner).getByRole('link', { name: 'Change Password' })
    expect(changePassword).toHaveAttribute('href', '/change-password')

    // The navigation collapses below 768 px; Logout must stay visible without opening it.
    expect(nav.contains(logout)).toBe(false)
    expect(logout.closest('.d-none')).toBeNull()
    expect(screen.queryByText(/Testing as/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change Requester' })).not.toBeInTheDocument()
  })

  it('logs out through the API and returns to /login', async () => {
    await renderAs('IT_STAFF', '/staff/tickets')

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/logout')).toHaveLength(1)
    expect(screen.queryByText('Ada Chaiyawat')).not.toBeInTheDocument()
  })
})

describe('RequireRole renders the forbidden state for a direct URL (AC-21, FR-13)', () => {
  it.each([
    ['REQUESTER', '/staff/tickets'],
    ['REQUESTER', '/staff/tickets/41'],
    ['REQUESTER', '/admin/users'],
    ['IT_STAFF', '/admin/users'],
    ['IT_STAFF', '/tickets/new'],
    ['ADMINISTRATOR', '/tickets/new'],
  ] as const)('a %s at %s sees the forbidden state, not the screen', async (role, path) => {
    await renderAs(role, path)

    expect(await screen.findByRole('heading', { name: 'You do not have access to this page.' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(path)
    expect(screen.queryByRole('heading', { name: /Ticket Queue|User Management|Create Ticket/ })).not.toBeInTheDocument()
  })

  it.each([
    ['IT_STAFF', '/staff/tickets', 'Ticket Queue'],
    ['ADMINISTRATOR', '/staff/tickets', 'Ticket Queue'],
    ['ADMINISTRATOR', '/admin/users', 'User Management'],
    ['REQUESTER', '/tickets/new', 'Create Ticket'],
  ] as const)('a %s at %s reaches the screen', async (role, path, heading) => {
    await renderAs(role, path)

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'You do not have access to this page.' })).not.toBeInTheDocument()
  })
})
