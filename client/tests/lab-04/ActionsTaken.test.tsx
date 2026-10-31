import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import {
  action,
  apiError,
  bee,
  malee,
  renderAt,
  requesterUser,
  response,
  staffActions,
  staffUser,
  stubApi,
  ticket,
  type Handler,
} from '../helpers/actions'

const ACTIONS_URL = '/api/staff/tickets/41/actions'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let me: Record<string, unknown>
let current: ReturnType<typeof ticket>
let actions: ReturnType<typeof staffActions>
let handlers: Record<string, Handler>
let api: ReturnType<typeof stubApi>

beforeEach(() => {
  me = staffUser
  current = ticket()
  actions = staffActions()
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    'GET /api/staff/tickets/41': () => response(200, current),
    'GET /api/staff/assignees': () => response(200, [bee, malee]),
    'GET /api/tickets/41/comments': () => response(200, []),
    'GET /api/staff/tickets/41/internal-notes': () => response(200, []),
    [`GET ${ACTIONS_URL}`]: () => response(200, actions),
    [`POST ${ACTIONS_URL}`]: (body) => {
      const created = action(300, { ...body, actionAt: new Date(String(body!.actionAt)).toISOString() })
      actions = [...actions, created]
      return response(201, created)
    },
  }
  api = stubApi(handlers)
})

afterEach(() => vi.unstubAllGlobals())

/** The Actions Taken panel once its list has loaded. */
const loadedPanel = async () => {
  const panel = await screen.findByRole('region', { name: /^Actions Taken/ })
  await within(panel).findByText('Called the user to confirm the new profile.')
  return panel
}

const rowOf = (panel: HTMLElement, text: string) => within(panel).getByText(text).closest('tr') as HTMLElement

const openCreate = async (user: UserEvent) => {
  const panel = await loadedPanel()
  await user.click(within(panel).getByRole('button', { name: 'Record action' }))
  return screen.getByRole('dialog', { name: 'Record action' })
}

const fill = async (user: UserEvent, dialog: HTMLElement, followUp: 'No' | 'Yes' = 'No') => {
  await user.type(within(dialog).getByRole('textbox', { name: 'Action description' }), 'Replaced the network cable.')
  await user.type(within(dialog).getByRole('textbox', { name: 'Result' }), 'Link light is solid.')
  await user.click(within(dialog).getByRole('radio', { name: followUp }))
}

const openMenu = async (user: UserEvent, panel: HTMLElement, when: string) => {
  await user.click(within(panel).getByRole('button', { name: `Actions for action recorded ${when}` }))
  return screen.getByRole('menu')
}

