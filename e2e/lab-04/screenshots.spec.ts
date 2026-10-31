import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import {
  API,
  VIEWPORTS,
  actionsPanel,
  addAction,
  badges,
  createUserReady,
  dialog,
  expectNoHorizontalScroll,
  fillAction,
  openStaffTicket,
  operations,
  removeFixtureUsers,
  rowMenu,
  runTag,
  signInAs,
  staffWrite,
  ticketFixture,
  type AccountName,
  type ViewportName,
} from './helpers'

/** ui-spec §14: every state, at every viewport, as `<state>.<viewport>.png` — greyscale at desktop only. */
const INVENTORY = {
  'staff-dashboard': ['loading', 'loaded', 'all-zero', 'administrator', 'drill-down', 'forbidden', 'failure'],
  'requester-dashboard': ['loading', 'loaded', 'all-zero', 'drill-down', 'forbidden', 'failure'],
  'actions-taken': ['empty', 'list-multiple', 'create', 'follow-up-required', 'validation', 'edit', 'stale', 'complete-follow-up', 'void-dialog', 'voided', 'not-actionable', 'requester-view', 'greyscale'],
  'ticket-workflow': ['allowed-transitions', 'resolution-blocked', 'resolve-confirm', 'resolved', 'requester-flagged', 'stale-ticket', 'reopened'],
} as const

type Folder = keyof typeof INVENTORY
type Prepare = (page: Page, viewport: ViewportName) => Promise<void | { fullPage?: boolean }>

const ROOT = path.resolve('artifacts/lab-04/screenshots')
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[]
const ONLY_DESKTOP = new Set(['greyscale'])
const tag = runTag()
let counter = 0
const summary = (text: string) => `${tag} ${text} (${(counter += 1)})`

/** Captures one state at each viewport, each in a fresh browser context signed in as `as`. */
function state<F extends Folder>(folder: F, name: (typeof INVENTORY)[F][number], as: AccountName | null, prepare: Prepare) {
  test(`${folder}/${name}`, async ({ browser }) => {
    for (const viewport of ONLY_DESKTOP.has(name) ? (['desktop'] as const) : VIEWPORT_NAMES) {
      const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
      const page = await context.newPage()
      if (as) await signInAs(page, as)
      const options = (await prepare(page, viewport)) ?? {}
      await expectNoHorizontalScroll(page, `${folder}/${name}.${viewport}`)
      await page.screenshot({ path: path.join(ROOT, folder, `${name}.${viewport}.png`), fullPage: options.fullPage ?? true })
      await context.close()
    }
  })
}

const settled = (page: Page) => page.waitForLoadState('networkidle')
const hang = () => new Promise<never>(() => undefined)
const card = (page: Page, label: string) => page.getByRole('link', { name: new RegExp(`^${label}: \\d+\\. View list$`) })

/** Answers the dashboard with every count at zero and every list empty, keeping the response's shape (A-14). */
async function zeroed(route: Route) {
  const body = await (await route.fetch()).json()
  const zero = (value: unknown): unknown =>
    Array.isArray(value) ? [] : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, key === 'count' ? 0 : zero(inner)])) : value
  await route.fulfill({ json: { ...body, metrics: zero(body.metrics), byStatus: zero(body.byStatus), byItPriority: zero(body.byItPriority), recentlyUpdated: [], myRecentActions: [] } })
}

// --- Staff dashboard ----------------------------------------------------------------------------------------------

