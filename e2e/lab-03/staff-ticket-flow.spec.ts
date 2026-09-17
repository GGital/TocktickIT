import { expect, test, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  API,
  type Account,
  createTicket,
  getReferenceData,
  runTag,
  signInAs,
  staffPatch,
} from './helpers'

type Reference = Awaited<ReturnType<typeof getReferenceData>>

const newTicket = (request: Parameters<typeof createTicket>[0], reference: Reference, summary: string, account: Account = ACCOUNTS.requester, requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM') =>
  createTicket(request, account, {
    summary,
    description: `${summary}. Created by the Lab 3 staff flow suite with enough detail to read like a real request.`,
    categoryId: reference.categories[0].id,
    relatedSystemId: reference.systems[0].id,
    requestedPriority,
  })

const badges = (page: Page) => page.getByTestId('ticket-badges')
const queueRows = (page: Page) => page.locator('table.zen-queue tbody tr.zen-queue-row')

test.describe('E2E-04 Queue search, filters, sort, and paging (AC-28 – AC-35)', () => {
  test('realistic data narrows correctly, orders as documented, pages, and a row opens Ticket Detail', async ({ page, request }) => {
    const tag = runTag()
    await signInAs(request, 'requester')
    const reference = await getReferenceData(request)

    // Twelve Tickets from two Requesters, with a spread of IT Priorities set by staff.
    const itPriorities = ['URGENT', 'LOW', 'HIGH', 'MEDIUM', 'URGENT', 'LOW', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH', 'LOW'] as const
    const tickets: { id: number; ticketNumber: string; itPriority: string }[] = []
    for (const [index, itPriority] of itPriorities.entries()) {
      const account = index % 2 === 0 ? ACCOUNTS.requester : ACCOUNTS.otherRequester
      const ticket = await newTicket(request, reference, `${tag} queue ticket ${String(index + 1).padStart(2, '0')} printer queue stalls`, account)
      await staffPatch(request, ticket.id, 'priority', { itPriority })
      tickets.push({ ...ticket, itPriority })
    }

    await signInAs(page, 'staff')
    await page.goto('/staff/tickets')
    await page.getByLabel('Search', { exact: true }).fill(tag)
    // All twelve, from both Requesters: staff see every Requester's Tickets (AC-28).
    await expect(queueRows(page)).toHaveCount(12)

    // Default order: IT Priority descending, then oldest first (BR-61).
    const firstBadges = await queueRows(page).locator('.zen-badge').filter({ hasText: /^IT:/ }).allTextContents()
    const rank = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>
    const ranks = firstBadges.map((text) => rank[text.replace(/^IT:\s*/, '').replace(/[▲\s]/g, '')])
    expect(ranks, 'IT Priority descending').toEqual([...ranks].sort((a, b) => b - a))

    // Filter: IT Priority URGENT narrows to exactly the two urgent Tickets.
    await page.getByLabel('IT Priority').selectOption('URGENT')
    await expect(queueRows(page)).toHaveCount(2)
    await expect(page).toHaveURL(/itPriority=URGENT/)
    await page.getByRole('button', { name: 'Clear filters' }).first().click()
    await page.getByLabel('Search', { exact: true }).fill(tag)
    await expect(queueRows(page)).toHaveCount(12)

    // Sort by Ticket Number, ascending, from the server.
    await page.getByRole('button', { name: /^Ticket Number/ }).click()
    await expect(page).toHaveURL(/sortBy=ticketNumber&sortOrder=asc/)
    await expect(page.getByRole('columnheader', { name: /Ticket Number/ })).toHaveAttribute('aria-sort', 'ascending')
    const numbers = await queueRows(page).locator('td:first-child').allTextContents()
    expect(numbers).toEqual([...numbers].sort())

    // Paging: ten per page leaves two on page 2.
    await page.getByLabel('Per page').selectOption('10')
    await expect(queueRows(page)).toHaveCount(10)
    await page.getByRole('button', { name: 'Page 2' }).click()
    await expect(queueRows(page)).toHaveCount(2)
    await expect(page).toHaveURL(/page=2/)

    // A row opens Ticket Detail.
    const last = [...tickets].sort((a, b) => a.ticketNumber.localeCompare(b.ticketNumber)).at(-1)!
    await queueRows(page).filter({ hasText: last.ticketNumber }).locator('td').nth(2).click()
    await expect(page).toHaveURL(new RegExp(`/staff/tickets/${last.id}$`))
    await expect(page.getByRole('heading', { name: last.ticketNumber })).toBeVisible()
  })
})

test.describe('E2E-05 claim, prioritise, advance, and resolve (AC-36, AC-39, AC-41, AC-44)', () => {
  test('claiming opens the Ticket; both priorities stay distinct; resolving needs its confirmation', async ({ page, request }) => {
    const tag = runTag()
    await signInAs(request, 'requester')
    const reference = await getReferenceData(request)
    const ticket = await newTicket(request, reference, `${tag} shared drive mapping lost after update`, ACCOUNTS.requester, 'LOW')

    await signInAs(page, 'staff')
    await page.goto(`/staff/tickets/${ticket.id}`)
    await expect(badges(page)).toContainText('New')

    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(badges(page)).toContainText('Open')
    await expect(page.getByLabel('Ticket owner')).toHaveValue(/\d+/)
    await expect(page.getByRole('button', { name: 'Claim' })).toHaveCount(0)

    await page.getByRole('radio', { name: 'Urgent', exact: true }).check()
    await expect(badges(page).getByText('IT: URGENT')).toBeVisible()
    await expect(badges(page).getByText('Requested: LOW')).toBeVisible()

    await page.getByLabel('Status', { exact: true }).selectOption('IN_PROGRESS')
    await page.getByRole('button', { name: 'Save status' }).click()
    await expect(badges(page)).toContainText('In Progress')

    await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
    await page.getByRole('button', { name: 'Save status' }).click()
    const dialog = page.getByRole('dialog', { name: `Resolve ticket ${ticket.ticketNumber}?` })
    await expect(dialog).toBeVisible()

    // Nothing is sent until the confirmation: the stored status is still In Progress.
    await signInAs(request, 'staff')
    expect((await (await request.get(`${API}/staff/tickets/${ticket.id}`)).json()).status).toBe('IN_PROGRESS')

    await dialog.getByRole('button', { name: 'Keep current status' }).click()
    await expect(dialog).toBeHidden()
    expect((await (await request.get(`${API}/staff/tickets/${ticket.id}`)).json()).status).toBe('IN_PROGRESS')

    await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
    await page.getByRole('button', { name: 'Save status' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Resolve ticket' }).click()
    await expect(badges(page)).toContainText('Resolved')

    const stored = await (await request.get(`${API}/staff/tickets/${ticket.id}`)).json()
    expect(stored).toMatchObject({ status: 'RESOLVED', itPriority: 'URGENT', requestedPriority: 'LOW', assignee: { fullName: ACCOUNTS.staff.fullName } })
  })
})

test.describe('E2E-06 a Public Comment reaches the Requester; an Internal Note never does (AC-46, AC-47, BR-40)', () => {
  test('the Requester sees the comment, and neither the page nor any network response carries the note', async ({ browser, page, request }) => {
    const tag = runTag()
    const note = `${tag} internal: vendor case 55120 escalated to tier two`
    const comment = `${tag} We have reset your VPN profile; please sign in again.`
    await signInAs(request, 'requester')
    const reference = await getReferenceData(request)
    const ticket = await newTicket(request, reference, `${tag} VPN profile rejected on sign-in`)

    await signInAs(page, 'staff')
    await page.goto(`/staff/tickets/${ticket.id}`)
    const publicPanel = page.getByRole('region', { name: 'Public Comments' })
    const internal = page.getByRole('region', { name: 'Internal Notes, not visible to the Requester' })
    await publicPanel.getByLabel('Public — the Requester will see this.').fill(comment)
    await publicPanel.getByRole('button', { name: 'Post comment' }).click()
    await expect(publicPanel.getByRole('listitem').filter({ hasText: comment })).toBeVisible()
    await internal.getByLabel('Internal — not visible to the Requester.').fill(note)
    await internal.getByRole('button', { name: 'Post note' }).click()
    await expect(internal.getByRole('listitem').filter({ hasText: note })).toBeVisible()

    const requesterContext = await browser.newContext()
    const requesterPage = await requesterContext.newPage()
    const bodies: string[] = []
    requesterPage.on('response', async (response) => {
      if (response.url().includes('/api/')) bodies.push(await response.text().catch(() => ''))
    })
    await signInAs(requesterPage, 'requester')
    await requesterPage.goto(`/tickets/${ticket.id}`)

    const conversation = requesterPage.getByRole('region', { name: 'Conversation' })
    await expect(conversation.getByRole('listitem').filter({ hasText: comment })).toBeVisible()
    await requesterPage.waitForLoadState('networkidle')

    expect(await requesterPage.content()).not.toContain(note)
    expect(await requesterPage.content()).not.toMatch(/internal note/i)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) expect(body).not.toContain(note)
    await requesterContext.close()
  })
})

test.describe('E2E-07 "Problem appears resolved" reaches staff (AC-50, BR-46)', () => {
  test('the flag shows on the Queue row and Ticket Detail, the status is unchanged, and it cannot be sent twice', async ({ browser, page, request }) => {
    const tag = runTag()
    await signInAs(request, 'requester')
    const reference = await getReferenceData(request)
    const ticket = await newTicket(request, reference, `${tag} monitor flickers after docking`)
    await staffPatch(request, ticket.id, 'assignment', { assigneeId: 'me' })

    await signInAs(page, 'requester')
    await page.goto(`/tickets/${ticket.id}`)
    const conversation = page.getByRole('region', { name: 'Conversation' })
    await conversation.getByRole('button', { name: 'Problem appears resolved' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Tell IT it’s resolved' }).click()
    await expect(conversation.getByText('Requester says resolved')).toBeVisible()
    await expect(conversation.getByRole('button', { name: 'Problem appears resolved' })).toHaveCount(0)
    await expect(conversation.getByRole('listitem').filter({ hasText: 'System message' })).toBeVisible()

    // A second flag is refused by the API; the screen offers no way to send one.
    const repeat = await page.request.post(`${API}/tickets/${ticket.id}/appears-resolved`, { data: {} })
    expect(repeat.status()).toBe(409)
    expect((await repeat.json()).error.code).toBe('ALREADY_FLAGGED')

    const staffContext = await browser.newContext()
    const staffPage = await staffContext.newPage()
    await signInAs(staffPage, 'staff')
    await staffPage.goto(`/staff/tickets?search=${encodeURIComponent(ticket.ticketNumber)}`)
    const row = staffPage.locator('table.zen-queue tbody tr.zen-queue-row').filter({ hasText: ticket.ticketNumber })
    await expect(row).toHaveCount(1)
    await expect(row.locator('xpath=following-sibling::tr[1]')).toContainText('Requester says resolved')
    await expect(row).toContainText('Open')

    await row.getByRole('link', { name: ticket.ticketNumber }).click()
    await expect(badges(staffPage)).toContainText('Requester says resolved')
    await expect(badges(staffPage)).toContainText('Open')
    await staffContext.close()
  })
})
