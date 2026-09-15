import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'
import { signedInRequester } from '../helpers/auth'

const staffUser = { id: 7, fullName: 'Ada Chaiyawat', email: 'ada@toktickit.test', role: 'IT_STAFF', mustChangePassword: false }

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  description: 'Since the firmware update the VPN drops every ten minutes.',
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'Corporate VPN' },
  requester: { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Finance' },
  requestedPriority: 'HIGH',
  itPriority: 'URGENT',
  status: 'IN_PROGRESS',
  assignee: { id: 7, fullName: 'Ada Chaiyawat' },
  requesterResolvedFlaggedAt: null,
  createdAt: '2026-09-04T02:20:00.000Z',
  updatedAt: '2026-09-09T08:02:31.000Z',
  attachments: [],
  ...overrides,
})

const message = (id: number, body: string, author: Record<string, unknown>, overrides: Record<string, unknown> = {}) => ({
  id,
  visibility: 'PUBLIC',
  body,
  isSystem: false,
  author,
  createdAt: '2026-09-05T03:00:00.000Z',
  ...overrides,
})

const me = { id: 1, fullName: 'Nadia Charoen', role: 'REQUESTER' }
const ada = { id: 7, fullName: 'Ada Chaiyawat', role: 'IT_STAFF' }

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response
const apiError = (status: number, code: string, fields?: unknown) => response(status, { error: { code, message: 'Refused.', fields } })

