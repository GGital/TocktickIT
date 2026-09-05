import { expect, test } from '@playwright/test'
import { getRequesters, readTicketNumber, runTag } from './helpers'

/**
 * E2E-01 (AC-01 – AC-03, AC-08, AC-09): the whole requester slice in one pass —
 * choose a requester, create a ticket, and find that same ticket number again in
 * My Tickets and on Ticket Detail.
 */
test('E2E-01 select a requester, create a ticket, then find it again', async ({
  page,
  request,
}) => {
  const [requester] = await getRequesters(request)
  const summary = `${runTag()} laptop battery drains within thirty minutes`

  // --- Requester selection (AC-01, AC-50) ---
  await page.goto('/select-requester')
  await expect(page.getByRole('heading', { name: 'Select a Development Requester' })).toBeVisible()
  await expect(page.getByText(/not a login screen/i)).toBeVisible()
  await expect(page.getByText(/Authentication and role-based access arrive in Lab 3/i)).toBeVisible()

  const select = page.getByLabel(/Development Requester/)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await select.selectOption(String(requester.id))
  await page.getByRole('button', { name: 'Continue' }).click()

  // --- Shell shows the testing context, never a signed-in user (AC-03, BR-50) ---
  await expect(page).toHaveURL(/\/tickets$/)
  await expect(page.getByText('Testing as:')).toBeVisible()
  await expect(page.getByText(requester.fullName)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change Requester' })).toBeVisible()

  // --- Create Ticket (AC-08, AC-09) ---
  await page.getByRole('link', { name: 'Create Ticket' }).click()
  await expect(page.getByRole('heading', { name: 'Create Ticket' })).toBeVisible()

  // The system fields are shown but never editable.
  await expect(page.getByLabel('Ticket Number')).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Current Status')).toHaveValue('NEW')
  await expect(page.getByLabel('Requester')).toHaveValue(
    `${requester.fullName} — ${requester.department}`,
  )

  const category = page.getByLabel(/^Category/)
  await category.selectOption({ index: 1 })
  await page.getByLabel(/^Related System/).selectOption({ index: 1 })
  await page.getByLabel(/^Ticket Summary/).fill(summary)
  await page
    .getByLabel(/^Description/)
    .fill('The battery drops from full to fifteen percent within half an hour of light use.')
  await page.getByLabel('High', { exact: true }).check()

  await page.getByRole('button', { name: 'Submit Ticket' }).click()

  // The backend, not the client, produced this number (BR-01, BR-03).
  const ticketNumber = await readTicketNumber(page)
  await expect(page.getByRole('button', { name: 'View Ticket' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create Another' })).toBeVisible()

  // --- The same number appears in My Tickets ---
  await page.getByRole('button', { name: 'My Tickets' }).click()
  await page.getByLabel('Search').fill(ticketNumber)
  // filter({ hasText }) — getByRole has no hasText option and would match every row.
  const row = page.getByRole('table').getByRole('row').filter({ hasText: ticketNumber })
  await expect(row).toBeVisible()
  await expect(row).toContainText(summary)

  // --- and on Ticket Detail, opened from the list ---
  await row.getByRole('link', { name: ticketNumber }).click()
  await expect(page.getByRole('heading', { name: ticketNumber })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ticket information' })).toBeVisible()
  await expect(page.getByText(summary)).toBeVisible()

  // The badges appear twice — beside the heading and in the definition list — so
  // the assertion names which one it means.
  const information = page.locator('dl')
  await expect(information.getByText('HIGH')).toBeVisible()
  await expect(information.getByText('NEW')).toBeVisible()
})
