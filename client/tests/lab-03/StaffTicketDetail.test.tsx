import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

const staffUser = { id: 7, fullName: 'Ada Chaiyawat', email: 'ada@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }
const adminUser = { id: 3, fullName: 'Chai Admin', email: 'chai@toktickit.test', role: 'ADMINISTRATOR', mustChangePassword: false }

const assignees = [
  { id: 7, fullName: 'Ada Chaiyawat', role: 'IT_STAFF' },
  { id: 9, fullName: 'Bee Somchai', role: 'IT_STAFF' },
  { id: 3, fullName: 'Chai Admin', role: 'ADMINISTRATOR' },
]

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  description: 'Since the firmware update the VPN drops every ten minutes.',
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'Corporate VPN' },
  requester: { id: 12, fullName: 'Nara Sukjai', email: 'nara@toktickit.test', department: 'Finance' },
  requestedPriority: 'HIGH',
  itPriority: 'MEDIUM',
  status: 'OPEN',
  assignee: { id: 9, fullName: 'Bee Somchai' },
  requesterResolvedFlaggedAt: null,
  createdAt: '2026-09-04T02:20:00.000Z',
  updatedAt: '2026-09-09T08:02:31.000Z',
  attachments: [],
  ...overrides,
})

const message = (id: number, visibility: 'PUBLIC' | 'INTERNAL', body: string, author = assignees[1]) => ({
  id,
  visibility,
  body,
  isSystem: false,
  author,
  createdAt: '2026-09-05T03:00:00.000Z',
})

const comments = [
  message(1, 'PUBLIC', 'The VPN drops every ten minutes.', { id: 12, fullName: 'Nara Sukjai', role: 'REQUESTER' }),
  message(3, 'PUBLIC', 'We have replaced your VPN profile.'),
]
const notes = [
  message(2, 'INTERNAL', 'Vendor case 118822 open.'),
  message(4, 'INTERNAL', 'Firmware rollback scheduled for Friday.'),
]

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response
const apiError = (status: number, code: string, message = 'Refused.') => response(status, { error: { code, message } })

type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>
let me: typeof staffUser
let current: ReturnType<typeof ticket>
let handlers: Record<string, Handler>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  me = staffUser
  current = ticket()
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    'GET /api/staff/tickets/41': () => response(200, current),
    'GET /api/staff/assignees': () => response(200, assignees),
    'GET /api/tickets/41/comments': () => response(200, comments),
    'GET /api/staff/tickets/41/internal-notes': () => response(200, notes),
  }
  fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const handler = handlers[key]
    return Promise.resolve(handler ? handler(body) : response(404, { error: { code: 'NOT_MOCKED', message: key } }))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path = '/staff/tickets/41') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

const calls = (method: string, url: string) =>
  fetchMock.mock.calls
    .filter(([calledUrl, init]) => calledUrl === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body ?? 'null')))

/** A PATCH handler that applies the change the way the API would and returns the updated detail. */
const applying = (change: (body: Record<string, unknown>) => Record<string, unknown>): Handler => (body) => {
  current = { ...current, ...change(body!) }
  return response(200, current)
}

const operations = () => screen.findByRole('region', { name: 'Operations' })

/** A conversation panel once its list has loaded — its composer is disabled until then (ui-spec §6.2). */
const loadedPanel = async (name: string) => {
  const panel = await screen.findByRole('region', { name })
  await within(panel).findAllByRole('listitem')
  return panel
}
const statusOptions = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean)

