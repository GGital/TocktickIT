import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bee, malee, renderAt, requesterUser, response, staffUser, stubApi, ticket, type Handler } from '../helpers/actions'

const TICKET_URL = '/api/staff/tickets/41'

let me: Record<string, unknown>
let current: ReturnType<typeof ticket>
let handlers: Record<string, Handler>
let api: ReturnType<typeof stubApi>

beforeEach(() => {
  me = staffUser
  current = ticket()
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    [`GET ${TICKET_URL}`]: () => response(200, current),
    'GET /api/staff/assignees': () => response(200, [bee, malee]),
    'GET /api/tickets/41/comments': () => response(200, []),
    'GET /api/staff/tickets/41/internal-notes': () => response(200, []),
    'GET /api/staff/tickets/41/actions': () => response(200, []),
  }
  api = stubApi(handlers)
})

afterEach(() => vi.unstubAllGlobals())

const operations = () => screen.findByRole('region', { name: 'Operations' })
const statusSelect = async () => within(await operations()).getByRole('combobox', { name: 'Status' })
const optionValues = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean)
const blocked = (blockers: string[]) => response(409, { error: { code: 'RESOLUTION_BLOCKED', message: 'This ticket cannot be resolved yet.', blockers } })

describe('UI-22 the status select offers the current status and allowedTransitions only (AC-40, BR-40)', () => {
  it('lists the current status, selected and disabled, then exactly what the API allows', async () => {
    // RESOLVED is a matrix target from IN_PROGRESS, but the API withheld it: the client must not add it back.
    current = ticket({ allowedTransitions: ['OPEN', 'WAITING_FOR_REQUESTER', 'CANCELLED'], resolutionBlockers: ['NO_ACTIONS'] })
    renderAt('/staff/tickets/41')
    const select = await statusSelect()

    expect(optionValues(select)).toEqual(['OPEN', 'WAITING_FOR_REQUESTER', 'CANCELLED'])
    const currentOption = within(select).getByRole('option', { name: 'In Progress (current)' }) as HTMLOptionElement
    expect(currentOption).toBeDisabled()
    expect(currentOption.selected).toBe(true)
  })

  it('offers nothing beyond the current status when allowedTransitions is empty', async () => {
    current = ticket({ status: 'CANCELLED', allowedTransitions: [] })
    renderAt('/staff/tickets/41')
    const select = await statusSelect()

    expect(optionValues(select)).toEqual([])
    expect(select).toBeDisabled()
  })
})

describe('UI-23 the resolution blockers callout (AC-40, ui-spec §2.7)', () => {
  it('lists each blocker in words, links to #actions, and describes the select', async () => {
    current = ticket({
      status: 'OPEN',
      assignee: null,
      actionSummary: { total: 2, voided: 2, outstandingFollowUps: 1 },
      allowedTransitions: ['CANCELLED'],
      resolutionBlockers: ['UNASSIGNED', 'NO_ACTIONS', 'OUTSTANDING_FOLLOW_UPS'],
    })
    renderAt('/staff/tickets/41')
    const select = await statusSelect()

    const ids = select.getAttribute('aria-describedby')!.split(' ')
    const callout = ids.map((id) => document.getElementById(id)).find((element) => element?.textContent?.includes('Resolve is not available yet'))!
    expect(callout).toBeTruthy()
    expect(within(callout).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Assign an owner first.',
      'No action has been recorded.',
      '1 follow-up is still outstanding.',
    ])
    expect(within(callout).getByRole('link', { name: 'Go to Actions Taken' })).toHaveAttribute('href', '#actions')
  })

  it('pluralises the follow-up count', async () => {
    current = ticket({ actionSummary: { total: 3, voided: 0, outstandingFollowUps: 2 }, allowedTransitions: ['OPEN'], resolutionBlockers: ['OUTSTANDING_FOLLOW_UPS'] })
    renderAt('/staff/tickets/41')
    expect(await screen.findByText('2 follow-ups are still outstanding.')).toBeInTheDocument()
  })

  it('shows no callout when nothing blocks', async () => {
    renderAt('/staff/tickets/41')
    await statusSelect()
    expect(screen.queryByText('Resolve is not available yet')).not.toBeInTheDocument()
  })

  it('renders the same callout from a 409 RESOLUTION_BLOCKED at save time, and resets the select', async () => {
    handlers[`PATCH ${TICKET_URL}/status`] = () => blocked(['OUTSTANDING_FOLLOW_UPS'])
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()
    const select = await statusSelect()

    await user.selectOptions(select, 'RESOLVED')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Resolve ticket' }))

    expect(await screen.findByText('Resolve is not available yet')).toBeInTheDocument()
    expect(screen.getByText(/follow-up is still outstanding\./)).toBeInTheDocument()
    expect(select).toHaveValue('')
  })
})