describe('UI-10 the staff panel lists actions in API order with text markers (FR-04, AC-07)', () => {
  it('renders every row in API order, between the ticket and Public Comments', async () => {
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()

    expect(panel).toHaveAttribute('id', 'actions')
    // The count is of non-voided actions.
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Actions Taken (3)')

    const text = panel.textContent!
    const order = ['Replaced the VPN client profile', 'Called the user', 'Reset the router.', 'Checked the firewall logs.'].map((part) =>
      text.indexOf(part),
    )
    expect(order.every((position) => position >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)

    const comments = screen.getByRole('region', { name: 'Public Comments' })
    expect(panel.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Ticket information' }).compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('carries follow-up, edited, voided, and performer markers as text', async () => {
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()

    const outstanding = rowOf(panel, 'Replaced the VPN client profile and cleared cached credentials.')
    expect(within(outstanding).getByText('19 Oct 2026 10:15')).toBeInTheDocument()
    expect(within(outstanding).getByText(/Follow-up outstanding/)).toBeInTheDocument()
    expect(within(outstanding).getByText('Malee Srisuk')).toBeInTheDocument()
    expect(within(outstanding).getByText('See vpn-log-2026-10-19.txt in Attachments.')).toHaveAttribute(
      'title',
      'See vpn-log-2026-10-19.txt in Attachments.',
    )

    const own = rowOf(panel, 'Called the user to confirm the new profile.')
    expect(within(own).getByText('You')).toBeInTheDocument()
    expect(within(own).getByText(/No follow-up/)).toBeInTheDocument()
    expect(within(own).getByText('Edited by Malee Srisuk, 19 Oct 2026 15:00')).toBeInTheDocument()

    expect(within(rowOf(panel, 'Checked the firewall logs.')).getByText(/Follow-up done/)).toBeInTheDocument()

    const voided = panel.querySelector('details')!
    expect(voided).not.toHaveAttribute('open')
    expect(voided.querySelector('summary')).toHaveTextContent('Voided · 19 Oct 2026 15:00 · Bee Somchai · "Wrong ticket; see TKT-2026-000044"')
    expect(within(voided).getByText('Reset the router.')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is recorded', async () => {
    actions = []
    renderAt('/staff/tickets/41')
    const panel = await screen.findByRole('region', { name: /^Actions Taken/ })

    expect(await within(panel).findByText('No actions recorded yet.')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Record action' })).toBeInTheDocument()
  })
})

describe('UI-11 Follow-Up Required toggles a required note (AC-39)', () => {
  it('shows the note only on Yes, keeps its text while hidden, and omits it from a No payload', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)

    expect(within(dialog).queryByRole('textbox', { name: 'Follow-up note' })).toBeNull()
    expect(within(dialog).getByRole('radio', { name: 'Yes' })).not.toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'No' })).not.toBeChecked()

    await fill(user, dialog, 'Yes')
    const note = within(dialog).getByRole('textbox', { name: 'Follow-up note' })
    expect(note).toHaveAttribute('aria-required', 'true')
    await user.type(note, 'Call back on Monday.')

    await user.click(within(dialog).getByRole('radio', { name: 'No' }))
    expect(within(dialog).queryByRole('textbox', { name: 'Follow-up note' })).toBeNull()

    await user.click(within(dialog).getByRole('radio', { name: 'Yes' }))
    expect(within(dialog).getByRole('textbox', { name: 'Follow-up note' })).toHaveValue('Call back on Monday.')

    await user.click(within(dialog).getByRole('radio', { name: 'No' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))

    await waitFor(() => expect(api.calls('POST', ACTIONS_URL)).toHaveLength(1))
    const [body] = api.calls('POST', ACTIONS_URL)
    expect(body).not.toHaveProperty('followUpNote')
    expect(body).toMatchObject({
      followUpRequired: false,
      description: 'Replaced the network cable.',
      result: 'Link light is solid.',
      attachmentNotes: null,
    })
    expect(body.actionAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/)
    expect(body.clientRequestId).toMatch(UUID)
    expect(Object.keys(body)).not.toContain('performedBy')
  })

  it('sends the note when Yes, then closes and announces the save', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)

    await fill(user, dialog, 'Yes')
    await user.type(within(dialog).getByRole('textbox', { name: 'Follow-up note' }), 'Call back on Monday.')
    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.calls('POST', ACTIONS_URL)[0]).toMatchObject({ followUpRequired: true, followUpNote: 'Call back on Monday.' })
    const panel = screen.getByRole('region', { name: /^Actions Taken/ })
    expect(await within(panel).findByText('Action saved.')).toBeInTheDocument()
    expect(await within(panel).findByText('Replaced the network cable.')).toBeInTheDocument()
    // The ticket summary is re-read so its version and blockers follow the new action (ui-spec §6.3).
    expect(api.calls('GET', '/api/staff/tickets/41').length).toBeGreaterThanOrEqual(2)
  })
})

describe('UI-12 submitting an empty form (AC-04)', () => {
  it('marks every field and links a summary, without sending a request', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)

    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))

    expect(within(dialog).getByRole('textbox', { name: 'Action description' })).toHaveAccessibleDescription(
      /Describe the action in up to 2000 characters\./,
    )
    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveAccessibleDescription(/Enter the result in up to 1000 characters\./)
    expect(within(dialog).getByRole('group', { name: 'Follow-up required?' })).toHaveAccessibleDescription(
      /Choose whether follow-up is required\./,
    )

    const summary = within(dialog).getByRole('alert')
    expect(within(summary).getByRole('link', { name: 'Action description' })).toHaveAttribute('href', '#actionDescription')
    expect(within(summary).getByRole('link', { name: 'Result' })).toHaveAttribute('href', '#actionResult')
    expect(within(summary).getByRole('link', { name: 'Follow-up required?' })).toHaveAttribute('href', '#followUpRequired')

    await user.click(within(summary).getByRole('link', { name: 'Result' }))
    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveFocus()
    expect(api.calls('POST', ACTIONS_URL)).toHaveLength(0)
  })
})

