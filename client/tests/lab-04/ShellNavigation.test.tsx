import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { requesterDashboard, staffDashboard } from '../helpers/dashboard'
import { requesterUser, response, staffUser } from '../helpers/actions'

const adminUser = { id: 3, fullName: 'Chai Admin', email: 'chai@toktickit.test', role: 'ADMINISTRATOR', mustChangePassword: false }
const users = { REQUESTER: requesterUser, IT_STAFF: staffUser, ADMINISTRATOR: adminUser } as const
type Role = keyof typeof users

const page = (data: unknown[] = []) => ({ data, meta: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1, sortBy: 'itPriority', sortOrder: 'desc' } })
const queueRow = {
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'Corporate VPN' },
  requester: { id: 1, fullName: 'Nadia Charoen' },
  assignee: null,
  requestedPriority: 'HIGH',
  itPriority: 'URGENT',
  status: 'OPEN',
  requesterResolvedFlagged: false,
  outstandingFollowUps: 2,
  createdAt: '2026-10-19T02:00:00.000Z',
  updatedAt: '2026-10-19T02:00:00.000Z',
}

const myTicket = {
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'Corporate VPN' },
  requestedPriority: 'HIGH',
  status: 'OPEN',
  attachmentCount: 0,
  createdAt: '2026-10-19T02:00:00.000Z',
  updatedAt: '2026-10-19T02:00:00.000Z',
}

let me: Record<string, unknown>
let requested: string[]

beforeEach(() => {
  me = requesterUser
  requested = []
  // Answers by path, whatever the query string, and records every URL so the drill-down requests can be checked.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      requested.push(url)
      const path = url.split('?')[0]
      const body: Record<string, unknown> = {
        '/api/auth/me': me,
        '/api/dashboard/requester': requesterDashboard(),
        '/api/staff/dashboard': staffDashboard({ admin: me.role === 'ADMINISTRATOR' }),
        // One Ticket: an account with none hides the filters behind the empty state (Lab 2 BR-42).
        '/api/tickets': page([myTicket]),
        '/api/staff/tickets': page([queueRow]),
        '/api/admin/users': [],
      }
      return Promise.resolve(response(200, path in body ? body[path] : []))
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (entry: string | { pathname: string; search?: string; state?: unknown }) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppRoutes />
    </MemoryRouter>,
  )

const nav = () => screen.findByRole('navigation', { name: 'Main' })
const linkNames = (element: HTMLElement) => within(element).getAllByRole('link').map((link) => link.textContent)

describe('UI-28 the shell per role (AC-44, FR-24, BR-79)', () => {
  it.each([
    ['REQUESTER', '/dashboard', ['Dashboard', 'My Tickets', 'Create Ticket']],
    ['IT_STAFF', '/staff/dashboard', ['Dashboard', 'Ticket Queue']],
    ['ADMINISTRATOR', '/staff/dashboard', ['Dashboard', 'Ticket Queue', 'User Management']],
  ] as [Role, string, string[]][])('%s lands on %s with Dashboard first and exactly its destinations', async (role, home, links) => {
    me = users[role]
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    const main = await nav()
    expect(linkNames(main)).toEqual(links)
    expect(within(main).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', home)
    expect(within(main).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'TokTickIT' })).toHaveAttribute('href', home)
  })
})

describe('UI-29 detail routes highlight their parent (FR-25)', () => {
  it.each([
    ['REQUESTER', '/tickets/41', 'My Tickets'],
    ['REQUESTER', '/tickets', 'My Tickets'],
    ['REQUESTER', '/tickets/new', 'Create Ticket'],
    ['IT_STAFF', '/staff/tickets/41', 'Ticket Queue'],
    ['ADMINISTRATOR', '/admin/users', 'User Management'],
  ] as [Role, string, string][])('%s on %s marks %s, and only it, as the current page', async (role, path, current) => {
    me = users[role]
    renderAt(path)

    const main = await nav()
    const marked = within(main)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent)
    expect(marked).toEqual([current])
  })
})

describe('UI-30 drill-down destinations open with their filters applied and visible (AC-37, FR-23)', () => {
  it('My Tickets: repeated status params become pressed chips, the request carries them, and Clear filters resets', async () => {
    renderAt({ pathname: '/tickets', search: '?status=NEW&status=OPEN', state: { showing: 'Open tickets' } })
    const user = userEvent.setup()

    const chips = within(await screen.findByRole('group', { name: 'Current Status' })).getAllByRole('button')
    expect(chips).toHaveLength(8)
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => chip.textContent)).toEqual(['New', 'Open'])
    await waitFor(() => expect(requested).toContain('/api/tickets?status=NEW&status=OPEN'))

    const showing = screen.getByText('Showing: Open tickets').closest('.zen-callout') as HTMLElement
    await user.click(within(showing).getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(chips.every((chip) => chip.getAttribute('aria-pressed') === 'false')).toBe(true))
    expect(screen.queryByText('Showing: Open tickets')).not.toBeInTheDocument()
  })

  it('My Tickets: pressing a chip adds that status to the URL request', async () => {
    renderAt('/tickets')
    const user = userEvent.setup()

    await user.click(within(await screen.findByRole('group', { name: 'Current Status' })).getByRole('button', { name: 'Resolved' }))
    await waitFor(() => expect(requested.some((url) => url.startsWith('/api/tickets?') && url.includes('status=RESOLVED'))).toBe(true))
  })

  it('Queue: followUp opens with the Follow-ups select set, and rows show the follow-up badge', async () => {
    me = staffUser
    renderAt({ pathname: '/staff/tickets', search: '?followUp=mine', state: { showing: 'My follow-ups' } })

    expect(await screen.findByRole('combobox', { name: 'Follow-ups' })).toHaveValue('mine')
    expect(within(screen.getByRole('combobox', { name: 'Follow-ups' })).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any',
      'Outstanding',
      'Mine outstanding',
    ])
    await waitFor(() => expect(requested).toContain('/api/staff/tickets?followUp=mine'))
    expect(screen.getByText('Showing: My follow-ups')).toBeInTheDocument()
    expect((await screen.findAllByText('2 follow-ups')).length).toBeGreaterThan(0)
  })

  it('User Management: ?role= sets the role filter and the request', async () => {
    me = adminUser
    renderAt({ pathname: '/admin/users', search: '?role=IT_STAFF', state: { showing: 'Active IT Staff' } })

    expect(await screen.findByRole('combobox', { name: 'Role' })).toHaveValue('IT_STAFF')
    await waitFor(() => expect(requested).toContain('/api/admin/users?role=IT_STAFF'))
    expect(screen.getByText('Showing: Active IT Staff')).toBeInTheDocument()
  })

  it('a dashboard card opens its list with the card named in the Showing line', async () => {
    me = staffUser
    renderAt('/staff/dashboard')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'Unassigned tickets: 3. View list' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ticket Queue' })).toBeInTheDocument()
    expect(screen.getByText('Showing: Unassigned tickets')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Owner' })).toHaveValue('unassigned')
  })

  it('the Showing line can be dismissed and is absent without a dashboard origin', async () => {
    me = staffUser
    renderAt({ pathname: '/staff/tickets', search: '?followUp=mine', state: { showing: 'My follow-ups' } })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Showing: My follow-ups')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Follow-ups' })).toHaveValue('mine')
  })
})
