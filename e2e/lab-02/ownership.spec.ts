import { expect, test } from '@playwright/test'
import {
  REQUESTER_ID_KEY,
  actAs,
  createTicket,
  getReferenceData,
  getRequesters,
  runTag,
  selectRequesterThroughUi,
} from './helpers'

test.describe('Ownership and context', () => {
  /**
   * E2E-04 (AC-31, AC-04, AC-41): one requester's ticket is invisible to another,
   * both in the list and by direct URL — and the URL case looks exactly like a
   * ticket that does not exist (BR-13).
   */
  test('E2E-04 a ticket is invisible to a different requester', async ({ page, request }) => {
    const [requesterA, requesterB] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} only requester A may see this ticket`

    const ticket = await createTicket(request, requesterA.id, {
      summary,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    // --- Requester A sees it ---
    await actAs(page, requesterA.id)
    await page.goto(`/tickets?search=${encodeURIComponent(summary)}`)
    await expect(page.getByRole('table').getByText(summary)).toBeVisible()

    // --- Switching requester clears the previous requester's data (AC-04, BR-12) ---
    await page.getByRole('button', { name: 'Change Requester' }).click()
    await expect(page.getByRole('heading', { name: 'Select a Development Requester' })).toBeVisible()
    await page.getByLabel(/Development Requester/).selectOption(String(requesterB.id))
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText(requesterB.fullName)).toBeVisible()
    // The search term did not survive the switch, and neither did A's row.
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByText(summary)).toHaveCount(0)

    // A requester who owns nothing gets the empty state, which hides the toolbar
    // entirely (BR-42); one who owns other tickets keeps it and can search. Either
    // way A's ticket must be unreachable from B's list.
    const search = page.getByLabel('Search')
    if ((await search.count()) > 0) {
      await search.fill(summary)
      await expect(page.getByText('No tickets match your search.')).toBeVisible()
    } else {
      await expect(page.getByText('You have not created any tickets yet.')).toBeVisible()
    }
    await expect(page.getByText(summary)).toHaveCount(0)

    // --- A's ticket by direct URL, as B (AC-41) ---
    await page.goto(`/tickets/${ticket.id}`)
    const notOwned = page.getByText('Ticket not found.')
    await expect(notOwned).toBeVisible()
    const notOwnedCard = await notOwned.locator('xpath=ancestor::div[@class="zen-card zen-empty"]').textContent()
    await expect(page.getByText(summary)).toHaveCount(0)

    // --- An id that exists for nobody looks identical (AC-44, BR-13) ---
    await page.goto('/tickets/99999999')
    await expect(page.getByText('Ticket not found.')).toBeVisible()
    const unknownCard = await page
      .getByText('Ticket not found.')
      .locator('xpath=ancestor::div[@class="zen-card zen-empty"]')
      .textContent()

    expect(unknownCard).toBe(notOwnedCard)
  })

  /**
   * E2E-08 (AC-02, AC-05): the stored context disappears mid-session — a cleared
   * browser, another tab, an expired test setup — and every requester-scoped screen
   * falls back to the selection screen without rendering ticket data (FR-05).
   */
  test('E2E-08 a cleared context sends every ticket URL back to selection', async ({
    page,
    request,
  }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} context clearing sends the user back`

    const ticket = await createTicket(request, requester.id, {
      summary,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    // Selected through the screen, so nothing re-seeds the context behind the test.
    await selectRequesterThroughUi(page, requester.id)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { name: ticket.ticketNumber })).toBeVisible()

    // Clear the one documented key, exactly as the client itself would (BR-10).
    await page.evaluate((key) => window.localStorage.removeItem(key), REQUESTER_ID_KEY)

    for (const path of [`/tickets/${ticket.id}`, '/tickets', '/tickets/new']) {
      await page.goto(path)
      await expect(
        page.getByRole('heading', { name: 'Select a Development Requester' }),
      ).toBeVisible()
      await expect(page.getByText(summary)).toHaveCount(0)
      await expect(page.getByText(ticket.ticketNumber)).toHaveCount(0)
    }
  })
})
