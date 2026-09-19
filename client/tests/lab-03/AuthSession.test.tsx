import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { ApiError, apiFetch } from '../../src/lib/apiClient'
import { isAuthMe, signedInRequester } from '../helpers/auth'

/**
 * Authenticated equivalents of the Lab 2 selector tests (BR-58): UI-01 – UI-03 (selection screen), UI-04 and
 * UI-06 (RequesterGuard), UI-05's header and Change Requester cases (AppShell), and UI-19 (switching requester).
 * The selector, its storage key, and its header are gone (BR-57); identity is the session read from
 * GET /api/auth/me (A-18).
 */

const emptyPage = { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response

const unauthenticated = () =>
  response(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } })

let me: () => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  me = () => Promise.resolve(response(200, signedInRequester))
  fetchMock = vi.fn((url: string) => {
    if (isAuthMe(url)) return me()
    if (url.startsWith('/api/tickets')) return Promise.resolve(response(200, emptyPage))
    return Promise.resolve(response(200, []))
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

describe('session restore on start-up (FR-03, A-18)', () => {
  it('reads the user from GET /api/auth/me and shows them in the shell', async () => {
    renderAt('/tickets')

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(screen.getByText('Nadia Charoen')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => isAuthMe(String(url)))).toBe(true)
  })

  it.each(['/tickets', '/tickets/new', '/tickets/1', '/system-check'])(
    'sends a visitor with no session from %s to /login',
    async (path) => {
      me = () => Promise.resolve(unauthenticated())
      renderAt(path)

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'My Tickets' })).not.toBeInTheDocument()
      expect(screen.queryByText('Nadia Charoen')).not.toBeInTheDocument()
    },
  )

  it('does not mistake a failed start-up request for a signed-out user, and retries', async () => {
    me = () => Promise.reject(new TypeError('Failed to fetch'))
    renderAt('/tickets')

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not check your session/i)
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()

    me = () => Promise.resolve(response(200, signedInRequester))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})

describe('apiClient on a 401 (FR-05, AC-06)', () => {
  it('redirects to /login mid-session and leaves none of the previous data on screen', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (isAuthMe(url)) return me()
      if (url.startsWith('/api/tickets')) {
        return Promise.resolve(
          response(200, {
            data: [
              {
                id: 41,
                ticketNumber: 'TKT-2026-000041',
                summary: 'Laptop battery drains',
                category: { id: 2, name: 'Hardware' },
                relatedSystem: { id: 7, name: 'Corporate Laptop' },
                requestedPriority: 'HIGH',
                status: 'NEW',
                attachmentCount: 0,
                createdAt: '2026-08-22T03:11:04.512Z',
                updatedAt: '2026-08-22T03:19:47.980Z',
              },
            ],
            meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          }),
        )
      }
      return Promise.resolve(response(200, []))
    })
    renderAt('/tickets')
    expect((await screen.findAllByText('Laptop battery drains')).length).toBeGreaterThan(0)

    // The session is revoked server-side; the next call from anywhere answers 401.
    fetchMock.mockImplementation(() => Promise.resolve(unauthenticated()))
    await act(() => expect(apiFetch('/tickets')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Laptop battery drains')).not.toBeInTheDocument()
    expect(screen.queryByText('Nadia Charoen')).not.toBeInTheDocument()
  })

  it('still hands a failed login its own error rather than treating it as a lost session', async () => {
    renderAt('/tickets')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()

    fetchMock.mockImplementation(() =>
      Promise.resolve(response(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } })),
    )
    await act(() => expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError))

    expect(screen.getByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})

describe('the Development Requester selector is gone (AC-26, BR-57)', () => {
  it('sends the session cookie and never an X-Requester-Id header', async () => {
    renderAt('/tickets')
    await screen.findByRole('heading', { name: 'My Tickets' })

    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit | undefined)?.credentials).toBe('same-origin')
      expect(new Headers((init as RequestInit | undefined)?.headers).has('X-Requester-Id')).toBe(false)
    }
  })

  it('has no selection route, no Change Requester control, and writes nothing to storage', async () => {
    renderAt('/select-requester')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Select a Development Requester' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change Requester' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Testing as/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/requesters'))).toBe(false)

    await waitFor(() => expect(localStorage.length).toBe(0))
  })
})
