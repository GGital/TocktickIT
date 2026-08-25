import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { apiFetch } from '../../src/lib/apiClient'
import { REQUESTER_ID_KEY, clearRequesterId } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Anucha Pimwan', email: 'anucha@toktickit.test', department: 'Engineering' },
]

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  clearRequesterId()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => jsonResponse(requesters)),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('UI-04 no requester context (AC-02, FR-05)', () => {
  it.each(['/tickets', '/tickets/new', '/tickets/1'])(
    'shows the selection screen instead of %s',
    async (path) => {
      renderAt(path)

      expect(
        await screen.findByRole('heading', { name: 'Select a Development Requester' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'My Tickets' })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Ticket Detail' })).not.toBeInTheDocument()
    },
  )
})

describe('UI-06 backend rejects the stored context (AC-07)', () => {
  it('clears the stored id and returns to the selection screen with a warning', async () => {
    localStorage.setItem(REQUESTER_ID_KEY, '1')
    renderAt('/tickets')

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()

    // Any requester-scoped call answering 403 invalidates the context (BR-11).
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: () =>
            Promise.resolve({
              error: {
                code: 'REQUESTER_CONTEXT_INVALID',
                message: 'The selected requester is no longer available.',
              },
            }),
        } as Response),
      ),
    )

    await expect(apiFetch('/tickets')).rejects.toMatchObject({
      status: 403,
      code: 'REQUESTER_CONTEXT_INVALID',
    })

    expect(localStorage.getItem(REQUESTER_ID_KEY)).toBeNull()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Select a Development Requester' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/no longer available. Choose another/i)).toBeInTheDocument()
  })
})