describe('UI-13 Performed by and Created are read-only (AC-50, BR-03)', () => {
  it('shows the performer as text, never as an input, on create', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)

    expect(within(dialog).getByText('You (Ada Chaiyawat)')).toHaveClass('zen-readonly-value')
    expect(within(dialog).queryByRole('textbox', { name: /Performed by/ })).toBeNull()
    expect(within(dialog).queryByText('Created')).toBeNull()
  })

  it('shows the original performer and Created on edit, outside the tab order', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const menu = await openMenu(user, panel, '19 Oct 2026 14:40')
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit action' })

    expect(within(dialog).getByText('You (Ada Chaiyawat)')).toHaveClass('zen-readonly-value')
    expect(within(dialog).getByText('19 Oct 2026 10:20')).toHaveClass('zen-readonly-value')
    expect(within(dialog).getByText('Malee Srisuk, 19 Oct 2026 15:00')).toHaveClass('zen-readonly-value')
    for (const element of dialog.querySelectorAll('.zen-readonly-value')) {
      expect(element.matches('input, textarea, select, button, [tabindex]')).toBe(false)
    }
    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveValue('User confirmed the VPN stays connected.')
  })
})

describe('UI-14 a 500 on save keeps the dialog and every value (AC-46)', () => {
  it('stays open with the values, then Try again resubmits', async () => {
    let attempts = 0
    handlers[`POST ${ACTIONS_URL}`] = (body) => {
      attempts += 1
      if (attempts === 1) return apiError(500, 'INTERNAL_ERROR', 'Something went wrong.')
      return response(201, action(300, body))
    }
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)
    await fill(user, dialog, 'Yes')
    await user.type(within(dialog).getByRole('textbox', { name: 'Follow-up note' }), 'Call back on Monday.')
    await user.type(within(dialog).getByRole('textbox', { name: 'Attachment notes' }), 'cable.png')
    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))

    const failure = await within(dialog).findByText('The action was not saved.')
    expect(failure.closest('[role="alert"]')).toHaveClass('zen-callout-error')
    expect(screen.getByRole('dialog', { name: 'Record action' })).toBe(dialog)
    expect(within(dialog).getByRole('textbox', { name: 'Action description' })).toHaveValue('Replaced the network cable.')
    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveValue('Link light is solid.')
    expect(within(dialog).getByRole('radio', { name: 'Yes' })).toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: 'Follow-up note' })).toHaveValue('Call back on Monday.')
    expect(within(dialog).getByRole('textbox', { name: 'Attachment notes' })).toHaveValue('cable.png')

    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [first, second] = api.calls('POST', ACTIONS_URL)
    expect(second).toEqual(first)
  })
})

