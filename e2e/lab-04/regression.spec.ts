import { expect, test, type Page, type Request } from '@playwright/test'
import { PDF_BYTES, fillTicketForm, readTicketNumber } from '../lab-02/helpers'
import {
  ACCOUNTS,
  PASSWORD,
  actionsPanel,
  badges,
  dialog,
  expectVisibleFocus,
  fillAction,
  getReferenceData,
  openStaffTicket,
  operations,
  runTag,
  signInAs,
  signInThroughUi,
  tabTo,
  ticketFixture,
  watchConsole,
} from './helpers'

/** The whole application, Labs 1 – 4, as each role uses it (tests.md §2.14, E2E-12 – E2E-14). */

const tag = runTag()
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
/** Text that would mean a screen was never finished (AC-43). */
const PLACEHOLDER = /not implemented|coming soon|placeholder|lorem ipsum|TODO/i

async function expectFinished(page: Page) {
  await page.waitForLoadState('networkidle')
  expect(await page.locator('main').innerText()).not.toMatch(PLACEHOLDER)
}

const conversation = (page: Page, name: string) => page.getByRole('region', { name })

test('E2E-12 the full Lab 1 – 4 walk-through per role, with zero console errors and no 404s (AC-43, AC-44, AC-47)', async ({ page }) => {
  test.setTimeout(180_000)
  const monitor = watchConsole(page)
  // Signed out, the app asks who is signed in and the API answers 401 by contract (Lab 3 api-spec); Chrome logs that
  // response as a failed resource. It is the only failure the walk-through expects.
  monitor.allow('/api/auth/me')
  await signInAs(page.request, 'requester')
  const { categories, systems } = await getReferenceData(page.request)
  await page.context().clearCookies()
  const summary = `${tag} laptop fan runs loudly during every video call`

  // --- Requester: sign in, dashboard, My Tickets, create, detail, attachment, comment ---
  await signInThroughUi(page, ACCOUNTS.requester.email, PASSWORD)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expectFinished(page)

  await nav(page).getByRole('link', { name: 'My Tickets' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My Tickets' })).toBeVisible()
  await expectFinished(page)

  await nav(page).getByRole('link', { name: 'Create Ticket' }).click()
  await fillTicketForm(page, {
    summary,
    description: 'The fan is loud from the moment a video call starts until it ends, even with nothing else open.',
    categoryId: categories[0].id,
    relatedSystemId: systems[0].id,
  })
  await page.getByRole('button', { name: 'Submit Ticket' }).click()
  const ticketNumber = await readTicketNumber(page)
  await page.getByRole('button', { name: 'View Ticket' }).click()
  await expect(page.getByRole('heading', { level: 1, name: ticketNumber })).toBeVisible()
  const ticketId = Number(page.url().match(/\/tickets\/(\d+)$/)![1])

  // The comment goes first: an upload re-reads the Ticket and moves focus, which a fill racing it would lose.
  const comments = conversation(page, 'Conversation')
  await expect(comments.getByText('No messages yet. Add a comment if you have more information.')).toBeVisible()
  await comments.getByLabel('Public — the Requester will see this.').fill('It happens on battery and on the charger.')
  await comments.getByRole('button', { name: 'Post comment' }).click()
  await expect(comments.getByRole('listitem').filter({ hasText: 'It happens on battery and on the charger.' })).toBeVisible()
  await page.getByLabel('Add attachment').setInputFiles({ name: 'fan-noise-report.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES })
  await expect(page.getByText('fan-noise-report.pdf')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Work done by IT' })).toContainText('IT has not recorded any work on this ticket yet.')
  await expectFinished(page)
  await page.getByRole('button', { name: 'Log out' }).click()

  // --- IT Staff: dashboard, queue, claim, internal note, action, public reply ---
  await signInThroughUi(page, ACCOUNTS.staff.email, PASSWORD)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expectFinished(page)
  await nav(page).getByRole('link', { name: 'Ticket Queue' }).click()
  await page.getByLabel('Search', { exact: true }).fill(ticketNumber)
  await page.getByRole('link', { name: ticketNumber }).locator('visible=true').first().click()
  await expect(operations(page)).toBeVisible()
  await operations(page).getByRole('button', { name: 'Claim' }).click()
  await expect(actionsPanel(page).getByRole('button', { name: 'Record action' })).toBeVisible()

  const notes = conversation(page, 'Internal Notes, not visible to the Requester')
  await notes.getByLabel('Internal — not visible to the Requester.').fill('Same model had a fan recall in August; check the serial number.')
  await notes.getByRole('button', { name: 'Post note' }).click()
  await expect(notes.getByRole('listitem').filter({ hasText: 'fan recall in August' })).toBeVisible()

  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  await fillAction(page, { description: 'Cleaned the fan and updated the BIOS fan curve.', result: 'Noticeably quieter on a 30-minute test call.' })
  await dialog(page).getByRole('button', { name: 'Save action' }).click()
  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()
  const replies = conversation(page, 'Public Comments')
  await replies.getByLabel('Public — the Requester will see this.').fill('We have cleaned the fan; please tell us how it sounds tomorrow.')
  await replies.getByRole('button', { name: 'Post comment' }).click()
  await expect(replies.getByRole('listitem').filter({ hasText: 'please tell us how it sounds' })).toBeVisible()
  await expectFinished(page)
  await page.getByRole('button', { name: 'Log out' }).click()

  // --- Requester again: the work is visible, the note is not ---
  await signInThroughUi(page, ACCOUNTS.requester.email, PASSWORD)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await page.goto(`/tickets/${ticketId}`)
  await expect(page.getByRole('region', { name: 'Work done by IT' })).toContainText('Cleaned the fan and updated the BIOS fan curve.')
  await expectFinished(page)
  await expect(page.getByText('fan recall in August')).toHaveCount(0)
  await page.getByRole('button', { name: 'Log out' }).click()

  // --- Administrator: dashboard with Accounts, User Management, an unknown route ---
  await signInThroughUi(page, ACCOUNTS.admin.email, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  await expectFinished(page)
  await nav(page).getByRole('link', { name: 'User Management' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'User Management' })).toBeVisible()
  await expectFinished(page)
  await page.goto('/no-such-screen')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expectFinished(page)

  monitor.check()
})

test.describe('E2E-13 rapid repeats and lost connections (AC-45, AC-46)', () => {
  /** Holds every matching write for `ms`, so a fast repeat lands while the first is still in flight. */
  const throttle = (page: Page, pattern: string, ms = 1500) =>
    page.route(pattern, async (route) => {
      if (route.request().method() === 'POST') await new Promise((resolve) => setTimeout(resolve, ms))
      await route.continue()
    })
  const posts = (page: Page, path: RegExp) => {
    const sent: Request[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && path.test(new URL(request.url()).pathname)) sent.push(request)
    })
    return sent
  }

  test('a triple click on a slow network creates one ticket, one action, and one comment', async ({ page }) => {
    await signInAs(page, 'requester')
    const { categories, systems } = await getReferenceData(page.request)
    const tickets = posts(page, /^\/api\/tickets$/)
    await throttle(page, '**/api/tickets')
    await page.goto('/tickets/new')
    await fillTicketForm(page, { summary: `${tag} triple click creates one ticket`, description: 'Submitted three times in a row on a slow line.', categoryId: categories[0].id, relatedSystemId: systems[0].id })
    await page.getByRole('button', { name: 'Submit Ticket' }).click({ clickCount: 3 })
    await readTicketNumber(page)
    expect(tickets).toHaveLength(1)

    const ticket = await ticketFixture(page.request, `${tag} triple click records one action`, { owner: 'staff' })
    await signInAs(page, 'staff')
    const actions = posts(page, /\/actions$/)
    const comments = posts(page, /\/comments$/)
    await throttle(page, '**/api/staff/tickets/*/actions')
    await throttle(page, '**/api/tickets/*/comments')
    await openStaffTicket(page, ticket.id)
    await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
    await fillAction(page, { description: 'Saved three times in a row on a slow line.', result: 'Recorded once.' })
    await dialog(page).getByRole('button', { name: 'Save action' }).click({ clickCount: 3 })
    await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()
    expect(actions).toHaveLength(1)

    const replies = conversation(page, 'Public Comments')
    await replies.getByLabel('Public — the Requester will see this.').fill('Posted three times in a row on a slow line.')
    await replies.getByRole('button', { name: 'Post comment' }).click({ clickCount: 3 })
    await expect(replies.getByRole('listitem').filter({ hasText: 'Posted three times in a row' })).toHaveCount(1)
    expect(comments).toHaveLength(1)
  })

  test('offline saves keep every value, and the resubmit succeeds', async ({ page, context }) => {
    await signInAs(page, 'requester')
    const { categories, systems } = await getReferenceData(page.request)
    const ticket = await ticketFixture(page.request, `${tag} offline action and comment`, { owner: 'staff' })

    // An action.
    await signInAs(page, 'staff')
    await openStaffTicket(page, ticket.id)
    await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
    const values = { description: 'Swapped the network cable while the line was down.', result: 'Link light back on.', followUpNote: 'Check the switch port logs tomorrow.' }
    await fillAction(page, values)
    await context.setOffline(true)
    await dialog(page).getByRole('button', { name: 'Save action' }).click()
    await expect(dialog(page).getByText('The action was not saved.')).toBeVisible()
    await expect(dialog(page).getByLabel(/^Action description/)).toHaveValue(values.description)
    await expect(dialog(page).getByLabel(/^Result/)).toHaveValue(values.result)
    await expect(dialog(page).getByLabel(/^Follow-up note/)).toHaveValue(values.followUpNote)
    await context.setOffline(false)
    await dialog(page).getByRole('button', { name: 'Try again' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()

    // A comment.
    const replies = conversation(page, 'Public Comments')
    await replies.getByLabel('Public — the Requester will see this.').fill('Written while offline, sent once back online.')
    await context.setOffline(true)
    await replies.getByRole('button', { name: 'Post comment' }).click()
    await expect(replies.getByText('The comment could not be posted.')).toBeVisible()
    await expect(replies.getByLabel('Public — the Requester will see this.')).toHaveValue('Written while offline, sent once back online.')
    await context.setOffline(false)
    await replies.getByRole('button', { name: 'Try again' }).click()
    await expect(replies.getByRole('listitem').filter({ hasText: 'Written while offline' })).toHaveCount(1)

    // A ticket.
    await signInAs(page, 'requester')
    await page.goto('/tickets/new')
    const form = { summary: `${tag} ticket written while offline`, description: 'Filled in on the train with no signal.', categoryId: categories[0].id, relatedSystemId: systems[0].id }
    await fillTicketForm(page, form)
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await expect(page.getByText('The ticket could not be submitted. Check your connection and try again.')).toBeVisible()
    await expect(page.getByLabel(/^Ticket Summary/)).toHaveValue(form.summary)
    await expect(page.getByLabel(/^Description/)).toHaveValue(form.description)
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await readTicketNumber(page)
  })
})

test('E2E-14 keyboard only: dashboard card, Queue, Ticket, action with follow-up, resolve (AC-51)', async ({ page }) => {
  test.setTimeout(120_000)
  const ticket = await ticketFixture(page.request, `${tag} keyboard-only path to resolve`, { owner: 'staff', itPriority: 'URGENT' })
  await signInAs(page, 'staff')
  await page.goto('/staff/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  const key = (name: string) => page.keyboard.press(name)

  await tabTo(page, page.getByRole('link', { name: /^Assigned to me: \d+\. View list$/ }))
  await key('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Ticket Queue' })).toBeVisible()
  await tabTo(page, page.getByLabel('Search', { exact: true }))
  await page.keyboard.type(ticket.ticketNumber)
  const row = page.getByRole('link', { name: ticket.ticketNumber }).locator('visible=true').first()
  await expect(row).toBeVisible()
  await tabTo(page, row)
  await key('Enter')
  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (0)' })).toBeVisible()

  // Record an action that needs a follow-up.
  await tabTo(page, actionsPanel(page).getByRole('button', { name: 'Record action' }))
  await key('Enter')
  const form = dialog(page)
  await expect(form.getByLabel(/^Action date and time/)).toBeFocused()
  await tabTo(page, form.getByLabel(/^Action description/))
  await page.keyboard.type('Reset the user profile from the keyboard.')
  await key('Tab')
  await page.keyboard.type('Profile loads again.')
  await tabTo(page, form.getByRole('radio', { name: 'No', exact: true }))
  await key('ArrowRight')
  await expect(form.getByRole('radio', { name: 'Yes', exact: true })).toBeChecked()
  await tabTo(page, form.getByLabel(/^Follow-up note/))
  await page.keyboard.type('Confirm with the user on Monday.')
  await tabTo(page, form.getByRole('button', { name: 'Save action' }))
  await key('Enter')
  await expect(form).toBeHidden()
  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()

  // Mark the follow-up done from the row menu, with arrow keys.
  await tabTo(page, actionsPanel(page).getByRole('button', { name: /^Actions for action recorded/ }).locator('visible=true').first())
  await key('Enter')
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
  await key('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Mark follow-up done' })).toBeFocused()
  await key('Enter')
  await tabTo(page, dialog(page).getByRole('button', { name: 'Mark done' }))
  await key('Enter')
  await expect(actionsPanel(page).locator('tbody tr').first()).toContainText('Follow-up done')

  // Resolve.
  const status = operations(page).getByLabel('Status', { exact: true })
  await expect(status.locator('option', { hasText: 'Resolved' })).toHaveCount(1)
  await tabTo(page, status)
  await page.keyboard.type('Resolved')
  await expect(status).toHaveValue('RESOLVED')
  await tabTo(page, operations(page).getByRole('button', { name: 'Save status' }))
  await key('Enter')
  await tabTo(page, dialog(page).getByRole('button', { name: 'Resolve ticket' }))
  await key('Enter')
  await expect(badges(page)).toContainText('Resolved')
  await expectVisibleFocus(page)
})