test.describe('staff dashboard screenshots', () => {
  state('staff-dashboard', 'loading', 'staff', async (page) => {
    await page.route('**/api/staff/dashboard', hang)
    await page.goto('/staff/dashboard')
    await expect(page.locator('.zen-skeleton').first()).toBeVisible()
    return { fullPage: false }
  })

  state('staff-dashboard', 'loaded', 'staff', async (page) => {
    await page.goto('/staff/dashboard')
    await expect(card(page, 'Unassigned tickets')).toBeVisible()
    await settled(page)
  })

  state('staff-dashboard', 'all-zero', 'staff', async (page) => {
    // A desk with no Tickets cannot be staged on shared data, so only the dashboard response is zeroed.
    await page.route('**/api/staff/dashboard', zeroed)
    await page.goto('/staff/dashboard')
    await expect(page.getByRole('link', { name: 'Unassigned tickets: 0. View list' })).toBeVisible()
  })

  state('staff-dashboard', 'administrator', 'admin', async (page) => {
    await page.goto('/staff/dashboard')
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    await settled(page)
  })

  state('staff-dashboard', 'drill-down', 'staff', async (page) => {
    await page.goto('/staff/dashboard')
    await card(page, 'Unassigned tickets').click()
    await expect(page.getByText('Showing: Unassigned tickets')).toBeVisible()
    await settled(page)
  })

  state('staff-dashboard', 'forbidden', 'requester', async (page) => {
    await page.goto('/staff/dashboard')
    await expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible()
  })

  state('staff-dashboard', 'failure', 'staff', async (page) => {
    await page.route('**/api/staff/dashboard', (route) => route.abort('failed'))
    await page.goto('/staff/dashboard')
    await expect(page.getByText('We could not load the dashboard.')).toBeVisible()
  })
})

// --- Requester dashboard ------------------------------------------------------------------------------------------

test.describe('requester dashboard screenshots', () => {
  test.afterAll(async () => {
    await removeFixtureUsers()
  })

  state('requester-dashboard', 'loading', 'requester', async (page) => {
    await page.route('**/api/dashboard/requester', hang)
    await page.goto('/dashboard')
    await expect(page.locator('.zen-skeleton').first()).toBeVisible()
    return { fullPage: false }
  })

  state('requester-dashboard', 'loaded', 'requester', async (page) => {
    await page.goto('/dashboard')
    await expect(card(page, 'Open tickets')).toBeVisible()
    await settled(page)
  })

  state('requester-dashboard', 'all-zero', null, async (page, viewport) => {
    // A real Requester with no Tickets at all.
    const newcomer = await createUserReady(page.request, { key: `zero.${viewport}.${tag.toLowerCase()}`, fullName: 'Waraporn Newcomer', role: 'REQUESTER' })
    await signInAs(page, newcomer)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'You have not raised any tickets yet.' })).toBeVisible()
  })

  state('requester-dashboard', 'drill-down', 'requester', async (page) => {
    await page.goto('/dashboard')
    await card(page, 'Open tickets').click()
    await expect(page.getByText('Showing: Open tickets')).toBeVisible()
    await settled(page)
  })

  state('requester-dashboard', 'forbidden', 'staff', async (page) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible()
  })

  state('requester-dashboard', 'failure', 'requester', async (page) => {
    await page.route('**/api/dashboard/requester', (route) => route.abort('failed'))
    await page.goto('/dashboard')
    await expect(page.getByText('We could not load your dashboard.')).toBeVisible()
  })
})

// --- Actions Taken ------------------------------------------------------------------------------------------------

/** A Ticket with a realistic work log: an outstanding follow-up, an edited action, another performer, a voided row. */
async function workLog(page: Page) {
  const request = page.context().request
  const ticket = await ticketFixture(request, summary('VPN drops every ten minutes during video calls'), { owner: 'staff', itPriority: 'HIGH' })
  await addAction(request, 'staff', ticket.id, {
    description: 'Replaced the VPN client profile and cleared the cached credentials on the laptop.',
    result: 'Connection stable for 30 minutes in the office.',
    followUpNote: 'Ask the user to test from home on Monday evening.',
    attachmentNotes: 'vpn-client-log.txt',
  })
  const edited = await addAction(request, 'otherStaff', ticket.id, { description: 'Checked the gateway logs for the user’s session.', result: 'No drops logged on the gateway side.' })
  await signInAs(request, 'otherStaff')
  expect((await request.patch(`${API}/staff/tickets/${ticket.id}/actions/${edited.id}`, { data: { expectedVersion: edited.version, result: 'No drops logged on the gateway side; the client is the likely cause.' } })).status()).toBe(200)
  const wrong = await addAction(request, 'staff', ticket.id, { description: 'Restarted the office switch.', result: 'Recorded on the wrong ticket.' })
  await signInAs(request, 'staff')
  expect((await request.post(`${API}/staff/tickets/${ticket.id}/actions/${wrong.id}/void`, { data: { expectedVersion: wrong.version, reason: 'Belongs to the printer ticket.' } })).status()).toBe(200)
  return ticket
}

