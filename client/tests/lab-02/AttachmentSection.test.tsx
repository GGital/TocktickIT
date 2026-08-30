import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

const requesters = [
  { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Registrar' },
]
const categories = [{ id: 2, name: 'Hardware' }]
const systems = [{ id: 7, name: 'Corporate Laptop' }]
const createdTicket = { id: 41, ticketNumber: 'TKT-2026-000041', createdAt: '2026-08-22T03:11:04.512Z' }

const ok = (body: unknown, status = 200) =>
  ({ ok: true, status, json: () => Promise.resolve(body) }) as Response

const bigFile = (name: string, bytes: number, type: string) => {
  const file = new File(['x'], name, { type })
  // Files of megabytes are not worth allocating just to check a size rule.
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(REQUESTER_ID_KEY, '1')

  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
    if (url.startsWith('/api/categories')) return Promise.resolve(ok(categories))
    if (url.startsWith('/api/related-systems')) return Promise.resolve(ok(systems))
    if (url === '/api/tickets') return Promise.resolve(ok(createdTicket, 201))
    return Promise.resolve(ok({}))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderCreateTicket = () =>
  render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <AppRoutes />
    </MemoryRouter>,
  )

describe('UI-14 invalid staged files (AC-19, BR-23, BR-24)', () => {
  it('marks each invalid file with its own reason and uploads neither', async () => {
    renderCreateTicket()
    // accept filters the file picker, and userEvent honours it; drag-and-drop does
    // not, which is exactly the case the client pre-check has to catch.
    const user = userEvent.setup({ applyAccept: false })

    const chooser = await screen.findByLabelText('Choose files')
    await user.upload(chooser, [
      bigFile('crash-dump.exe', 1.2 * 1024 * 1024, 'application/octet-stream'),
      bigFile('huge-photo.png', 6 * 1024 * 1024, 'image/png'),
      bigFile('screenshot.png', 812 * 1024, 'image/png'),
    ])

    expect(await screen.findByText('File type not allowed')).toBeInTheDocument()
    expect(screen.getByText('File is larger than 5 MB')).toBeInTheDocument()
    // Only the valid file counts towards the limit.
    expect(screen.getByRole('heading', { name: 'Attachments (1 of 5)' })).toBeInTheDocument()

    // The rest of the form is untouched by an invalid file.
    await user.selectOptions(screen.getByLabelText(/^Category/), '2')
    await user.selectOptions(screen.getByLabelText(/^Related System/), '7')
    await user.type(
      screen.getByLabelText(/^Ticket Summary/),
      'Laptop battery drains within thirty minutes',
    )
    await user.type(
      screen.getByLabelText(/^Description/),
      'The battery drops from full to fifteen percent within half an hour.',
    )
    await user.click(screen.getByRole('button', { name: 'Submit Ticket' }))

    await screen.findByText('TKT-2026-000041')

    const uploads = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/attachments'),
    )
    expect(uploads).toHaveLength(1)
    expect(screen.getByText(/1 uploaded · 0 failed/)).toBeInTheDocument()
  })

  it('removes a staged file and frees its slot', async () => {
    renderCreateTicket()
    const user = userEvent.setup()

    await user.upload(
      await screen.findByLabelText('Choose files'),
      bigFile('battery-report.pdf', 248 * 1024, 'application/pdf'),
    )
    expect(screen.getByRole('heading', { name: 'Attachments (1 of 5)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove battery-report.pdf' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Attachments (0 of 5)' })).toBeInTheDocument(),
    )
    expect(screen.queryByText('battery-report.pdf')).not.toBeInTheDocument()
  })

  it('stops staging past five valid files and exposes long names in full', async () => {
    renderCreateTicket()
    const user = userEvent.setup()

    const longName = `${'very-long-attachment-name-'.repeat(3)}.png`
    await user.upload(await screen.findByLabelText('Choose files'), [
      bigFile('one.png', 1024, 'image/png'),
      bigFile('two.png', 1024, 'image/png'),
      bigFile('three.png', 1024, 'image/png'),
      bigFile('four.png', 1024, 'image/png'),
      bigFile(longName, 1024, 'image/png'),
      bigFile('sixth.png', 1024, 'image/png'),
    ])

    expect(await screen.findByText('Not staged - attachment limit reached')).toBeInTheDocument()

    expect(await screen.findByText('Attachment limit reached')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Attachments (5 of 5)' })).toBeInTheDocument()
    // AC-49: the full name stays available even when the row truncates it.
    expect(screen.getByText(longName)).toHaveAttribute('title', longName)
  })
})