describe('UI-15 double click sends one request (AC-45, BR-82)', () => {
  it('disables Save action with a busy state while the request is in flight', async () => {
    let release!: () => void
    handlers[`POST ${ACTIONS_URL}`] = (body) =>
      new Promise((resolve) => {
        release = () => resolve(response(201, action(300, body)))
      })
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const dialog = await openCreate(user)
    await fill(user, dialog)

    await user.dblClick(within(dialog).getByRole('button', { name: 'Save action' }))

    const busy = await within(dialog).findByRole('button', { name: 'Saving…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(api.calls('POST', ACTIONS_URL)).toHaveLength(1)

    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.calls('POST', ACTIONS_URL)).toHaveLength(1)
  })
})

describe('UI-16 409 STALE_ACTION on edit (AC-11, BR-30)', () => {
  const latest = () =>
    action(215, {
      ...actions[1],
      result: 'Stable since the router swap.',
      lastEditedBy: bee,
      version: 3,
      updatedAt: '2026-10-19T09:45:00.000Z',
    })

  const editAndHitStale = async (user: UserEvent) => {
    let attempts = 0
    handlers['PATCH /api/staff/tickets/41/actions/215'] = (body) => {
      attempts += 1
      if (attempts === 1) {
        actions = actions.map((row) => (row.id === 215 ? latest() : row))
        return apiError(409, 'STALE_ACTION', 'This action was changed by someone else. Reload it and try again.')
      }
      return response(200, { ...latest(), ...body, version: 4 })
    }
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const menu = await openMenu(user, panel, '19 Oct 2026 14:40')
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit action' })
    const result = within(dialog).getByRole('textbox', { name: 'Result' })
    await user.clear(result)
    await user.type(result, 'Stable all day.')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await within(dialog).findByText('Someone else saved this action while you were editing.')
    return dialog
  }

  it('shows the latest values read-only and never clears or resends on its own', async () => {
    const user = userEvent.setup()
    const dialog = await editAndHitStale(user)

    const callout = within(dialog).getByText('Someone else saved this action while you were editing.').closest('.zen-callout') as HTMLElement
    expect(callout).toHaveClass('zen-callout-warning')
    expect(within(callout).getByText('Stable since the router swap.')).toBeInTheDocument()
    expect(callout.querySelectorAll('input, textarea')).toHaveLength(0)
    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveValue('Stable all day.')
    expect(api.calls('PATCH', '/api/staff/tickets/41/actions/215')).toHaveLength(1)
  })

  it('Keep my changes resubmits the typed values against the new version', async () => {
    const user = userEvent.setup()
    const dialog = await editAndHitStale(user)

    await user.click(within(dialog).getByRole('button', { name: 'Keep my changes' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const [first, second] = api.calls('PATCH', '/api/staff/tickets/41/actions/215')
    expect(first).toEqual({ expectedVersion: 2, result: 'Stable all day.' })
    expect(second).toEqual({ expectedVersion: 3, result: 'Stable all day.' })
  })

  it('Discard my changes loads the latest values without sending anything', async () => {
    const user = userEvent.setup()
    const dialog = await editAndHitStale(user)

    await user.click(within(dialog).getByRole('button', { name: 'Discard my changes' }))

    expect(within(dialog).getByRole('textbox', { name: 'Result' })).toHaveValue('Stable since the router swap.')
    expect(within(dialog).queryByText('Someone else saved this action while you were editing.')).toBeNull()
    expect(api.calls('PATCH', '/api/staff/tickets/41/actions/215')).toHaveLength(1)
  })
})

describe('UI-17 the row menu offers only permitted items (AC-10)', () => {
  it('renders Edit and Void for canEdit, Mark follow-up done for an outstanding follow-up, and no empty menu', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()

    let menu = await openMenu(user, panel, '19 Oct 2026 14:40')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit', 'Void'])
    await user.keyboard('{Escape}')

    menu = await openMenu(user, panel, '19 Oct 2026 10:15')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Mark follow-up done'])
    await user.keyboard('{Escape}')

    // Completed follow-up by someone else, and the voided row: nothing permitted, so no trigger at all.
    expect(within(panel).queryByRole('button', { name: 'Actions for action recorded 19 Oct 2026 16:30' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Actions for action recorded 19 Oct 2026 15:00' })).toBeNull()
  })

  it('marks a follow-up done after confirmation, sending the action version', async () => {
    handlers['POST /api/staff/tickets/41/actions/214/complete-follow-up'] = () => {
      actions = actions.map((row) =>
        row.id === 214 ? { ...row, followUpOutstanding: false, followUpCompletedAt: '2026-10-20T01:00:00.000Z', version: 2 } : row,
      )
      return response(200, actions[0])
    }
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const menu = await openMenu(user, panel, '19 Oct 2026 10:15')
    await user.click(within(menu).getByRole('menuitem', { name: 'Mark follow-up done' }))

    const dialog = screen.getByRole('dialog', { name: 'Mark the follow-up for the action on 19 Oct 2026 10:15 as done?' })
    expect(within(dialog).getByText('The note will be kept.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Mark done' }))

    expect(await within(panel).findByText('Follow-up marked done.')).toBeInTheDocument()
    expect(api.calls('POST', '/api/staff/tickets/41/actions/214/complete-follow-up')).toEqual([{ expectedVersion: 1 }])
    await waitFor(() =>
      expect(within(rowOf(panel, 'Replaced the VPN client profile and cleared cached credentials.')).getByText(/Follow-up done/)).toBeInTheDocument(),
    )
  })
})

describe('UI-18 the void dialog (AC-14)', () => {
  it('needs a reason, then collapses the row with its reason', async () => {
    handlers['POST /api/staff/tickets/41/actions/215/void'] = (body) => {
      actions = actions.map((row) =>
        row.id === 215 ? { ...row, voided: true, voidedAt: '2026-10-20T01:00:00.000Z', voidedBy: staffUser, voidReason: String(body!.reason), canEdit: false } : row,
      )
      return response(200, actions[1])
    }
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const menu = await openMenu(user, panel, '19 Oct 2026 14:40')
    await user.click(within(menu).getByRole('menuitem', { name: 'Void' }))

    const dialog = screen.getByRole('dialog', { name: 'Void action recorded 19 Oct 2026 14:40 by Ada Chaiyawat?' })
    expect(within(dialog).getByText(/Voided actions stay in the staff history, are hidden from the Requester/)).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Void action' })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for voiding' }), '   ')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox', { name: 'Reason for voiding' }), 'Duplicate of the 10:15 action.')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await within(panel).findByText('Action voided.')).toBeInTheDocument()
    expect(api.calls('POST', '/api/staff/tickets/41/actions/215/void')).toEqual([
      { expectedVersion: 2, reason: 'Duplicate of the 10:15 action.' },
    ])
    await waitFor(() => expect(panel.querySelectorAll('details')).toHaveLength(2))
    const summaries = [...panel.querySelectorAll('details summary')].map((summary) => summary.textContent)
    expect(summaries).toContain('Voided · 19 Oct 2026 14:40 · You · "Duplicate of the 10:15 action."')
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Actions Taken (2)')
  })
})

describe('UI-19 a ticket that refuses work hides Record action (AC-06)', () => {
  it.each([
    ['NEW', null, 'Claim or assign this ticket to record actions.'],
    ['OPEN', null, 'Claim or assign this ticket to record actions.'],
    ['RESOLVED', { id: bee.id, fullName: bee.fullName }, 'Reopen this ticket to record more work.'],
  ])('%s with owner %j shows the reason line instead', async (status, assignee, reason) => {
    current = ticket({ status, assignee })
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()

    expect(within(panel).queryByRole('button', { name: 'Record action' })).toBeNull()
    expect(within(panel).getByText(reason)).toBeInTheDocument()
    // The API refuses every action write on such a Ticket, so no row offers Edit, Void, or Mark done (ui-spec §6.2).
    expect(within(panel).queryAllByRole('button', { name: /^Actions for action recorded/ })).toEqual([])
  })
})

describe('UI-20 the Requester sees a read-only list (AC-16)', () => {
  const requesterAction = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    actionAt: '2026-10-19T03:15:00.000Z',
    description: `Action ${id} description`,
    result: `Action ${id} result`,
    followUpRequired: false,
    followUpNote: null,
    followUpCompleted: false,
    attachmentNotes: null,
    performedBy: { fullName: 'Malee Srisuk', role: 'IT_STAFF' },
    createdAt: '2026-10-19T03:20:41.000Z',
    edited: false,
    updatedAt: '2026-10-19T03:20:41.000Z',
    ...overrides,
  })

  beforeEach(() => {
    me = requesterUser
    handlers['GET /api/tickets/41'] = () => response(200, ticket({ itPriority: undefined, assignee: undefined }))
    handlers['GET /api/tickets/41/actions'] = () =>
      response(200, [
        requesterAction(214, {
          followUpRequired: true,
          followUpNote: "Confirm with you after Monday's peak usage.",
          attachmentNotes: 'See vpn-log.txt in Attachments.',
        }),
        requesterAction(215, { actionAt: '2026-10-19T07:40:00.000Z', edited: true }),
      ])
  })

  it('renders cards with the work, result, performer, follow-up, and edited marker, and no controls', async () => {
    renderAt('/tickets/41')
    const section = await screen.findByRole('region', { name: 'Work done by IT' })
    const cards = await within(section).findAllByRole('listitem')

    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('19 Oct 2026 10:15')
    expect(cards[0]).toHaveTextContent('Action 214 description')
    expect(cards[0]).toHaveTextContent('Result: Action 214 result')
    expect(cards[0]).toHaveTextContent('By Malee Srisuk (IT Staff)')
    expect(within(cards[0]).getByText(/Follow-up outstanding/)).toBeInTheDocument()
    expect(cards[0]).toHaveTextContent("Confirm with you after Monday's peak usage.")
    expect(cards[0]).toHaveTextContent('See vpn-log.txt in Attachments.')
    expect(within(cards[0]).queryByRole('link')).toBeNull()
    expect(within(cards[1]).getByText('Edited')).toBeInTheDocument()

    expect(within(section).queryAllByRole('button')).toHaveLength(0)
    expect(within(section).queryByRole('menu')).toBeNull()
    expect(section.textContent).not.toMatch(/Voided|version/i)
    expect(api.calls('GET', ACTIONS_URL)).toHaveLength(0)
  })

  it('says so when IT has not recorded work', async () => {
    handlers['GET /api/tickets/41/actions'] = () => response(200, [])
    renderAt('/tickets/41')
    const section = await screen.findByRole('region', { name: 'Work done by IT' })

    expect(await within(section).findByText('IT has not recorded any work on this ticket yet.')).toBeInTheDocument()
  })
})

