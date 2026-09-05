import { expect, test } from '@playwright/test'
import { actAs, createTicket, getReferenceData, getRequesters, runTag } from './helpers'

/**
 * E2E-05 (AC-32 – AC-39): search, filters, sort, page size, pagination, and Clear
 * filters driven through the real toolbar against a set of twelve owned tickets.
 */
test('E2E-05 the My Tickets toolbar drives the server-side list', async ({ page, request }) => {
  const [requester] = await getRequesters(request)
  const { categories, systems } = await getReferenceData(request)
  const tag = runTag()

  // Twelve tickets: two pages at the default page size (AC-36). Priorities and
  // categories vary so the filters have something to narrow.
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
  for (let index = 0; index < 12; index += 1) {
    await createTicket(request, requester.id, {
      summary: `${tag} seeded list ticket number ${String(index + 1).padStart(2, '0')}`,
      categoryId: categories[index % categories.length].id,
      relatedSystemId: systems[index % systems.length].id,
      requestedPriority: priorities[index % priorities.length],
    })
  }

  // One ticket nothing else matches, for the single-result assertions.
  await createTicket(request, requester.id, {
    summary: `${tag} unmistakable kingfisher ticket`,
    // The run tag sits inside the description so the search below is scoped to this
    // run: the database keeps every ticket a previous run created.
    description: `${tag} kingfisher plumage, a description-only phrase for the search check.`,
    categoryId: categories[0].id,
    relatedSystemId: systems[0].id,
    requestedPriority: 'URGENT',
  })

  await actAs(page, requester.id)
  const rows = page.getByRole('table').getByRole('row')

  // --- Search narrows to this run, and paging splits it (AC-34, AC-36) ---
  await page.goto(`/tickets?search=${encodeURIComponent(tag)}`)
  await expect(page.getByText(/Showing 1–10 of 13/)).toBeVisible()
  // Ten data rows plus the header row.
  await expect(rows).toHaveCount(11)

  await page.getByRole('button', { name: 'Page 2' }).click()
  await expect(page.getByText(/Showing 11–13 of 13/)).toBeVisible()
  await expect(rows).toHaveCount(4)

  // --- Page size resets to page 1 (AC-38, BR-41) ---
  await page.getByLabel('Show').selectOption('20')
  await expect(page.getByText(/Showing 1–13 of 13/)).toBeVisible()
  await expect(page).toHaveURL(/page=1/)

  // --- A description fragment matches too, in a different case (AC-34, BR-35) ---
  // This phrase appears only in that ticket's description, never in a summary.
  await page.getByLabel('Search').fill(`${tag} KINGFISHER`)
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('table')).toContainText('unmistakable kingfisher ticket')

  // --- Filters combine with the search term (AC-35, BR-36) ---
  await page.getByLabel('Search').fill(tag)
  await page.getByLabel(/^Requested Priority/).selectOption('URGENT')
  await expect(page.getByRole('table').getByText('LOW')).toHaveCount(0)
  const urgentCount = (await rows.count()) - 1
  expect(urgentCount).toBeGreaterThan(0)

  await page.getByLabel(/^Category/).selectOption(String(categories[0].id))
  await expect(page.getByRole('table')).toContainText(categories[0].name)
  expect((await rows.count()) - 1).toBeLessThanOrEqual(urgentCount)

  // --- A search that matches nothing is the no-results state, not the empty one (AC-33) ---
  await page.getByLabel('Search').fill(`${tag}-nothing-can-match-this`)
  await expect(page.getByText('No tickets match your search.')).toBeVisible()
  await expect(page.getByText('You have not created any tickets yet.')).toHaveCount(0)

  // --- Clear filters restores the full list (AC-33) ---
  const noResults = page.getByText('No tickets match your search.').locator('xpath=ancestor::div[1]')
  await noResults.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByLabel('Search')).toHaveValue('')
  await expect(page.getByRole('table')).toBeVisible()

  // --- Sorting by priority is by severity, not alphabet (AC-37, BR-37) ---
  await page.getByLabel('Search').fill(tag)
  await expect(page.getByText(/Showing 1–10 of 13/)).toBeVisible()
  await page.getByLabel('Sort').selectOption('requestedPriority:desc')
  await expect(rows.nth(1)).toContainText('URGENT')

  await page.getByLabel('Sort').selectOption('createdAt:asc')
  await expect(rows.nth(1)).toContainText('seeded list ticket number 01')

  // --- An unsupported value is refused rather than silently coerced (AC-39) ---
  const invalid = await request.get(`http://localhost:3000/api/tickets?pageSize=999`, {
    headers: { 'X-Requester-Id': String(requester.id) },
  })
  expect(invalid.status()).toBe(400)
  expect((await invalid.json()).error.code).toBe('INVALID_QUERY_PARAMETER')
})
