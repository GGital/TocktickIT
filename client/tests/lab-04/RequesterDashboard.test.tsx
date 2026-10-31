import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ACTIVE_QUERY, requesterDashboard } from '../helpers/dashboard'
import { apiError, renderAt, requesterUser, response, staffUser, stubApi, type Handler } from '../helpers/actions'

let me: Record<string, unknown>
let handlers: Record<string, Handler>

beforeEach(() => {
  me = requesterUser
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    'GET /api/dashboard/requester': () => response(200, requesterDashboard()),
  }
  stubApi(handlers)
})

afterEach(() => vi.unstubAllGlobals())

const cards = async () => within(await screen.findByRole('region', { name: 'At a glance' })).getAllByRole('link')

describe('UI-06 the Requester dashboard renders the API metrics (FR-18, ui-spec §4.1)', () => {
  it('shows three cards in attention order, each one link to its href', async () => {
    renderAt('/dashboard')

    const links = await cards()
    expect(links.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')])).toEqual([
      ['Waiting for you: 1. View list', '/tickets?status=WAITING_FOR_REQUESTER'],
      ['Open tickets: 3. View list', `/tickets?${ACTIVE_QUERY}`],
      ['Resolved — please check: 1. View list', '/tickets?status=RESOLVED'],
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create ticket' })).toHaveAttribute('href', '/tickets/new')
  })

  it('shows both lists with rows linking to the Ticket and a View all link', async () => {
    renderAt('/dashboard')

    const updated = await screen.findByRole('region', { name: 'Recently updated' })
    expect(within(updated).getByRole('link', { name: 'TKT-2026-000041' })).toHaveAttribute('href', '/tickets/41')
    expect(within(updated).getByText('Waiting for Requester')).toBeInTheDocument()
    expect(within(updated).getByRole('link', { name: /View all/ })).toHaveAttribute('href', '/tickets?sortBy=updatedAt&sortOrder=desc')

    const resolved = screen.getByRole('region', { name: 'Recently resolved (2, last 7 days)' })
    expect(within(resolved).getAllByRole('listitem')).toHaveLength(2)
    expect(within(resolved).getByRole('link', { name: /View all/ })).toHaveAttribute(
      'href',
      '/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc',
    )
    // Summary fields only: the API sends no description, and the client adds nothing (BR-52).
    expect(within(updated).getByText('Requester ticket 41')).toBeInTheDocument()
  })
})

describe('UI-07 an account with no Tickets (AC-31)', () => {
  it('shows the welcome empty state with Create ticket, and every card at 0', async () => {
    handlers['GET /api/dashboard/requester'] = () => response(200, requesterDashboard({ zero: true }))
    renderAt('/dashboard')

    const links = await cards()
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Waiting for you: 0. View list',
      'Open tickets: 0. View list',
      'Resolved — please check: 0. View list',
    ])
    const welcome = screen.getByRole('heading', { name: 'You have not raised any tickets yet.' }).closest('.zen-empty') as HTMLElement
    expect(within(welcome).getByRole('link', { name: 'Create ticket' })).toHaveAttribute('href', '/tickets/new')
  })
})

describe('UI-08 a failed load (AC-38)', () => {
  it('shows one error callout with Try again, and recovers', async () => {
    let attempts = 0
    handlers['GET /api/dashboard/requester'] = () => (++attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(200, requesterDashboard()))
    renderAt('/dashboard')
    const user = userEvent.setup()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('We could not load your dashboard.')
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'My Tickets' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await cards()).toHaveLength(3)
  })
})

describe('UI-09 one list empty, the other populated (ui-spec §2.3)', () => {
  it('shows the per-list message instead of a blank card', async () => {
    handlers['GET /api/dashboard/requester'] = () => response(200, requesterDashboard({ resolved: false }))
    renderAt('/dashboard')

    const resolved = await screen.findByRole('region', { name: 'Recently resolved (0, last 7 days)' })
    expect(within(resolved).getByText('No tickets resolved in the last 7 days.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Recently updated' })).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('You have not raised any tickets yet.')).not.toBeInTheDocument()
  })
})

describe('the Requester dashboard is Requester-only (FR-22)', () => {
  it('IT Staff typing /dashboard get the forbidden state', async () => {
    me = staffUser
    renderAt('/dashboard')
    expect(await screen.findByText('You do not have access to this page.')).toBeInTheDocument()
  })
})
