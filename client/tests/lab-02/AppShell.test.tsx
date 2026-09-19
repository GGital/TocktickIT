import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { isAuthMe, signedInRequester } from '../helpers/auth'

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (isAuthMe(url)) return jsonResponse(signedInRequester)
      if (url.startsWith('/api/tickets')) {
        return jsonResponse({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } })
      }
      return jsonResponse([])
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

// Lab 2's "Testing as", X-Requester-Id, and Change Requester cases are replaced by their authenticated
// equivalents in tests/lab-03/AuthSession.test.tsx (BR-58).
describe('UI-05 application shell for the signed-in user (AC-03, Lab 3 FR-11)', () => {
  it('shows the authenticated user from the session', async () => {
    renderAt('/tickets')

    expect(await screen.findByText('Nadia Charoen')).toBeInTheDocument()
    expect(screen.queryByText(/Testing as:/)).not.toBeInTheDocument()
  })

  it('marks the active navigation item with aria-current', async () => {
    renderAt('/tickets/new')

    expect(await screen.findByRole('link', { name: 'Create Ticket' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'My Tickets' })).not.toHaveAttribute('aria-current')
  })
})