describe('UI-24 the Resolve confirmation states the action count (ui-spec §6.4)', () => {
  it('counts recorded, non-voided actions; cancelling sends nothing', async () => {
    current = ticket({ actionSummary: { total: 4, voided: 1, outstandingFollowUps: 0 } })
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()

    await user.selectOptions(await statusSelect(), 'RESOLVED')
    await user.click(screen.getByRole('button', { name: 'Save status' }))

    const dialog = await screen.findByRole('dialog', { name: 'Resolve ticket TKT-2026-000041?' })
    expect(dialog).toHaveTextContent('3 actions recorded, no follow-ups outstanding.')
    await user.click(within(dialog).getByRole('button', { name: 'Keep current status' }))
    expect(api.calls('PATCH', `${TICKET_URL}/status`)).toEqual([])
  })

  it('says "1 action" for one', async () => {
    current = ticket({ actionSummary: { total: 1, voided: 0, outstandingFollowUps: 0 } })
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()

    await user.selectOptions(await statusSelect(), 'RESOLVED')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('1 action recorded, no follow-ups outstanding.')
  })

  it('Close and Cancel confirmations carry no count', async () => {
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()

    await user.selectOptions(await statusSelect(), 'CANCELLED')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByRole('dialog', { name: 'Cancel ticket TKT-2026-000041?' })).not.toHaveTextContent('recorded')
  })
})

describe('UI-25 a successful change refreshes the summary without a reload (AC-40)', () => {
  it('sends expectedVersion and redraws badge, Resolved at, options, and blockers from the response', async () => {
    current = ticket({ version: 7 })
    handlers[`PATCH ${TICKET_URL}/status`] = () => {
      current = ticket({
        status: 'RESOLVED',
        version: 8,
        resolvedAt: '2026-10-20T03:00:00.000Z',
        allowedTransitions: ['CLOSED', 'REOPENED'],
        resolutionBlockers: [],
      })
      return response(200, current)
    }
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()
    const info = await screen.findByRole('region', { name: 'Ticket information' })
    expect(within(info).getByText('Resolved at').nextElementSibling).toHaveTextContent('—')

    await user.selectOptions(await statusSelect(), 'RESOLVED')
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Resolve ticket' }))

    await waitFor(() => expect(api.calls('PATCH', `${TICKET_URL}/status`)).toEqual([{ status: 'RESOLVED', expectedVersion: 7 }]))
    expect(await screen.findByText('Status changed to Resolved.')).toBeInTheDocument()
    expect(within(screen.getByTestId('ticket-badges')).getByText('Resolved')).toBeInTheDocument()
    expect(within(info).getByText('Resolved at').nextElementSibling).toHaveTextContent(/20 Oct 2026/)
    expect(optionValues(await statusSelect())).toEqual(['CLOSED', 'REOPENED'])
    expect(api.calls('GET', TICKET_URL)).toHaveLength(1)
  })

  it('assignment and IT Priority send the current version too (BR-78)', async () => {
    current = ticket({ version: 3 })
    handlers[`PATCH ${TICKET_URL}/assignment`] = () => {
      current = ticket({ version: 4, assignee: { id: staffUser.id, fullName: staffUser.fullName } })
      return response(200, current)
    }
    handlers[`PATCH ${TICKET_URL}/priority`] = (body) => {
      current = { ...current, version: 5, itPriority: body!.itPriority as string }
      return response(200, current)
    }
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()
    const panel = await operations()

    await user.click(within(panel).getByRole('button', { name: 'Claim' }))
    await screen.findByText('Ticket claimed.')
    await user.click(within(panel).getByRole('radio', { name: 'Urgent' }))

    await waitFor(() => expect(api.calls('PATCH', `${TICKET_URL}/priority`)).toEqual([{ itPriority: 'URGENT', expectedVersion: 4 }]))
    expect(api.calls('PATCH', `${TICKET_URL}/assignment`)).toEqual([{ assigneeId: 'me', expectedVersion: 3 }])
  })
})