type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>
let user: Record<string, unknown>
let current: ReturnType<typeof ticket>
let comments: ReturnType<typeof message>[]
let handlers: Record<string, Handler>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  user = signedInRequester
  current = ticket()
  comments = [message(1, 'The VPN drops every ten minutes.', me), message(3, 'We have replaced your VPN profile.', ada)]
  handlers = {
    'GET /api/auth/me': () => response(200, user),
    'GET /api/tickets/41': () => response(200, current),
    'GET /api/tickets/41/comments': () => response(200, comments),
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

const renderAt = (path = '/tickets/41') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(([calledUrl, init]) => calledUrl === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

/** The Conversation block once its comments have loaded — the composer is disabled until then (ui-spec §6.2). */
async function conversation() {
  const region = await screen.findByRole('region', { name: 'Conversation' })
  await waitFor(() => expect(within(region).queryByText('Loading comments…')).not.toBeInTheDocument())
  return region
}
const composer = (region: HTMLElement) => within(region).getByLabelText('Public — the Requester will see this.')

describe('UI-15 the Requester sees Public Comments and no trace of Internal Notes (AC-47, BR-24)', () => {
  it('renders comment cards with author, role, and body, oldest first', async () => {
    renderAt()
    const region = await conversation()

    const cards = within(region).getAllByRole('listitem')
    expect(cards.map((card) => card.querySelector('.zen-message-body')?.textContent)).toEqual([
      'The VPN drops every ten minutes.',
      'We have replaced your VPN profile.',
    ])
    expect(cards[1]).toHaveTextContent('Ada Chaiyawat')
    expect(cards[1]).toHaveTextContent('IT Staff')
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('Conversation')
  })

  it('has no Internal Notes panel, placeholder, lock, or hidden-message count anywhere in the DOM', async () => {
    renderAt()
    await conversation()

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/internal/i)
    expect(text).not.toMatch(/not visible to the requester/i)
    expect(text).not.toMatch(/hidden|private/i)
    expect(text).not.toContain('🔒')
    expect(screen.queryByRole('region', { name: /internal/i })).not.toBeInTheDocument()
    expect(document.querySelector('.zen-internal')).toBeNull()
    // The client never even asks: no staff route is requested from this screen.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/staff'))).toEqual([])
  })

  it('keeps the Lab 2 ticket information and attachments above the conversation', async () => {
    renderAt()
    const region = await conversation()

    const information = screen.getByRole('heading', { name: 'Ticket information' })
    const attachments = screen.getByRole('heading', { name: /Attachments \(0 active of 5\)/ })
    expect(information.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(attachments.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The Requester never sees a status control or an IT Priority control (BR-34).
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows the empty message and keeps the composer available', async () => {
    comments = []
    renderAt()
    const region = await conversation()

    expect(within(region).getByText('No messages yet. Add a comment if you have more information.')).toBeInTheDocument()
    expect(composer(region)).toBeEnabled()
  })

  it('shows skeleton comments and a disabled composer while comments load', async () => {
    handlers['GET /api/tickets/41/comments'] = () => new Promise(() => undefined)
    renderAt()
    const region = await screen.findByRole('region', { name: 'Conversation' })

    expect(within(region).getByText('Loading comments…')).toBeInTheDocument()
    expect(composer(region)).toBeDisabled()
  })

  it('marks the system comment written by the resolution flag', async () => {
    comments = [message(5, 'The requester reported that the problem appears resolved.', me, { isSystem: true })]
    renderAt()
    const region = await conversation()
    expect(within(region).getByRole('listitem')).toHaveTextContent('System message')
  })
})

describe('UI-16 the comment composer (BR-44, BR-66, exit criterion)', () => {
  it('disables Post while empty or whitespace-only', async () => {
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()
    const post = within(region).getByRole('button', { name: 'Post comment' })

    expect(post).toBeDisabled()
    await eventUser.type(composer(region), '    ')
    expect(post).toBeDisabled()
    await eventUser.type(composer(region), 'Still dropping.')
    expect(post).toBeEnabled()
  })

  it('shows the counter from 1800 characters', async () => {
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.click(composer(region))
    await eventUser.paste('x'.repeat(1799))
    expect(within(region).queryByText(/\/ 2000/)).not.toBeInTheDocument()
    await eventUser.paste('x')
    expect(within(region).getByText('1800 / 2000')).toBeInTheDocument()
  })

  it('keeps the entered text after a failed post, then posts it on Try again', async () => {
    let attempts = 0
    handlers['POST /api/tickets/41/comments'] = (body) => {
      attempts += 1
      return attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(201, message(9, String(body!.body), me))
    }
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.type(composer(region), 'It dropped again at 10:15.')
    await eventUser.click(within(region).getByRole('button', { name: 'Post comment' }))

    const failure = await within(region).findByRole('alert')
    expect(failure).toHaveTextContent('The comment could not be posted.')
    expect(composer(region)).toHaveValue('It dropped again at 10:15.')

    await eventUser.click(within(failure).getByRole('button', { name: 'Try again' }))

    expect(await within(region).findByText('It dropped again at 10:15.', { selector: '.zen-message-body' })).toBeInTheDocument()
    expect(composer(region)).toHaveValue('')
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument()
    expect(calls('POST', '/api/tickets/41/comments')).toHaveLength(2)
  })

  it('keeps the text and shows the server message below the field on 400', async () => {
    handlers['POST /api/tickets/41/comments'] = () =>
      apiError(400, 'VALIDATION_FAILED', [{ field: 'body', message: 'Enter a comment of up to 2000 characters.' }])
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.type(composer(region), 'Please call me.')
    await eventUser.click(within(region).getByRole('button', { name: 'Post comment' }))

    expect(await within(region).findByText('Enter a comment of up to 2000 characters.')).toBeInTheDocument()
    expect(composer(region)).toHaveValue('Please call me.')
    expect(composer(region)).toHaveAttribute('aria-invalid', 'true')
  })

  it('posts to the comments endpoint, appends the card, and makes the text area read-only while posting', async () => {
    let finish: (value: Response) => void = () => undefined
    handlers['POST /api/tickets/41/comments'] = () => new Promise<Response>((resolve) => (finish = resolve))
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.type(composer(region), 'Thank you, trying now.')
    await eventUser.click(within(region).getByRole('button', { name: 'Post comment' }))

    expect(composer(region)).toHaveAttribute('readonly')
    expect(within(region).getByRole('button', { name: 'Posting…' })).toBeDisabled()
    expect(JSON.parse(String((calls('POST', '/api/tickets/41/comments')[0][1] as RequestInit).body))).toEqual({ body: 'Thank you, trying now.' })

    finish(response(201, message(10, 'Thank you, trying now.', me)))
    expect(await within(region).findByText('Thank you, trying now.', { selector: '.zen-message-body' })).toBeInTheDocument()
    expect(composer(region)).toHaveValue('')
  })
})

describe('UI-17 "Problem appears resolved" (AC-50, BR-46)', () => {
  const flagged = '2026-09-10T01:30:00.000Z'

  it('offers the action with its helper text and asks for confirmation; cancelling sends nothing', async () => {
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    expect(within(region).getByText('IT Staff will confirm and close the ticket.')).toBeInTheDocument()
    await eventUser.click(within(region).getByRole('button', { name: 'Problem appears resolved' }))

    const dialog = await screen.findByRole('dialog', { name: 'Tell IT that this problem appears resolved?' })
    expect(dialog).toHaveTextContent('They will confirm and close the ticket.')
    await eventUser.click(within(dialog).getByRole('button', { name: 'Not yet' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls('POST', '/api/tickets/41/appears-resolved')).toEqual([])
    expect(within(region).getByRole('button', { name: 'Problem appears resolved' })).toBeInTheDocument()
  })

  it('after confirming, replaces the button with the badge and date, leaves the status alone, and shows the system comment', async () => {
    handlers['POST /api/tickets/41/appears-resolved'] = () => {
      current = ticket({ requesterResolvedFlaggedAt: flagged })
      comments = [...comments, message(11, 'The requester reported that the problem appears resolved.', me, { isSystem: true })]
      return response(200, current)
    }
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.click(within(region).getByRole('button', { name: 'Problem appears resolved' }))
    await eventUser.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tell IT it’s resolved' }))

    expect(await within(region).findByText('Requester says resolved')).toBeInTheDocument()
    expect(within(region).getByText(/Reported 10 Sept? 2026/)).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Problem appears resolved' })).not.toBeInTheDocument()
    expect(calls('POST', '/api/tickets/41/appears-resolved')).toHaveLength(1)
    // The flag is not a status change (BR-46).
    expect(screen.getAllByText('In Progress')[0]).toHaveClass('zen-badge')
    expect(await within(region).findByText('System message', { exact: false })).toBeInTheDocument()
  })

  it('shows the badge and date instead of the button when the Ticket is already flagged', async () => {
    current = ticket({ requesterResolvedFlaggedAt: flagged })
    renderAt()
    const region = await conversation()

    expect(within(region).getByText('Requester says resolved')).toBeInTheDocument()
    expect(within(region).getByText(/Reported 10 Sept? 2026/)).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Problem appears resolved' })).not.toBeInTheDocument()
  })

  it('treats 409 ALREADY_FLAGGED as flagged: the Ticket reloads and the button cannot be used again', async () => {
    handlers['POST /api/tickets/41/appears-resolved'] = () => {
      current = ticket({ requesterResolvedFlaggedAt: flagged })
      return apiError(409, 'ALREADY_FLAGGED')
    }
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.click(within(region).getByRole('button', { name: 'Problem appears resolved' }))
    await eventUser.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tell IT it’s resolved' }))

    expect(await within(region).findByText('Requester says resolved')).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: 'Problem appears resolved' })).not.toBeInTheDocument()
  })

  it('keeps the button and explains a failure', async () => {
    handlers['POST /api/tickets/41/appears-resolved'] = () => apiError(500, 'INTERNAL_ERROR')
    renderAt()
    const eventUser = userEvent.setup()
    const region = await conversation()

    await eventUser.click(within(region).getByRole('button', { name: 'Problem appears resolved' }))
    await eventUser.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tell IT it’s resolved' }))

    expect(await within(region).findByText('We could not tell IT right now. Please try again.')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Problem appears resolved' })).toBeInTheDocument()
    expect(within(region).queryByText('Requester says resolved')).not.toBeInTheDocument()
  })

  it('is not offered to a staff user opening their own Ticket (the API refuses it with 403)', async () => {
    user = staffUser
    renderAt()
    const region = await conversation()
    expect(within(region).queryByRole('button', { name: 'Problem appears resolved' })).not.toBeInTheDocument()
  })
})
