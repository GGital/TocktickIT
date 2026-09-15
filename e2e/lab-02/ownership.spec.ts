import { expect, test } from '@playwright/test'
import { API, actAs, createTicket, getReferenceData, getRequesters, runTag } from './helpers'

test.describe('Ownership and session', () => {
  /**
   * E2E-04 (AC-31, AC-04, AC-41): one requester's ticket is invisible to another,
   * both in the list and by direct URL — and the URL case looks exactly like a
   * ticket that does not exist (BR-13). Lab 3: "another requester" is another
   * signed-in session rather than a selector switch (BR-58).
   */
  test('E2E-04 a ticket is invisible to a different requester', async ({ page, request }) => {
    const [requesterA, requesterB] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} only requester A may see this ticket`

    const ticket = await createTicket(request, requesterA, {
      summary,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    // --- Requester A sees it ---
    await actAs(page, requesterA)
    await page.goto(`/tickets?search=${encodeURIComponent(summary)}`)
    await expect(page.getByRole('table').getByText(summary)).toBeVisible()

    // --- Signed in as B, the same search finds nothing (AC-04, BR-12) ---
    await actAs(page, requesterB)
    await page.goto(`/tickets?search=${encodeURIComponent(summary)}`)
    await expect(page.getByText(requesterB.fullName)).toBeVisible()
    await expect(page.getByText('No tickets match your search.')).toBeVisible()
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
   * E2E-08 (AC-02, AC-05; Lab 3 AC-06): the session ends mid-visit, and every ticket URL
   * falls back to the sign-in route without rendering ticket data (FR-05). Replaces the
   * Lab 2 "cleared selector context" case (BR-58).
   */
  test('E2E-08 an ended session sends every ticket URL to sign-in', async ({ page, request }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} ended session sends the user back`

    const ticket = await createTicket(request, requester, {
      summary,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    await actAs(page, requester)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { name: ticket.ticketNumber })).toBeVisible()

    // Signing out through the API ends the session server-side (Lab 3 BR-05).
    expect((await page.request.post(`${API}/auth/logout`)).status()).toBe(204)

    for (const path of [`/tickets/${ticket.id}`, '/tickets', '/tickets/new']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByText(summary)).toHaveCount(0)
      await expect(page.getByText(ticket.ticketNumber)).toHaveCount(0)
    }
  })
})
