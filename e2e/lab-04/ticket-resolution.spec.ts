import { expect, test, type Page } from '@playwright/test'
import {
  API,
  actionsPanel,
  badges,
  changeStatus,
  createUserReady,
  dialog,
  fillAction,
  openStaffTicket,
  operations,
  removeFixtureUsers,
  rowMenu,
  runTag,
  signInAs,
  ticketFixture,
} from './helpers'

/** The Lab 4 workflow and resolution gate in a real browser (tests.md §2.14, E2E-05 – E2E-08). */

const tag = runTag()
// A status on load and an alert after a refused save, so it is found by its id rather than its role.
const blockers = (page: Page) => operations(page).locator('#resolution-blockers')
const statusOptions = (page: Page) => operations(page).getByLabel('Status', { exact: true }).locator('option').allTextContents()

test.afterAll(async () => {
  await removeFixtureUsers()
})

test('E2E-05 blocked, follow-up done, resolve, close, reopen (AC-20, AC-22, AC-24, AC-40)', async ({ page }) => {
  const ticket = await ticketFixture(page.request, `${tag} accounting app freezes when exporting to Excel`, { owner: 'staff' })
  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)

  // No work yet: the gate says why in words, and Resolve is not offered.
  await expect(blockers(page)).toContainText('No action has been recorded.')
  expect(await statusOptions(page)).not.toContain('Resolved')

  // Work with a follow-up still blocks, for a different reason.
  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  await fillAction(page, {
    description: 'Installed the vendor hotfix for the Excel export.',
    result: 'Export works for small reports; large ones still need testing.',
    followUpNote: 'Test a year-end export with the finance team on Friday.',
  })
  await dialog(page).getByRole('button', { name: 'Save action' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(blockers(page)).toContainText('1 follow-up is still outstanding.')
  await expect(blockers(page)).not.toContainText('No action has been recorded.')
  expect(await statusOptions(page)).not.toContain('Resolved')

  // Marking the follow-up done lifts the gate; the summary and controls refresh from the Ticket.
  await rowMenu(page, 'Mark follow-up done')
  await dialog(page).getByRole('button', { name: 'Mark done' }).click()
  await expect(actionsPanel(page).locator('tbody tr').first()).toContainText('Follow-up done')
  await expect(blockers(page)).toBeHidden()
  expect(await statusOptions(page)).toContain('Resolved')

  await operations(page).getByLabel('Status', { exact: true }).selectOption({ label: 'Resolved' })
  await operations(page).getByRole('button', { name: 'Save status' }).click()
  await expect(dialog(page)).toContainText('1 action recorded, no follow-ups outstanding.')
  await dialog(page).getByRole('button', { name: 'Resolve ticket' }).click()
  await expect(badges(page)).toContainText('Resolved')
  await expect(actionsPanel(page).getByText('Reopen this ticket to record more work.')).toBeVisible()
  await expect(actionsPanel(page).getByRole('button', { name: 'Record action' })).toHaveCount(0)

  await changeStatus(page, 'Closed', 'Close ticket')
  await changeStatus(page, 'Reopened')
  // Reopened is actionable again (AC-40).
  await expect(actionsPanel(page).getByRole('button', { name: 'Record action' })).toBeVisible()
})

test('E2E-06 a Requester flag is shown to staff, but neither changes the status nor passes the gate (AC-23)', async ({ page }) => {
  const ticket = await ticketFixture(page.request, `${tag} webcam not detected after the docking station update`, { owner: 'staff' })

  await signInAs(page, 'requester')
  await page.goto(`/tickets/${ticket.id}`)
  await page.getByRole('button', { name: 'Problem appears resolved' }).click()
  await dialog(page).getByRole('button', { name: 'Tell IT it’s resolved' }).click()
  await expect(page.getByText(/^Reported /)).toBeVisible()

  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)
  await expect(operations(page).getByText('The Requester says this problem appears resolved. Review Actions Taken first.')).toBeVisible()
  await expect(badges(page)).toContainText('Open')
  await expect(blockers(page)).toContainText('No action has been recorded.')
  expect(await statusOptions(page)).not.toContain('Resolved')
})

test('E2E-07 cancel a Ticket with no actions; an inactive user cannot be made owner (AC-19, A-20)', async ({ page, browser }) => {
  // Cancelling needs no recorded work, only a confirmation.
  const unworked = await ticketFixture(page.request, `${tag} duplicate request for a second monitor`)
  await signInAs(page, 'staff')
  await openStaffTicket(page, unworked.id)
  await changeStatus(page, 'Cancelled', 'Cancel ticket')
  await expect(operations(page).getByText('Cancelled is final; no further status change is possible.')).toBeVisible()

  // An eligible owner when the screen loaded, deactivated by an Administrator before it is chosen.
  const leaver = await createUserReady(page.request, { key: `leaver.${tag.toLowerCase()}`, fullName: 'Prasert Leaving', role: 'IT_STAFF' })
  const ticket = await ticketFixture(page.request, `${tag} keyboard missing keys on reception desk`, { owner: 'staff' })
  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)
  const owner = operations(page).getByLabel('Ticket owner')
  await expect(owner.locator('option', { hasText: 'Prasert Leaving' })).toHaveCount(1)
  // The seeded inactive account is never offered at all.
  await expect(owner.locator('option', { hasText: 'Somchai Retired' })).toHaveCount(0)

  const admin = await browser.newContext()
  await signInAs(admin.request, 'admin')
  expect((await admin.request.patch(`${API}/admin/users/${leaver.id}`, { data: { isActive: false } })).status()).toBe(200)
  await admin.close()

  await owner.selectOption({ label: 'Prasert Leaving' })
  await expect(page.getByText('That person cannot own a ticket.')).toBeVisible()
  await expect(owner).toHaveValue(String((await (await page.request.get(`${API}/auth/me`)).json()).id))
})

test('E2E-08 two contexts change priority and status from the same version (AC-26)', async ({ browser, request }) => {
  const ticket = await ticketFixture(request, `${tag} file share mapped to the wrong drive letter`, { owner: 'staff' })
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [first, second] = await Promise.all(contexts.map((context) => context.newPage()))
  await signInAs(first, 'staff')
  await signInAs(second, 'otherStaff')
  await openStaffTicket(first, ticket.id)
  await openStaffTicket(second, ticket.id)

  await operations(first).getByRole('radio', { name: 'Urgent', exact: true }).check()
  await expect(badges(first)).toContainText('IT: URGENT')

  // The second screen still holds the version both opened.
  await operations(second).getByLabel('Status', { exact: true }).selectOption({ label: 'In Progress' })
  await operations(second).getByRole('button', { name: 'Save status' }).click()
  const stale = second.getByRole('alert').filter({ hasText: 'This ticket changed since you opened it.' })
  await expect(stale).toContainText('You tried: In Progress')
  // The latest Ticket is shown, unchanged by the refused write.
  await expect(badges(second)).toContainText('IT: URGENT')
  await expect(badges(second)).toContainText('Open')
  await Promise.all(contexts.map((context) => context.close()))
})