describe('UI-21 a retry reuses the clientRequestId; a new form gets a new one (BR-24, BR-82)', () => {
  it('sends the same id after a network failure, and a fresh id for the next action', async () => {
    let attempts = 0
    handlers[`POST ${ACTIONS_URL}`] = (body) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return response(201, action(300 + attempts, body))
    }
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    let dialog = await openCreate(user)
    await fill(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))
    await within(dialog).findByText('The action was not saved.')

    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openCreate(user)
    await fill(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Save action' }))
    await waitFor(() => expect(api.calls('POST', ACTIONS_URL)).toHaveLength(3))

    const [first, retry, next] = api.calls('POST', ACTIONS_URL).map((body) => body.clientRequestId)
    expect(first).toMatch(UUID)
    expect(retry).toBe(first)
    expect(next).toMatch(UUID)
    expect(next).not.toBe(first)
  })
})

describe('an action recorded in the Ticket’s first minute can still be edited (BR-06)', () => {
  it('does not judge the unchanged time, which the input shows without its seconds, and does not send it', async () => {
    // The API stores seconds; the form shows 14:40, which on its own would read as before the Ticket at 14:40:30.
    current = ticket({ createdAt: '2026-10-19T07:40:30.000Z' })
    actions = actions.map((row) => (row.id === 215 ? { ...row, actionAt: '2026-10-19T07:40:45.000Z' } : row))
    handlers['PATCH /api/staff/tickets/41/actions/215'] = (body) => response(200, { ...actions[1], ...body, version: 3 })
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()

    await user.click(within(await openMenu(user, panel, '19 Oct 2026 14:40')).getByRole('menuitem', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit action' })
    const result = within(dialog).getByRole('textbox', { name: 'Result' })
    await user.clear(result)
    await user.type(result, 'Stable all day.')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.calls('PATCH', '/api/staff/tickets/41/actions/215')).toHaveLength(1))
    expect(api.calls('PATCH', '/api/staff/tickets/41/actions/215')[0]).toEqual({ expectedVersion: 2, result: 'Stable all day.' })
  })
})
