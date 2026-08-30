import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]

export const ticket = {
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'Laptop battery drains within thirty minutes',
  description: 'The battery drops from 100% to 15% in about half an hour.',
  category: { id: 2, name: 'Hardware' },
  relatedSystem: { id: 7, name: 'Corporate Laptop' },
  requester: requesters[0],
  requestedPriority: 'HIGH',
  status: 'NEW',
  createdAt: '2026-08-22T03:11:04.512Z',
  updatedAt: '2026-08-22T03:19:47.980Z',
  attachments: [],
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response

const notFound = () =>
  ({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' } }),
  }) as Response

function stubApi(onDetail: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
    if (/^\/api\/tickets\/\d+$/.test(url)) return onDetail(url)
    return Promise.resolve(ok({}))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(REQUESTER_ID_KEY, '1')
})

afterEach(() => vi.unstubAllGlobals())

describe('UI-20 ticket detail is read-only (AC-43, BR-44)', () => {
  it('shows all nine ticket fields', async () => {
    stubApi(() => Promise.resolve(ok(ticket)))
    renderAt('/tickets/41')

    const information = (await screen.findByRole('heading', { name: 'Ticket information' }))
      .closest('section')!

    for (const label of [
      'Ticket Number',
      'Ticket Date',
      'Requester',
      'Category',
      'Related System',
      'Requested Priority',
      'Current Status',
      'Summary',
      'Description',
    ]) {
      expect(within(information).getByText(label)).toBeInTheDocument()
    }

    expect(within(information).getByText('Corporate Laptop')).toBeInTheDocument()
    expect(
      within(information).getByText('Laptop battery drains within thirty minutes'),
    ).toBeInTheDocument()
    expect(within(information).getByText(/Nadia Charoen/)).toBeInTheDocument()
  })

  it('binds no form control to ticket data and offers no status control', async () => {
    stubApi(() => Promise.resolve(ok(ticket)))
    renderAt('/tickets/41')

    const information = (await screen.findByRole('heading', { name: 'Ticket information' }))
      .closest('section')!

    // Ticket data is a definition list, never inputs — not even disabled ones.
    expect(information.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /status|resolve|close|cancel ticket/i })).toBeNull()
  })
})

describe('UI-21 the safe not-found state (AC-44, BR-13)', () => {
  it('shows the identical card for an unknown id and for another requester ticket', async () => {
    stubApi(() => Promise.resolve(notFound()))

    const unknown = renderAt('/tickets/9999')
    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    const unknownCard = screen.getByText('Ticket not found.').closest('.zen-card')!.textContent
    unknown.unmount()

    renderAt('/tickets/41')
    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    const otherRequesterCard = screen.getByText('Ticket not found.').closest('.zen-card')!.textContent

    // Byte-identical wording: the UI cannot hint that the ticket exists for someone else.
    expect(otherRequesterCard).toBe(unknownCard)
    expect(screen.getByRole('link', { name: 'Back to My Tickets' })).toBeInTheDocument()
    expect(screen.queryByText(ticket.summary)).not.toBeInTheDocument()
  })
})