describe('UI-26 a stale Ticket write (AC-26, BR-30, ui-spec §2.6)', () => {
  it('shows the stale callout, re-fetches, names what the user tried, and never resends', async () => {
    current = ticket({ version: 7 })
    handlers[`PATCH ${TICKET_URL}/status`] = () => {
      // Someone else moved the Ticket meanwhile; the re-fetch shows their change.
      current = ticket({ version: 9, status: 'WAITING_FOR_REQUESTER', assignee: { id: malee.id, fullName: malee.fullName }, allowedTransitions: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'] })
      return response(409, { error: { code: 'STALE_TICKET', message: 'This ticket changed since you opened it.' } })
    }
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()

    await user.selectOptions(await statusSelect(), 'OPEN')
    await user.click(screen.getByRole('button', { name: 'Save status' }))

    const alert = await screen.findByText(/This ticket changed since you opened it\. The latest status and owner are shown below/)
    expect(alert.closest('.zen-callout')).toHaveClass('zen-callout-warning')
    expect(screen.getByText('You tried: Open')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByTestId('ticket-badges')).getByText('Waiting for Requester')).toBeInTheDocument())
    expect(api.calls('GET', TICKET_URL)).toHaveLength(2)
    expect(await statusSelect()).toHaveValue('')
    expect(api.calls('PATCH', `${TICKET_URL}/status`)).toHaveLength(1)
  })

  it('names a stale IT Priority attempt', async () => {
    handlers[`PATCH ${TICKET_URL}/priority`] = () => response(409, { error: { code: 'STALE_TICKET', message: 'Changed.' } })
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()

    await user.click(within(await operations()).getByRole('radio', { name: 'Urgent' }))

    expect(await screen.findByText('You tried: IT Priority Urgent')).toBeInTheDocument()
    expect(api.calls('PATCH', `${TICKET_URL}/priority`)).toHaveLength(1)
  })

  it('an inactive assignee is still refused in words (Lab 3 BR-27, A-20)', async () => {
    handlers[`PATCH ${TICKET_URL}/assignment`] = () => response(409, { error: { code: 'INVALID_ASSIGNEE', message: 'Refused.' } })
    renderAt('/staff/tickets/41')
    const user = userEvent.setup()
    const select = await within(await operations()).findByRole('combobox', { name: 'Ticket owner' })
    await within(select).findByRole('option', { name: malee.fullName })

    await user.selectOptions(select, String(malee.id))
    expect(await screen.findByText('That person cannot own a ticket.')).toBeInTheDocument()
  })
})

describe('UI-27 the Requester flag callout (AC-23, BR-39)', () => {
  it('sits at the top of the workflow panel on a flagged Ticket', async () => {
    current = ticket({ requesterResolvedFlaggedAt: '2026-10-19T09:00:00.000Z' })
    renderAt('/staff/tickets/41')
    const panel = await operations()

    const callout = within(panel).getByText('The Requester says this problem appears resolved. Review Actions Taken first.').closest('.zen-callout')!
    expect(callout).toHaveClass('zen-callout-success')
    const owner = within(panel).getByRole('combobox', { name: 'Ticket owner' })
    expect(callout.compareDocumentPosition(owner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is absent when not flagged', async () => {
    renderAt('/staff/tickets/41')
    await operations()
    expect(screen.queryByText(/The Requester says this problem appears resolved/)).not.toBeInTheDocument()
  })
})

describe('Requester Ticket Detail shows when it was resolved (ui-spec §7)', () => {
  beforeEach(() => {
    me = requesterUser
    handlers['GET /api/tickets/41/actions'] = () => response(200, [])
  })

  it('shows "Resolved on {date}" beside the status when resolvedAt is set', async () => {
    handlers['GET /api/tickets/41'] = () => response(200, ticket({ status: 'RESOLVED', resolvedAt: '2026-10-20T03:00:00.000Z', itPriority: undefined, assignee: undefined }))
    renderAt('/tickets/41')
    expect(await screen.findByText(/Resolved on 20 Oct 2026/)).toBeInTheDocument()
  })

  it('shows nothing when it is not resolved', async () => {
    handlers['GET /api/tickets/41'] = () => response(200, ticket({ itPriority: undefined, assignee: undefined }))
    renderAt('/tickets/41')
    await screen.findByRole('heading', { name: 'TKT-2026-000041' })
    expect(screen.queryByText(/Resolved on/)).not.toBeInTheDocument()
  })
})
