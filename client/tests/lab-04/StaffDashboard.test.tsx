import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ACTIVE_QUERY, staffDashboard } from '../helpers/dashboard'
import { apiError, renderAt, response, staffUser, stubApi, type Handler } from '../helpers/actions'

const adminUser = { id: 3, fullName: 'Chai Admin', email: 'chai@toktickit.test', role: 'ADMINISTRATOR', mustChangePassword: false }

let me: Record<string, unknown>
let handlers: Record<string, Handler>

beforeEach(() => {
  me = staffUser
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    'GET /api/staff/dashboard': () => response(200, staffDashboard()),
  }
  stubApi(handlers)
})

afterEach(() => vi.unstubAllGlobals())

const cards = async () => within(await screen.findByRole('region', { name: 'At a glance' })).getAllByRole('link')

describe('UI-01 the staff dashboard renders the API metrics (AC-37, ui-spec §5.1)', () => {
  it('shows six cards in documented order, each one link named "{label}: {n}. View list" to the API href', async () => {
    renderAt('/staff/dashboard')

    const links = await cards()
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Unassigned tickets: 3. View list',
      'Assigned to me: 5. View list',
      'Urgent and active: 2. View list',
      'Requester says resolved: 1. View list',
      'My follow-ups: 1. View list',
      'New today: 4. View list',
    ])
    const { metrics } = staffDashboard()
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      metrics.unassigned.href,
      metrics.myOpen.href,
      metrics.urgentActive.href,
      metrics.requesterFlagged.href,
      metrics.myOutstandingFollowUps.href,
      metrics.newToday.href,
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText(/Updated 11:00 \(Bangkok\)/)).toBeInTheDocument()
  })

  it('lists every status and every IT priority, zero included, each a link to its list', async () => {
    renderAt('/staff/dashboard')

    const byStatus = within(await screen.findByRole('region', { name: 'By status' })).getAllByRole('link')
    expect(byStatus.map((link) => link.getAttribute('href'))).toEqual(
      ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'].map((s) => `/staff/tickets?status=${s}`),
    )
    expect(byStatus[0]).toHaveTextContent(/^New\s*1$/)

    const byPriority = within(screen.getByRole('region', { name: 'Active by IT priority' })).getAllByRole('link')
    expect(byPriority.map((link) => link.getAttribute('href'))).toEqual(
      ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => `/staff/tickets?itPriority=${p}&${ACTIVE_QUERY}`),
    )
  })

  it('lists recently updated Tickets and my recent actions with links to the Ticket', async () => {
    renderAt('/staff/dashboard')

    const updated = await screen.findByRole('region', { name: 'Recently updated' })
    expect(within(updated).getByRole('link', { name: 'TKT-2026-000041' })).toHaveAttribute('href', '/staff/tickets/41')
    expect(within(updated).getByText('VPN disconnects every few minutes')).toHaveAttribute('title', 'VPN disconnects every few minutes')
    expect(within(updated).getByText(/20 Oct 2026 10:55/)).toBeInTheDocument()
    expect(within(updated).getByRole('link', { name: /View queue/ })).toHaveAttribute('href', '/staff/tickets?sortBy=updatedAt&sortOrder=desc')

    const actions = screen.getByRole('region', { name: 'My recent actions' })
    expect(within(actions).getByRole('link', { name: 'TKT-2026-000041' })).toHaveAttribute('href', '/staff/tickets/41#actions')
    expect(within(actions).getByText('Replaced the VPN client profile and cleared cached…')).toBeInTheDocument()
    expect(within(actions).getByText('Follow-up outstanding')).toBeInTheDocument()
  })
})

describe('UI-02 an all-zero staff response (AC-31, BR-51)', () => {
  it('shows 0 on every card with its link, and the empty actions message', async () => {
    handlers['GET /api/staff/dashboard'] = () => response(200, staffDashboard({ zero: true }))
    renderAt('/staff/dashboard')

    const links = await cards()
    expect(links).toHaveLength(6)
    for (const link of links) expect(link.getAttribute('aria-label')).toMatch(/: 0\. View list$/)
    expect(screen.getByText('You have not recorded any actions yet.')).toBeInTheDocument()
    expect(screen.queryByText('You have not raised any tickets yet.')).not.toBeInTheDocument()
  })
})

describe('UI-03 a failed load, then Try again (AC-38, BR-83)', () => {
  it('shows one error callout, keeps the navigation, and renders data after the retry', async () => {
    let attempts = 0
    handlers['GET /api/staff/dashboard'] = () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(200, staffDashboard()))
    renderAt('/staff/dashboard')
    const user = userEvent.setup()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We could not load the dashboard.')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Ticket Queue' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await cards()).toHaveLength(6)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('UI-04 the Accounts group (AC-35, BR-70)', () => {
  it('renders for an Administrator response with four links', async () => {
    me = adminUser
    handlers['GET /api/staff/dashboard'] = () => response(200, staffDashboard({ admin: true }))
    renderAt('/staff/dashboard')

    const accounts = within(await screen.findByRole('region', { name: 'Accounts' })).getAllByRole('link')
    expect(accounts.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')])).toEqual([
      ['Active Requesters: 5. View list', '/admin/users?role=REQUESTER'],
      ['Active IT Staff: 4. View list', '/admin/users?role=IT_STAFF'],
      ['Active Administrators: 1. View list', '/admin/users?role=ADMINISTRATOR'],
      ['Inactive: 2, must change password: 4. View list', '/admin/users'],
    ])
  })

  it('is absent when the response has no administration block', async () => {
    renderAt('/staff/dashboard')
    await cards()
    expect(screen.queryByRole('region', { name: 'Accounts' })).not.toBeInTheDocument()
  })
})

describe('UI-05 a 403 from the dashboard API (FR-22)', () => {
  it('shows the forbidden state', async () => {
    handlers['GET /api/staff/dashboard'] = () => apiError(403, 'FORBIDDEN')
    renderAt('/staff/dashboard')
    expect(await screen.findByText('You do not have access to this page.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'At a glance' })).not.toBeInTheDocument()
  })

  it('a Requester typing the URL gets the forbidden state and no dashboard request', async () => {
    me = { id: 1, fullName: 'Nadia Charoen', email: 'n@t.test', role: 'REQUESTER', mustChangePassword: false }
    const api = stubApi(handlers)
    renderAt('/staff/dashboard')
    expect(await screen.findByText('You do not have access to this page.')).toBeInTheDocument()
    await waitFor(() => expect(api.calls('GET', '/api/staff/dashboard')).toEqual([]))
  })
})
