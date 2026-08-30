import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

// One file, two modes: staging attachments before a ticket exists (Create Ticket,
// ui-spec §5.5) and managing them on an existing ticket (Ticket Detail, §7.2).

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

// --- Ticket Detail mode (ui-spec §7.2) ---
// These suites stub fetch per test, replacing the create-mode stub installed above.

const attachment = (id: number, filename: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ticketId: 41,
  originalFilename: filename,
  mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'image/png',
  sizeBytes: 248_000,
  uploadedBy: { id: 1, fullName: 'Nadia Charoen' },
  uploadedAt: '2026-08-22T03:19:47.980Z',
  isRemoved: false,
  removedAt: null,
  removalReason: null,
  removedBy: null,
  downloadUrl: `/api/attachments/${id}/download`,
  ...overrides,
})

const removedAttachment = (id: number, filename: string) =>
  attachment(id, filename, {
    isRemoved: true,
    removedAt: '2026-08-22T03:22:10.774Z',
    removalReason: 'Uploaded the wrong screenshot',
    removedBy: { id: 1, fullName: 'Nadia Charoen' },
    downloadUrl: null,
  })

const ticketWith = (attachments: ReturnType<typeof attachment>[]) => ({
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
  attachments,
})

function stubApi(attachments: ReturnType<typeof attachment>[]) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/requesters')) return Promise.resolve(ok(requesters))
    if (/^\/api\/tickets\/\d+$/.test(url)) return Promise.resolve(ok(ticketWith(attachments)))
    return Promise.resolve(ok({}))
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/tickets/41']}>
      <AppRoutes />
    </MemoryRouter>,
  )

describe('UI-22 removed attachments keep metadata only (AC-26, AC-27)', () => {
  it('shows the badge, reason, and timestamp, and no way to reach the bytes', async () => {
    stubApi([attachment(88, 'battery-report.pdf'), removedAttachment(87, 'wrong-screenshot.png')])
    renderDetail()

    const removedRow = await screen.findByTestId('removed-attachment')

    expect(within(removedRow).getByText('wrong-screenshot.png')).toBeInTheDocument()
    expect(within(removedRow).getByText('Removed')).toHaveClass('zen-badge-removed')
    expect(within(removedRow).getByText(/Uploaded the wrong screenshot/)).toBeInTheDocument()
    // 22 Aug 2026 in Asia/Bangkok, whatever the runner's own zone is.
    expect(within(removedRow).getByText(/22 Aug 2026/)).toBeInTheDocument()

    // No download, no preview, no remove control on a removed row (BR-32).
    expect(within(removedRow).queryByRole('link')).not.toBeInTheDocument()
    expect(within(removedRow).queryByRole('button')).not.toBeInTheDocument()
    expect(within(removedRow).queryByRole('img')).not.toBeInTheDocument()

    // The active one keeps both of its controls, and the heading counts only it.
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove battery-report.pdf' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Attachments (1 active of 5)' }),
    ).toBeInTheDocument()
  })
})

describe('UI-23 removal confirmation (AC-25, BR-31)', () => {
  it('requires a reason of at least five characters before sending DELETE', async () => {
    const fetchMock = stubApi([attachment(88, 'battery-report.pdf')])
    renderDetail()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Remove battery-report.pdf' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/record is kept on the ticket/i)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Remove attachment' })
    expect(confirm).toBeDisabled()

    const reason = within(dialog).getByLabelText(/Reason for removal/)
    await user.type(reason, 'four')
    expect(confirm).toBeDisabled()
    // Nothing has been sent while the dialog is still open.
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'DELETE'))
      .toHaveLength(0)

    await user.type(reason, ' files')
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    await waitFor(() => {
      const removals = fetchMock.mock.calls.filter(
        ([url, init]) => url === '/api/attachments/88' && (init as RequestInit)?.method === 'DELETE',
      )
      expect(removals).toHaveLength(1)
      expect(JSON.parse((removals[0][1] as RequestInit).body as string)).toEqual({
        removalReason: 'four files',
      })
    })
  })

  it('sends nothing when the dialog is cancelled', async () => {
    const fetchMock = stubApi([attachment(88, 'battery-report.pdf')])
    renderDetail()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Remove battery-report.pdf' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Reason for removal/), 'wrong file entirely')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toHaveLength(0)
  })
})

describe('UI-24 the five-attachment limit (AC-21, BR-25)', () => {
  it('disables Add attachment and explains why', async () => {
    stubApi([
      attachment(1, 'one.png'),
      attachment(2, 'two.png'),
      attachment(3, 'three.png'),
      attachment(4, 'four.png'),
      attachment(5, 'five.png'),
    ])
    renderDetail()

    expect(
      await screen.findByText('Attachment limit reached. Remove an attachment to add another.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Add attachment')).toBeDisabled()
    expect(
      screen.getByRole('heading', { name: 'Attachments (5 active of 5)' }),
    ).toBeInTheDocument()
  })
})