describe('UI-23 ticket information is read-only; only the operations panel is editable (FR-29)', () => {
  it('shows every descriptive field without an editable control', async () => {
    renderAt()
    const info = await screen.findByRole('region', { name: 'Ticket information' })

    for (const text of ['TKT-2026-000041', 'Nara Sukjai', 'VPN disconnects every few minutes', 'Network', 'Corporate VPN']) {
      expect(within(info).getAllByText(new RegExp(text)).length).toBeGreaterThan(0)
    }
    expect(within(info).getByText(/Since the firmware update/)).toBeInTheDocument()
    expect(within(info).getByText(/4 Sept? 2026/)).toBeInTheDocument()
    expect(within(info).getByText('Requested: HIGH')).toHaveClass('zen-badge')
    expect(info.querySelectorAll('input, select, textarea, button')).toHaveLength(0)
  })

  it('puts owner, IT Priority, and status controls in the operations panel', async () => {
    renderAt()
    const panel = await operations()

    expect(await within(panel).findByRole('combobox', { name: 'Ticket owner' })).toBeInTheDocument()
    const priority = within(panel).getByRole('group', { name: 'IT Priority' })
    expect(within(priority).getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
    expect(within(priority).getByRole('radio', { name: 'Medium' })).toBeChecked()
    expect(within(panel).getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
    // The Requester's value stays visible beside IT Priority and has no control of its own (BR-31).
    expect(within(panel).getByText('Requested: HIGH')).toBeInTheDocument()
  })
})

describe('UI-24 the status select lists only permitted targets (BR-35)', () => {
  it('offers exactly the four targets from OPEN on an assigned Ticket', async () => {
    renderAt()
    const select = within(await operations()).getByRole('combobox', { name: 'Status' })
    expect(statusOptions(select)).toEqual(['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'])
    // The empty entry names the current status and is the resting value.
    expect(select).toHaveValue('')
    expect(within(select).getByRole('option', { name: /Open/ })).toHaveValue('')
  })

  it('offers only OPEN and CANCELLED on an unassigned NEW Ticket (BR-30)', async () => {
    current = ticket({ status: 'NEW', assignee: null })
    renderAt()
    const select = within(await operations()).getByRole('combobox', { name: 'Status' })
    expect(statusOptions(select)).toEqual(['OPEN', 'CANCELLED'])
  })

  it('offers nothing from CANCELLED and disables the control', async () => {
    current = ticket({ status: 'CANCELLED' })
    renderAt()
    const panel = await operations()
    const select = within(panel).getByRole('combobox', { name: 'Status' })
    expect(statusOptions(select)).toEqual([])
    expect(select).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Save status' })).toBeDisabled()
  })

  it('saves a non-confirming transition straight away and shows the new status', async () => {
    handlers['PATCH /api/staff/tickets/41/status'] = applying((body) => ({ status: body.status }))
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Status' }), 'IN_PROGRESS')
    await user.click(within(panel).getByRole('button', { name: 'Save status' }))

    await waitFor(() => expect(calls('PATCH', '/api/staff/tickets/41/status')).toEqual([{ status: 'IN_PROGRESS' }]))
    expect(await screen.findByText('Status changed to In Progress.')).toHaveAttribute('role', 'status')
    expect(within(screen.getByTestId('ticket-badges')).getByText('In Progress')).toHaveClass('zen-badge')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('UI-25 RESOLVED, CLOSED, and CANCELLED require confirmation (AC-44, BR-37)', () => {
  it.each([
    ['OPEN', 'RESOLVED', 'Resolve ticket TKT-2026-000041?', 'Resolved'],
    ['RESOLVED', 'CLOSED', 'Close ticket TKT-2026-000041?', 'Closed'],
    ['IN_PROGRESS', 'CANCELLED', 'Cancel ticket TKT-2026-000041?', 'Cancelled'],
  ])('%s → %s: the dialog names the Ticket and the status; cancelling sends nothing', async (from, to, title, label) => {
    current = ticket({ status: from })
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()
    const select = within(panel).getByRole('combobox', { name: 'Status' })

    await user.selectOptions(select, to)
    await user.click(within(panel).getByRole('button', { name: 'Save status' }))

    const dialog = await screen.findByRole('dialog', { name: title })
    expect(dialog).toHaveTextContent(label)
    await user.click(within(dialog).getByRole('button', { name: 'Keep current status' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls('PATCH', '/api/staff/tickets/41/status')).toEqual([])
    expect(select).toHaveValue('')
    // The dialog hands focus back to Save status, so it must stay focusable after the reset (ui-spec §2.4).
    expect(within(panel).getByRole('button', { name: 'Save status' })).toBeEnabled()
  })

  it('sends the transition only after the confirmation', async () => {
    handlers['PATCH /api/staff/tickets/41/status'] = applying((body) => ({ status: body.status }))
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Status' }), 'RESOLVED')
    await user.click(within(panel).getByRole('button', { name: 'Save status' }))
    expect(calls('PATCH', '/api/staff/tickets/41/status')).toEqual([])

    const dialog = await screen.findByRole('dialog', { name: 'Resolve ticket TKT-2026-000041?' })
    await user.click(within(dialog).getByRole('button', { name: 'Resolve ticket' }))

    await waitFor(() => expect(calls('PATCH', '/api/staff/tickets/41/status')).toEqual([{ status: 'RESOLVED' }]))
    expect(await screen.findByText('Status changed to Resolved.')).toBeInTheDocument()
  })
})

describe('UI-26 the Internal Notes panel (AC-66, FR-46, ui-spec §8.3)', () => {
  it('carries its landmark name, heading suffix, permanent composer label, and a lock on every note', async () => {
    renderAt()
    const internal = await screen.findByRole('region', { name: 'Internal Notes, not visible to the Requester' })

    expect(within(internal).getByRole('heading', { level: 2 })).toHaveTextContent('Internal Notes')
    expect(within(internal).getByRole('heading', { level: 2 })).toHaveTextContent('Not visible to the Requester')
    expect(within(internal).getByLabelText('Internal — not visible to the Requester.').tagName).toBe('TEXTAREA')

    const cards = await within(internal).findAllByRole('listitem')
    expect(cards).toHaveLength(2)
    for (const card of cards) expect(card.querySelector('[aria-hidden="true"]')?.textContent).toContain('🔒')
  })

  it('keeps Public Comments in a separate panel that never holds a note, and vice versa', async () => {
    renderAt()
    const internal = await screen.findByRole('region', { name: 'Internal Notes, not visible to the Requester' })
    const publicPanel = screen.getByRole('region', { name: 'Public Comments' })

    await within(publicPanel).findByText('We have replaced your VPN profile.')
    await within(internal).findByText('Vendor case 118822 open.')
    expect(within(publicPanel).getByLabelText('Public — the Requester will see this.').tagName).toBe('TEXTAREA')

    expect(publicPanel.contains(internal)).toBe(false)
    expect(internal.contains(publicPanel)).toBe(false)
    for (const note of notes) expect(within(publicPanel).queryByText(note.body)).not.toBeInTheDocument()
    for (const comment of comments) expect(within(internal).queryByText(comment.body)).not.toBeInTheDocument()
    expect(within(publicPanel).queryByText('🔒')).not.toBeInTheDocument()
  })

  it('renders both panels identically for an Administrator (A-01)', async () => {
    me = adminUser
    renderAt()
    expect(await screen.findByRole('region', { name: 'Internal Notes, not visible to the Requester' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Public Comments' })).toBeInTheDocument()
  })

  it('posts a note to the Internal endpoint only, appends it there, and clears the composer', async () => {
    handlers['POST /api/staff/tickets/41/internal-notes'] = (body) => response(201, message(5, 'INTERNAL', String(body!.body), assignees[0]))
    renderAt()
    const user = userEvent.setup()
    const internal = await loadedPanel('Internal Notes, not visible to the Requester')
    const textarea = within(internal).getByLabelText('Internal — not visible to the Requester.')
    const post = within(internal).getByRole('button', { name: 'Post note' })

    expect(post).toBeDisabled()
    await user.type(textarea, '   ')
    expect(post).toBeDisabled()
    await user.type(textarea, 'Escalated to the network team.')
    await user.click(post)

    await waitFor(() => expect(calls('POST', '/api/staff/tickets/41/internal-notes')).toEqual([{ body: '   Escalated to the network team.' }]))
    expect(await within(internal).findByText('Escalated to the network team.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Public Comments' })).queryByText('Escalated to the network team.')).not.toBeInTheDocument()
    expect(calls('POST', '/api/tickets/41/comments')).toEqual([])
    expect(textarea).toHaveValue('')
  })
})

describe('UI-27 the assignment controls (ui-spec §8.2)', () => {
  it('hides Claim when the caller owns the Ticket', async () => {
    current = ticket({ assignee: { id: 7, fullName: 'Ada Chaiyawat' } })
    renderAt()
    const panel = await operations()
    expect(within(panel).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Unassign' })).toBeInTheDocument()
  })

  it('hides Unassign when the Ticket is unassigned', async () => {
    current = ticket({ assignee: null })
    renderAt()
    const panel = await operations()
    expect(within(panel).getByRole('button', { name: 'Claim' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Unassign' })).not.toBeInTheDocument()
  })

  it('offers Unassigned and the active staff from the assignees endpoint only', async () => {
    renderAt()
    const select = await within(await operations()).findByRole('combobox', { name: 'Ticket owner' })
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Unassigned',
        'Ada Chaiyawat',
        'Bee Somchai',
        'Chai Admin',
      ]),
    )
    expect(select).toHaveValue('9')
  })

  it('claiming a NEW Ticket shows the caller as owner and the status as Open from the same response (AC-36)', async () => {
    current = ticket({ status: 'NEW', assignee: null })
    handlers['PATCH /api/staff/tickets/41/assignment'] = applying(() => ({ assignee: { id: 7, fullName: 'Ada Chaiyawat' }, status: 'OPEN' }))
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()

    await user.click(within(panel).getByRole('button', { name: 'Claim' }))

    await waitFor(() => expect(calls('PATCH', '/api/staff/tickets/41/assignment')).toEqual([{ assigneeId: 'me' }]))
    expect(await screen.findByText('Ticket claimed.')).toBeInTheDocument()
    expect(within(panel).getByRole('combobox', { name: 'Ticket owner' })).toHaveValue('7')
    expect(within(panel).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(screen.getByTestId('ticket-badges')).toHaveTextContent('Open')
    // Exactly one request: the status change arrived with the assignment.
    expect(calls('PATCH', '/api/staff/tickets/41/status')).toEqual([])
  })

  it('changing the owner select saves at once; Unassign sends null', async () => {
    handlers['PATCH /api/staff/tickets/41/assignment'] = applying((body) => ({
      assignee: body.assigneeId === null ? null : assignees.find((person) => person.id === body.assigneeId),
    }))
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()
    const select = await within(panel).findByRole('combobox', { name: 'Ticket owner' })
    await within(select).findByRole('option', { name: 'Chai Admin' })

    await user.selectOptions(select, '3')
    await waitFor(() => expect(select).toHaveValue('3'))
    await user.click(within(panel).getByRole('button', { name: 'Unassign' }))

    await waitFor(() => expect(calls('PATCH', '/api/staff/tickets/41/assignment')).toEqual([{ assigneeId: 3 }, { assigneeId: null }]))
    await waitFor(() => expect(select).toHaveValue(''))
  })
})

describe('409 callouts reset their control (ui-spec §8.4)', () => {
  it('INVALID_ASSIGNEE: a warning callout, and the owner select returns to the current owner', async () => {
    handlers['PATCH /api/staff/tickets/41/assignment'] = () => apiError(409, 'INVALID_ASSIGNEE')
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()
    const select = await within(panel).findByRole('combobox', { name: 'Ticket owner' })
    await within(select).findByRole('option', { name: 'Chai Admin' })

    await user.selectOptions(select, '3')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That person cannot own a ticket.')
    expect(alert).toHaveClass('zen-callout-warning')
    await waitFor(() => expect(select).toHaveValue('9'))
  })

  it('INVALID_STATUS_TRANSITION: a warning callout naming both statuses, and the select resets', async () => {
    handlers['PATCH /api/staff/tickets/41/status'] = () => apiError(409, 'INVALID_STATUS_TRANSITION')
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()
    const select = within(panel).getByRole('combobox', { name: 'Status' })

    await user.selectOptions(select, 'IN_PROGRESS')
    await user.click(within(panel).getByRole('button', { name: 'Save status' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This ticket cannot move from Open to In Progress.')
    expect(alert).toHaveClass('zen-callout-warning')
    expect(select).toHaveValue('')
    // The Ticket is reloaded so the list reflects whatever changed it meanwhile.
    await waitFor(() => expect(calls('GET', '/api/staff/tickets/41').length).toBeGreaterThan(1))
  })
})

describe('IT Priority (AC-39, BR-31)', () => {
  it('saves on change and leaves the Requested Priority as it was', async () => {
    handlers['PATCH /api/staff/tickets/41/priority'] = applying((body) => ({ itPriority: body.itPriority }))
    renderAt()
    const user = userEvent.setup()
    const panel = await operations()

    await user.click(within(panel).getByRole('radio', { name: 'Urgent' }))

    await waitFor(() => expect(calls('PATCH', '/api/staff/tickets/41/priority')).toEqual([{ itPriority: 'URGENT' }]))
    expect(await screen.findByText('IT Priority saved.')).toBeInTheDocument()
    const badges = screen.getByTestId('ticket-badges')
    expect(within(badges).getByText('IT: URGENT')).toBeInTheDocument()
    expect(within(badges).getByText('Requested: HIGH')).toBeInTheDocument()
  })
})

describe('composer states (ui-spec §2.3, §6.2)', () => {
  it('shows the counter from 1800 characters and marks it past 2000', async () => {
    renderAt()
    const user = userEvent.setup()
    const publicPanel = await loadedPanel('Public Comments')
    const textarea = within(publicPanel).getByLabelText('Public — the Requester will see this.')

    await user.click(textarea)
    await user.paste('x'.repeat(1799))
    expect(within(publicPanel).queryByText(/\/ 2000/)).not.toBeInTheDocument()
    await user.paste('x')
    expect(within(publicPanel).getByText('1800 / 2000')).toBeInTheDocument()
    await user.paste('x'.repeat(201))
    expect(within(publicPanel).getByText('2001 / 2000')).toHaveClass('zen-counter-over')
    expect(within(publicPanel).getByRole('button', { name: 'Post comment' })).toBeDisabled()
  })

  it('keeps the text and shows the server message below the field on 400', async () => {
    handlers['POST /api/tickets/41/comments'] = () =>
      response(400, { error: { code: 'VALIDATION_FAILED', message: 'Not posted.', fields: [{ field: 'body', message: 'Enter a comment of up to 2000 characters.' }] } })
    renderAt()
    const user = userEvent.setup()
    const publicPanel = await loadedPanel('Public Comments')
    const textarea = within(publicPanel).getByLabelText('Public — the Requester will see this.')

    await user.type(textarea, 'Please retry now.')
    await user.click(within(publicPanel).getByRole('button', { name: 'Post comment' }))

    expect(await within(publicPanel).findByText('Enter a comment of up to 2000 characters.')).toBeInTheDocument()
    expect(textarea).toHaveValue('Please retry now.')
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the text and offers Try again on a failed post', async () => {
    let attempts = 0
    handlers['POST /api/tickets/41/comments'] = (body) => {
      attempts += 1
      return attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(201, message(6, 'PUBLIC', String(body!.body), assignees[0]))
    }
    renderAt()
    const user = userEvent.setup()
    const publicPanel = await loadedPanel('Public Comments')
    const textarea = within(publicPanel).getByLabelText('Public — the Requester will see this.')

    await user.type(textarea, 'Please retry now.')
    await user.click(within(publicPanel).getByRole('button', { name: 'Post comment' }))

    expect(await within(publicPanel).findByText('The comment could not be posted.')).toBeInTheDocument()
    expect(textarea).toHaveValue('Please retry now.')
    await user.click(within(publicPanel).getByRole('button', { name: 'Try again' }))
    expect(await within(publicPanel).findByText('Please retry now.', { selector: 'p' })).toBeInTheDocument()
    expect(textarea).toHaveValue('')
  })
})

describe('screen states (ui-spec §8.4)', () => {
  it('shows skeletons while the Ticket loads', async () => {
    handlers['GET /api/staff/tickets/41'] = () => new Promise(() => undefined)
    renderAt()
    expect(await screen.findByText('Loading ticket…')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Operations' })).not.toBeInTheDocument()
  })

  it('shows the safe not-found state for 404 and a malformed id', async () => {
    handlers['GET /api/staff/tickets/41'] = () => apiError(404, 'TICKET_NOT_FOUND')
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Ticket not found.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Ticket Queue' })).toHaveAttribute('href', '/staff/tickets')
    expect(screen.queryByRole('region', { name: /Internal Notes/ })).not.toBeInTheDocument()
  })

  it('shows the forbidden state when the API answers 403', async () => {
    handlers['GET /api/staff/tickets/41'] = () => apiError(403, 'FORBIDDEN')
    renderAt()
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page.' })).toBeInTheDocument()
    expect(screen.queryByText('VPN disconnects every few minutes')).not.toBeInTheDocument()
  })

  it('a Requester reaching the URL gets the forbidden state and no staff request is made', async () => {
    me = { ...staffUser, role: 'REQUESTER' }
    renderAt()
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page.' })).toBeInTheDocument()
    expect(calls('GET', '/api/staff/tickets/41/internal-notes')).toEqual([])
  })

  it('a failed Ticket load offers Try again', async () => {
    let attempts = 0
    handlers['GET /api/staff/tickets/41'] = () => {
      attempts += 1
      return attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(200, current)
    }
    renderAt()
    const user = userEvent.setup()
    expect(await screen.findByText('Unable to load this ticket.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await operations()).toBeInTheDocument()
  })

  it('a failed notes load is scoped to its panel: the Ticket and Public Comments stay usable', async () => {
    handlers['GET /api/staff/tickets/41/internal-notes'] = () => apiError(500, 'INTERNAL_ERROR')
    renderAt()
    const internal = await screen.findByRole('region', { name: 'Internal Notes, not visible to the Requester' })

    expect(await within(internal).findByText('Unable to load internal notes.')).toBeInTheDocument()
    expect(within(internal).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(await within(screen.getByRole('region', { name: 'Public Comments' })).findByText('We have replaced your VPN profile.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Operations' })).toBeInTheDocument()
  })

  it('shows the resolution flag beside the status', async () => {
    current = ticket({ status: 'RESOLVED', requesterResolvedFlaggedAt: '2026-09-10T01:00:00.000Z' })
    renderAt()
    await operations()
    expect(within(screen.getByTestId('ticket-badges')).getByText('Requester says resolved')).toBeInTheDocument()
  })
})