const openLog = async (page: Page) => {
  const ticket = await workLog(page)
  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)
  return ticket
}
const recordDialog = async (page: Page) => {
  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Record action' })).toBeVisible()
}
const firstRow = (page: Page) => actionsPanel(page).locator('tbody tr').filter({ hasText: 'Replaced the VPN client profile' })

test.describe('actions taken screenshots', () => {
  state('actions-taken', 'empty', null, async (page) => {
    const ticket = await ticketFixture(page.context().request, summary('new starter needs a docking station'), { owner: 'staff' })
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await expect(actionsPanel(page).getByRole('heading', { name: 'No actions recorded yet.' })).toBeVisible()
  })

  state('actions-taken', 'list-multiple', null, async (page) => {
    await openLog(page)
    await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible()
    await settled(page)
  })

  state('actions-taken', 'create', null, async (page) => {
    await openLog(page)
    await recordDialog(page)
    await fillAction(page, { description: 'Updated the VPN client to version 5.2 and rebooted.', result: 'Connected from the office without drops.' })
    return { fullPage: false }
  })

  state('actions-taken', 'follow-up-required', null, async (page) => {
    await openLog(page)
    await recordDialog(page)
    await fillAction(page, { description: 'Updated the VPN client to version 5.2 and rebooted.', result: 'Connected from the office without drops.', followUpNote: 'Confirm with the user after a full day at home.' })
    return { fullPage: false }
  })

  state('actions-taken', 'validation', null, async (page) => {
    await openLog(page)
    await recordDialog(page)
    await dialog(page).getByRole('button', { name: 'Save action' }).click()
    await expect(dialog(page).getByText('3 fields need attention')).toBeVisible()
    return { fullPage: false }
  })

  state('actions-taken', 'edit', null, async (page) => {
    await openLog(page)
    await rowMenu(page, 'Edit', firstRow(page))
    await expect(dialog(page).getByRole('heading', { name: 'Edit action' })).toBeVisible()
    return { fullPage: false }
  })

  state('actions-taken', 'stale', null, async (page) => {
    const ticket = await openLog(page)
    await rowMenu(page, 'Edit', firstRow(page))
    await dialog(page).getByLabel(/^Result/).fill('Stable all day in the office and at home.')
    // Another staff member saves the same action behind this dialog.
    const request = page.context().request
    const [stored] = (await (await request.get(`${API}/staff/tickets/${ticket.id}/actions`)).json()) as { id: number; version: number }[]
    await signInAs(request, 'admin')
    expect((await request.patch(`${API}/staff/tickets/${ticket.id}/actions/${stored.id}`, { data: { expectedVersion: stored.version, result: 'Stable at home too, confirmed by phone.' } })).status()).toBe(200)
    await signInAs(page, 'staff')
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page).getByText('Someone else saved this action while you were editing.')).toBeVisible()
    return { fullPage: false }
  })

  state('actions-taken', 'complete-follow-up', null, async (page) => {
    await openLog(page)
    await rowMenu(page, 'Mark follow-up done', firstRow(page))
    await expect(dialog(page).getByRole('button', { name: 'Mark done' })).toBeVisible()
    return { fullPage: false }
  })

  state('actions-taken', 'void-dialog', null, async (page) => {
    await openLog(page)
    await rowMenu(page, 'Void', firstRow(page))
    await dialog(page).getByLabel(/^Reason for voiding/).fill('Duplicate of the action recorded by Malee.')
    return { fullPage: false }
  })

  state('actions-taken', 'voided', null, async (page) => {
    await openLog(page)
    const voided = actionsPanel(page).locator('tr.zen-action-voided')
    await voided.locator('summary').click()
    await expect(voided.getByText('Voided by')).toBeVisible()
  })

  state('actions-taken', 'not-actionable', null, async (page) => {
    const ticket = await ticketFixture(page.context().request, summary('shared mailbox permissions restored'), { owner: 'staff' })
    await addAction(page.context().request, 'staff', ticket.id, { description: 'Restored Full Access on the shared mailbox.', result: 'The team can open the mailbox again.' })
    await staffWrite(page.context().request, 'staff', ticket.id, 'status', { status: 'RESOLVED' })
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await expect(actionsPanel(page).getByText('Reopen this ticket to record more work.')).toBeVisible()
  })

  state('actions-taken', 'requester-view', null, async (page) => {
    const ticket = await workLog(page)
    await signInAs(page, 'requester')
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByRole('region', { name: 'Work done by IT' }).getByRole('listitem')).toHaveCount(2)
    await settled(page)
  })

  state('actions-taken', 'greyscale', null, async (page) => {
    // AC-52: every state still reads in text when colour is gone.
    await openLog(page)
    await page.addStyleTag({ content: 'html { filter: grayscale(1); }' })
    await settled(page)
  })
})

