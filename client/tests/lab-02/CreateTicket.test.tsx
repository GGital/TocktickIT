import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]
const categories = [
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
]
const systems = [
  { id: 7, name: 'Corporate Laptop' },
  { id: 4, name: 'LEB2 App' },
]

const ok = (body: unknown, status = 200) =>
  ({ ok: true, status, json: () => Promise.resolve(body) }) as Response

const fail = (status: number, code: string, message: string, fields?: unknown) =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve({ error: { code, message, fields } }),
  }) as Response

const createdTicket = {
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  createdAt: '2026-08-22T03:11:04.512Z',
}

/** Reference data and requesters always resolve; `onCreate` decides what POST does. */
function stubApi(onCreate: (url: string) => Promise<Response> = () => Promise.resolve(ok(createdTicket, 201))) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
    if (url.startsWith('/api/categories')) return Promise.resolve(ok(categories))
    if (url.startsWith('/api/related-systems')) return Promise.resolve(ok(systems))
    if (init?.method === 'POST') return onCreate(url)
    return Promise.resolve(ok({}))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const postsTo = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === path && (init as RequestInit | undefined)?.method === 'POST',
  )

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <AppRoutes />
    </MemoryRouter>,
  )

/** Fills every required field with valid values. */
async function fillValidForm(overrides: { summary?: string; description?: string } = {}) {
  const user = userEvent.setup()
  await user.selectOptions(await screen.findByLabelText(/^Category/), '2')
  await user.selectOptions(screen.getByLabelText(/^Related System/), '7')
  await user.type(
    screen.getByLabelText(/^Ticket Summary/),
    overrides.summary ?? 'Laptop battery drains within thirty minutes',
  )
  await user.type(
    screen.getByLabelText(/^Description/),
    overrides.description ?? 'The battery drops from full to fifteen percent within half an hour.',
  )
  return user
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(REQUESTER_ID_KEY, '1')
})

afterEach(() => vi.unstubAllGlobals())

describe('UI-07 reference data (AC-10)', () => {
  it('renders category and related system options from the API', async () => {
    stubApi()
    renderScreen()

    const category = await screen.findByLabelText(/^Category/)
    expect(within(category).getByRole('option', { name: 'Hardware' })).toBeInTheDocument()
    expect(within(category).getByRole('option', { name: 'Software' })).toBeInTheDocument()

    const system = screen.getByLabelText(/^Related System/)
    expect(within(system).getByRole('option', { name: 'Corporate Laptop' })).toBeInTheDocument()
    // Nothing is hard-coded: only the two seeded names plus the placeholder appear.
    expect(within(system).getAllByRole('option')).toHaveLength(systems.length + 1)
  })

  it('shows the read-only system fields as read-only', async () => {
    stubApi()
    renderScreen()

    expect(await screen.findByLabelText('Ticket Number')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Ticket Date')).toHaveValue('Set on submit')
    expect(screen.getByLabelText('Current Status')).toHaveValue('NEW')
    await waitFor(() =>
      expect(screen.getByLabelText('Requester')).toHaveValue('Nadia Charoen — Registrar'),
    )
  })
})

describe('UI-08 empty summary (AC-11, BR-18)', () => {
  it('shows a field message and a summary callout, moves focus, and sends nothing', async () => {
    const fetchMock = stubApi()
    renderScreen()

    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText(/^Category/), '2')
    await user.selectOptions(screen.getByLabelText(/^Related System/), '7')
    await user.type(
      screen.getByLabelText(/^Description/),
      'The battery drops from full to fifteen percent within half an hour.',
    )
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    const summary = screen.getByLabelText(/^Ticket Summary/)
    expect(summary).toHaveAttribute('aria-invalid', 'true')
    expect(document.getElementById(summary.getAttribute('aria-describedby')!.split(' ').at(-1)!))
      .toHaveTextContent('Summary must be between 10 and 120 characters.')
    expect(screen.getByRole('alert')).toHaveTextContent(/1 field needs attention: Ticket Summary/)
    expect(summary).toHaveFocus()
    expect(postsTo(fetchMock, '/api/tickets')).toHaveLength(0)
  })
})

