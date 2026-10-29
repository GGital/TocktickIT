import { expect, test, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  actionsPanel,
  addAction,
  dialog,
  fillAction,
  openStaffTicket,
  operations,
  rowMenu,
  runTag,
  signInAs,
  ticketFixture,
} from './helpers'

/** Lab 4 Actions Taken in a real browser (tests.md §2.14, E2E-01 – E2E-04). */

const tag = runTag()
const rows = (page: Page) => actionsPanel(page).locator('tbody tr')
const performers = (page: Page) => actionsPanel(page).locator('td[data-label="Performed by"] > span').allTextContents()

async function recordThroughUi(page: Page, values: Parameters<typeof fillAction>[1]) {
  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Record action' })).toBeVisible()
  await fillAction(page, values)
  await dialog(page).getByRole('button', { name: 'Save action' }).click()
  await expect(dialog(page)).toBeHidden()
}

test('E2E-01 the owner and a second staff member each record an action on one Ticket (AC-01, AC-05)', async ({ page }) => {
  const ticket = await ticketFixture(page.request, `${tag} printer on floor 3 jams on every duplex job`, { owner: 'staff' })

  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)
  await recordThroughUi(page, { description: 'Cleared the duplex unit and replaced the worn pickup roller.', result: 'Duplex jobs print again.' })
  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()

  // A second staff member, not the owner, records their own work on the same Ticket.
  await signInAs(page, 'otherStaff')
  await openStaffTicket(page, ticket.id)
  await recordThroughUi(page, { description: 'Updated the printer firmware to 5.1 to fix the duplex timing bug.', result: 'No jams over 40 test pages.' })

  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (2)' })).toBeVisible()
  await expect(rows(page)).toHaveCount(2)
  expect(await performers(page)).toEqual([ACCOUNTS.staff.fullName, 'You'])
  // Recording work never moves ownership (AC-05).
  await expect(operations(page).getByLabel('Ticket owner')).toHaveValue(String((await signInAs(page.request, 'staff')).id))
})

test('E2E-02 empty submit, then follow-up Yes without a note, then a valid save (AC-03, AC-39)', async ({ page }) => {
  const ticket = await ticketFixture(page.request, `${tag} shared calendar invites arrive an hour late`, { owner: 'staff' })
  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)

  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  const form = dialog(page)
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(form.getByText('3 fields need attention')).toBeVisible()
  await expect(form.getByText('Describe the action in up to 2000 characters.')).toBeVisible()
  await expect(form.getByText('Enter the result in up to 1000 characters.')).toBeVisible()
  await expect(form.getByText('Choose whether follow-up is required.')).toBeVisible()
  // The note is not asked for until Yes is chosen.
  await expect(form.getByLabel(/^Follow-up note/)).toHaveCount(0)

  await form.getByLabel(/^Action description/).fill('Moved the shared calendar to the Bangkok time zone.')
  await form.getByLabel(/^Result/).fill('New invites arrive on time; old ones still need re-sending.')
  await form.getByRole('radio', { name: 'Yes', exact: true }).check()
  await expect(form.getByLabel(/^Follow-up note/)).toBeVisible()
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(form.getByText('Describe the follow-up that is needed.')).toBeVisible()
  await expect(form.getByLabel(/^Action description/)).toHaveValue('Moved the shared calendar to the Bangkok time zone.')

  await form.getByLabel(/^Follow-up note/).fill('Ask the team lead to re-send the recurring invites on Monday.')
  await form.getByRole('button', { name: 'Save action' }).click()
  await expect(form).toBeHidden()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Follow-up outstanding')
})

test('E2E-03 two browser contexts edit the same action; the second keeps its changes knowingly (AC-09, AC-11)', async ({ browser, request }) => {
  const ticket = await ticketFixture(request, `${tag} VPN profile missing on new laptops`, { owner: 'staff' })
  await addAction(request, 'staff', ticket.id, { description: 'Pushed the VPN profile through device management.', result: 'Installed on two of five laptops.' })

  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [owner, admin] = await Promise.all(contexts.map((context) => context.newPage()))
  await signInAs(owner, 'staff')
  await signInAs(admin, 'admin')
  for (const page of [owner, admin]) {
    await openStaffTicket(page, ticket.id)
    await rowMenu(page, 'Edit')
    await expect(dialog(page).getByRole('heading', { name: 'Edit action' })).toBeVisible()
  }

  await owner.getByLabel(/^Result/).fill('Installed on all five laptops after a restart.')
  await owner.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog(owner)).toBeHidden()

  // The Administrator's form still holds the version both opened.
  await admin.getByLabel(/^Result/).fill('Installed on four laptops; one is waiting for its owner to return.')
  await admin.getByRole('button', { name: 'Save changes' }).click()
  const stale = dialog(admin).getByRole('alert').filter({ hasText: 'Someone else saved this action while you were editing.' })
  await expect(stale).toBeVisible()
  await expect(stale).toContainText('Installed on all five laptops after a restart.')
  await stale.getByRole('button', { name: 'Keep my changes' }).click()
  await expect(dialog(admin)).toBeHidden()

  await expect(rows(admin).first()).toContainText('Installed on four laptops')
  await expect(rows(admin).first()).toContainText(`Edited by ${ACCOUNTS.admin.fullName}`)
  await Promise.all(contexts.map((context) => context.close()))
})

test('E2E-04 a voided action stays in the staff view and is absent for the Requester (AC-14, AC-16)', async ({ page }) => {
  const ticket = await ticketFixture(page.request, `${tag} meeting room display shows no signal`, { owner: 'staff' })
  await addAction(page.request, 'staff', ticket.id, { description: 'Replaced the HDMI cable behind the display.', result: 'Signal back on the display.' })
  await addAction(page.request, 'staff', ticket.id, { description: 'Logged the wrong room by mistake.', result: 'Not applicable.' })

  await signInAs(page, 'staff')
  await openStaffTicket(page, ticket.id)
  await rowMenu(page, 'Void', rows(page).filter({ hasText: 'Logged the wrong room by mistake.' }))
  const voidDialog = dialog(page)
  await expect(voidDialog.getByRole('button', { name: 'Void action' })).toBeDisabled()
  await voidDialog.getByLabel(/^Reason for voiding/).fill('Recorded on the wrong ticket.')
  await voidDialog.getByRole('button', { name: 'Void action' }).click()
  await expect(voidDialog).toBeHidden()

  await expect(actionsPanel(page).getByRole('heading', { name: 'Actions Taken (1)' })).toBeVisible()
  const voided = rows(page).filter({ hasText: 'Voided' })
  await expect(voided).toContainText('"Recorded on the wrong ticket."')

  await signInAs(page, 'requester')
  await page.goto(`/tickets/${ticket.id}`)
  const work = page.getByRole('region', { name: 'Work done by IT' })
  await expect(work.getByRole('listitem')).toHaveCount(1)
  await expect(work).toContainText('Replaced the HDMI cable behind the display.')
  await expect(work).not.toContainText('Logged the wrong room by mistake.')
  // Read-only for the Requester: nothing in the list can change an action.
  await expect(work.getByRole('button')).toHaveCount(0)
})