// --- Ticket workflow ----------------------------------------------------------------------------------------------

/** A Ticket owned by staff with one completed action, so Resolve is offered. */
async function resolvable(page: Page) {
  const request = page.context().request
  const ticket = await ticketFixture(request, summary('label printer prints blank labels'), { owner: 'staff', itPriority: 'MEDIUM' })
  await addAction(request, 'staff', ticket.id, { description: 'Replaced the thermal ribbon and recalibrated the sensor.', result: 'Test labels print clearly.' })
  return ticket
}

test.describe('ticket workflow screenshots', () => {
  state('ticket-workflow', 'allowed-transitions', null, async (page) => {
    const ticket = await resolvable(page)
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await operations(page).getByLabel('Status', { exact: true }).focus()
    await expect(operations(page).getByText('Only permitted next statuses are listed.')).toBeVisible()
  })

  state('ticket-workflow', 'resolution-blocked', null, async (page) => {
    const ticket = await openLog(page)
    expect(ticket.id).toBeGreaterThan(0)
    await expect(operations(page).getByText('1 follow-up is still outstanding.')).toBeVisible()
  })

  state('ticket-workflow', 'resolve-confirm', null, async (page) => {
    const ticket = await resolvable(page)
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await operations(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Resolved' })
    await operations(page).getByRole('button', { name: 'Save status' }).click()
    await expect(dialog(page).getByRole('button', { name: 'Resolve ticket' })).toBeVisible()
    return { fullPage: false }
  })

  state('ticket-workflow', 'resolved', null, async (page) => {
    const ticket = await resolvable(page)
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await operations(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Resolved' })
    await operations(page).getByRole('button', { name: 'Save status' }).click()
    await dialog(page).getByRole('button', { name: 'Resolve ticket' }).click()
    await expect(badges(page)).toContainText('Resolved')
  })

  state('ticket-workflow', 'requester-flagged', null, async (page) => {
    const ticket = await resolvable(page)
    const request = page.context().request
    await signInAs(request, 'requester')
    expect((await request.post(`${API}/tickets/${ticket.id}/appears-resolved`, { data: {} })).status()).toBe(200)
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await expect(operations(page).getByText('The Requester says this problem appears resolved. Review Actions Taken first.')).toBeVisible()
  })

  state('ticket-workflow', 'stale-ticket', null, async (page) => {
    const ticket = await resolvable(page)
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    // Another staff member raises the priority behind this screen.
    await staffWrite(page.context().request, 'otherStaff', ticket.id, 'priority', { itPriority: 'URGENT' })
    await signInAs(page, 'staff')
    await operations(page).getByLabel('Status', { exact: true }).selectOption({ label: 'In Progress' })
    await operations(page).getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText('You tried: In Progress')).toBeVisible()
  })

  state('ticket-workflow', 'reopened', null, async (page) => {
    const ticket = await resolvable(page)
    await staffWrite(page.context().request, 'staff', ticket.id, 'status', { status: 'RESOLVED' })
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await operations(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Reopened' })
    await operations(page).getByRole('button', { name: 'Save status' }).click()
    await expect(badges(page)).toContainText('Reopened')
    await expect(actionsPanel(page).getByRole('button', { name: 'Record action' })).toBeVisible()
  })
})

// --- RESP-06 ------------------------------------------------------------------------------------------------------

test.describe('RESP-06 screenshot inventory (DoD, ui-spec §14)', () => {
  test('every documented state exists at desktop, tablet, and mobile', () => {
    const missing = Object.entries(INVENTORY)
      .flatMap(([folder, states]) =>
        states.flatMap((name) => (ONLY_DESKTOP.has(name) ? ['desktop'] : VIEWPORT_NAMES).map((viewport) => path.join(folder, `${name}.${viewport}.png`))),
      )
      .filter((file) => !fs.existsSync(path.join(ROOT, file)))

    expect(missing).toEqual([])
  })
})