describe('UI-09 summary boundary (AC-12)', () => {
  it('blocks 9 characters and accepts 10', async () => {
    const fetchMock = stubApi()
    renderScreen()

    const user = await fillValidForm({ summary: 'a'.repeat(9) })
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))
    expect(postsTo(fetchMock, '/api/tickets')).toHaveLength(0)

    await user.type(screen.getByLabelText(/^Ticket Summary/), 'a')
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))
    await waitFor(() => expect(postsTo(fetchMock, '/api/tickets')).toHaveLength(1))
  })
})

describe('UI-10 duplicate submit prevention (AC-14, BR-19)', () => {
  it('disables the busy button so only one request is issued', async () => {
    let release: (value: Response) => void = () => {}
    const fetchMock = stubApi(
      () => new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    renderScreen()

    const user = await fillValidForm()
    const submit = screen.getByRole('button', { name: 'Submit Ticket' })
    await user.click(submit)

    const busy = await screen.findByRole('button', { name: /Submitting…/ })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')

    await user.click(busy)
    expect(postsTo(fetchMock, '/api/tickets')).toHaveLength(1)

    release(ok(createdTicket, 201))
    await screen.findByText('TKT-2026-000041')
  })
})

describe('UI-11 success state (AC-08, FR-11)', () => {
  it('shows the backend ticket number and the three next actions', async () => {
    stubApi()
    renderScreen()

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    expect(await screen.findByText('TKT-2026-000041')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Ticket' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Another' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Tickets' })).toBeInTheDocument()

    // Create Another returns the form to its initial state.
    await user.click(screen.getByRole('button', { name: 'Create Another' }))
    expect(await screen.findByLabelText(/^Ticket Summary/)).toHaveValue('')
  })
})

describe('UI-12 submission failure keeps the input (AC-16, BR-20)', () => {
  it('shows an error, preserves every value and staged file, and re-enables submit', async () => {
    stubApi(() => Promise.reject(new Error('network down')))
    renderScreen()

    const user = await fillValidForm()
    const file = new File(['x'], 'screenshot.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Choose files'), file)

    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    expect(await screen.findByText(/could not be submitted/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Ticket Summary/)).toHaveValue(
      'Laptop battery drains within thirty minutes',
    )
    expect(screen.getByLabelText(/^Category/)).toHaveValue('2')
    expect(screen.getByText('screenshot.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Ticket' })).toBeEnabled()
  })
})

describe('UI-13 duplicate submission (AC-15)', () => {
  it('warns without clearing the form', async () => {
    stubApi(() =>
      Promise.resolve(
        fail(
          409,
          'DUPLICATE_SUBMISSION',
          'A ticket with the same summary and description was submitted moments ago.',
        ),
      ),
    )
    renderScreen()

    const user = await fillValidForm()
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    expect(await screen.findByText(/submitted moments ago/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Ticket Summary/)).toHaveValue(
      'Laptop battery drains within thirty minutes',
    )
    expect(screen.getByRole('link', { name: 'Go to My Tickets' })).toBeInTheDocument()
  })
})

describe('UI-15 ticket created but an upload failed (AC-23, BR-29)', () => {
  it('keeps the ticket, reports the file individually, and offers a retry', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
      if (url.startsWith('/api/categories')) return Promise.resolve(ok(categories))
      if (url.startsWith('/api/related-systems')) return Promise.resolve(ok(systems))
      if (url === '/api/tickets' && init?.method === 'POST') {
        return Promise.resolve(ok(createdTicket, 201))
      }
      if (url === `/api/tickets/${createdTicket.id}/attachments`) {
        return Promise.resolve(fail(415, 'UNSUPPORTED_FILE_TYPE', 'Only JPG, PNG, WEBP, and PDF files are allowed.'))
      }
      return Promise.resolve(ok({}))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderScreen()

    const user = await fillValidForm()
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['x'], 'screenshot.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    // The ticket survives an attachment failure — it is never rolled back.
    expect(await screen.findByText('TKT-2026-000041')).toBeInTheDocument()
    expect(screen.getByText(/0 uploaded · 1 failed/)).toBeInTheDocument()
    expect(screen.getByText(/screenshot\.png/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Retry on Ticket Detail/ })).toHaveAttribute(
      'href',
      '/tickets/41',
    )
  })
})
