import { expect, test, type Page } from '@playwright/test'
import { cardCount, createUserReady, listResponses, removeFixtureUsers, runTag, signInAs, type AccountName } from './helpers'

/**
 * Dashboard counts against the lists they open (tests.md §2.14, E2E-09 – E2E-11). Each card's number is compared
 * with what the drill-down list itself received from the API, after the list has applied the card's filters.
 */

const tag = runTag().toLowerCase()

test.afterAll(async () => {
  await removeFixtureUsers()
})

type Drill = { label: string; home: string; list: (url: URL) => boolean; heading: string; rows?: (body: unknown) => number }

const myTickets = (url: URL) => url.pathname === '/api/tickets'
// The Queue's three summary counts ask for pageSize=10; the list itself does not.
const queue = (url: URL) => url.pathname === '/api/staff/tickets' && url.searchParams.get('pageSize') !== '10'
const users = (url: URL) => url.pathname === '/api/admin/users'
const total = (body: unknown) => (body as { meta: { totalItems: number } }).meta.totalItems

/** Opens the card from its dashboard and checks the list total, the Showing line, and that the filters are visible. */
async function drillDown(page: Page, { label, home, list, heading, rows = total }: Drill) {
  const responses = listResponses(page, list)
  await page.goto(home)
  const { card, count } = await cardCount(page, label)
  responses.reset()
  await card.click()

  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  expect(rows(await (await responses.latest()).json()), `${label}: card ${count}`).toBe(count)
  await expect(page.getByText(`Showing: ${label}`)).toBeVisible()
  if (count > 0 && rows === total) await expect(page.getByText(new RegExp(`of ${count}$`)).first()).toBeVisible()
  return count
}

test('E2E-09 Requester dashboard counts equal My Tickets after each drill-down (AC-29, AC-37)', async ({ page }) => {
  await signInAs(page, 'requester')
  for (const label of ['Waiting for you', 'Open tickets', 'Resolved — please check']) {
    await drillDown(page, { label, home: '/dashboard', list: myTickets, heading: 'My Tickets' })
    // The card's statuses are applied as visible, pressed chips (AC-37).
    const pressed = page.getByRole('group', { name: 'Current Status' }).locator('button[aria-pressed="true"]')
    expect(await pressed.count()).toBeGreaterThan(0)
  }
})

const STAFF_CARDS = ['Unassigned tickets', 'Assigned to me', 'Urgent and active', 'Requester says resolved', 'My follow-ups']

for (const as of ['staff', 'admin'] as AccountName[]) {
  test(`E2E-10 ${as === 'staff' ? 'IT Staff' : 'Administrator'} dashboard counts equal the Queue (AC-30, AC-35, AC-37)`, async ({ page }) => {
    await signInAs(page, as)
    // "New today" opens the Queue newest first, not filtered: the Queue has no created-date filter (A-14).
    for (const label of STAFF_CARDS) await drillDown(page, { label, home: '/staff/dashboard', list: queue, heading: 'Ticket Queue' })

    await page.goto('/staff/dashboard')
    await expect(page.getByRole('link', { name: /^Unassigned tickets: \d+\. View list$/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toHaveCount(as === 'admin' ? 1 : 0)
  })
}

test('E2E-10 Administrator Accounts cards open User Management filtered by role (AC-35, AC-37)', async ({ page }) => {
  await signInAs(page, 'admin')
  type User = { role: string; isActive: boolean }
  for (const [label, role] of [['Active Requesters', 'REQUESTER'], ['Active IT Staff', 'IT_STAFF'], ['Active Administrators', 'ADMINISTRATOR']] as const) {
    // The list shows the whole role, active and inactive, so the card is compared with its active rows.
    await drillDown(page, { label, home: '/staff/dashboard', list: users, heading: 'User Management', rows: (body) => (body as User[]).filter((user) => user.isActive).length })
    await expect(page).toHaveURL(new RegExp(`/admin/users\\?role=${role}$`))
    await expect(page.getByLabel('Role', { exact: true })).toHaveValue(role)
  }

  // No single filter matches "inactive", so that card opens the full list (A-14) and is compared with its inactive rows.
  await page.goto('/staff/dashboard')
  const card = page.getByRole('link', { name: /^Inactive: \d+, must change password: \d+\. View list$/ })
  const inactive = Number((await card.getAttribute('aria-label'))!.match(/^Inactive: (\d+)/)![1])
  const responses = listResponses(page, users)
  await card.click()
  expect(((await (await responses.latest()).json()) as User[]).filter((user) => !user.isActive)).toHaveLength(inactive)
})

test('E2E-11 all-zero accounts render zero states; a failed dashboard offers a working Try again (AC-31, AC-38)', async ({ page }) => {
  // A Requester with no Tickets at all.
  const newcomer = await createUserReady(page.request, { key: `newcomer.${tag}`, fullName: 'Waraporn Newcomer', role: 'REQUESTER' })
  await signInAs(page, newcomer)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'You have not raised any tickets yet.' })).toBeVisible()
  for (const label of ['Waiting for you', 'Open tickets', 'Resolved — please check']) {
    const { card, count } = await cardCount(page, label)
    expect(count).toBe(0)
    // Zero is an answer, not a failure: the card keeps its link (BR-51).
    await expect(card).toHaveAttribute('href', /^\/tickets\?/)
  }

  // A new IT Staff member: nothing is theirs yet, whatever the desk holds.
  const starter = await createUserReady(page.request, { key: `starter.${tag}`, fullName: 'Kanya Starter', role: 'IT_STAFF' })
  await signInAs(page, starter)
  await page.goto('/staff/dashboard')
  expect((await cardCount(page, 'Assigned to me')).count).toBe(0)
  expect((await cardCount(page, 'My follow-ups')).count).toBe(0)
  await expect(page.getByText('You have not recorded any actions yet.')).toBeVisible()

  // The dashboard request fails once, then Try again loads it.
  await signInAs(page, 'requester')
  await page.route('**/api/dashboard/requester', (route) => route.abort('failed'))
  await page.goto('/dashboard')
  await expect(page.getByText('We could not load your dashboard.')).toBeVisible()
  await page.unroute('**/api/dashboard/requester')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: /^Open tickets: \d+\. View list$/ })).toBeVisible()
  await expect(page.getByText('We could not load your dashboard.')).toBeHidden()
})
