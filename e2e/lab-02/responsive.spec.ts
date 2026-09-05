import { expect, test, type Page } from '@playwright/test'
import {
  PDF_BYTES,
  VIEWPORTS,
  actAs,
  createTicket,
  getReferenceData,
  getRequesters,
  runTag,
  type ViewportName,
} from './helpers'

/** No page may scroll sideways; a wide element scrolls inside itself (ui-spec §8). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

  expect(
    overflow.scrollWidth,
    `page scrolls horizontally: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

const setup = async (page: Page, requesterId: number, viewport: ViewportName) => {
  await page.setViewportSize(VIEWPORTS[viewport])
  await actAs(page, requesterId)
}

test.describe('Responsive behaviour', () => {
  let requesterId: number
  let ticketId: number
  let attachmentTicketId: number
  const tag = runTag()

  test.beforeAll(async ({ request }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    requesterId = requester.id

    const ticket = await createTicket(request, requester.id, {
      summary: `${tag} responsive fixture ticket for the viewport checks`,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })
    ticketId = ticket.id

    // A second ticket carries a deliberately long filename for RESP-06.
    const withFile = await createTicket(request, requester.id, {
      summary: `${tag} responsive fixture with a long attachment name`,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })
    attachmentTicketId = withFile.id

    const longName = `${'quarterly-network-outage-incident-report-'.repeat(2)}final.pdf`
    const uploaded = await request.post(
      `http://localhost:3000/api/tickets/${withFile.id}/attachments`,
      {
        headers: { 'X-Requester-Id': String(requester.id) },
        multipart: {
          file: { name: longName, mimeType: 'application/pdf', buffer: PDF_BYTES },
        },
      },
    )
    expect(uploaded.status()).toBe(201)
  })

  /** RESP-01 (AC-45, FR-32): no horizontal page scroll on any screen at any viewport. */
  for (const viewport of ['desktop', 'tablet', 'mobile'] as ViewportName[]) {
    test(`RESP-01 no horizontal scrolling at ${viewport}`, async ({ page }) => {
      await setup(page, requesterId, viewport)

      for (const path of ['/select-requester', '/tickets', '/tickets/new', `/tickets/${ticketId}`]) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expectNoHorizontalScroll(page)
      }
    })
  }

  /** RESP-02 (AC-45): labels are not clipped and messages do not overlap at 375 px. */
  test('RESP-02 Create Ticket labels and messages fit at 375 px', async ({ page }) => {
    await setup(page, requesterId, 'mobile')
    await page.goto('/tickets/new')

    // Force the validation state so the messages are on screen.
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    const message = page.getByText('Summary must be between 10 and 120 characters.')
    await expect(message).toBeVisible()

    const summaryLabel = page.locator('label[for="summary"]')
    const labelBox = (await summaryLabel.boundingBox())!
    const messageBox = (await message.boundingBox())!
    const controlBox = (await page.getByLabel(/^Ticket Summary/).boundingBox())!

    // Nothing extends past the viewport, and the message sits below its control.
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width)
    expect(messageBox.x + messageBox.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width)
    expect(messageBox.y).toBeGreaterThanOrEqual(controlBox.y + controlBox.height - 1)

    // The label is not visually truncated.
    const clipped = await summaryLabel.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    )
    expect(clipped, 'the Summary label is clipped').toBe(false)

    await expectNoHorizontalScroll(page)
  })

  /** RESP-03 (ui-spec §6.3): table on desktop, cards on mobile, never both. */
  test('RESP-03 My Tickets swaps the table for cards on mobile', async ({ page }) => {
    await setup(page, requesterId, 'desktop')
    await page.goto(`/tickets?search=${encodeURIComponent(tag)}`)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.locator('.zen-ticket-card').first()).toBeHidden()

    await page.setViewportSize(VIEWPORTS.mobile)
    await expect(page.locator('.zen-ticket-card').first()).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
  })

  /** RESP-04 (ui-spec §3): the mobile navigation is reachable through the toggle. */
  test('RESP-04 the mobile navigation expands from the hamburger', async ({ page }) => {
    await setup(page, requesterId, 'mobile')
    await page.goto('/tickets')

    const toggle = page.getByRole('button', { name: 'Open navigation' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('link', { name: 'Create Ticket' })).toBeVisible()

    await page.getByRole('link', { name: 'Create Ticket' }).click()
    await expect(page).toHaveURL(/\/tickets\/new$/)
  })

  /** RESP-05 (AC-45): filters, pagination, and attachment controls stay usable at 375 px. */
  test('RESP-05 controls stay reachable and large enough at 375 px', async ({ page }) => {
    await setup(page, requesterId, 'mobile')
    await page.goto(`/tickets?search=${encodeURIComponent(tag)}`)

    for (const label of ['Search', 'Category', 'Requested Priority', 'Sort', 'Show']) {
      const control = page.getByLabel(new RegExp(`^${label}`)).first()
      await expect(control).toBeVisible()

      const box = (await control.boundingBox())!
      expect(box.height, `${label} is below the 44px touch target`).toBeGreaterThanOrEqual(44)
    }

    await page.goto(`/tickets/${attachmentTicketId}`)
    const addAttachment = page.getByText('Add attachment')
    await expect(addAttachment).toBeVisible()
    expect((await addAttachment.boundingBox())!.height).toBeGreaterThanOrEqual(44)

    const remove = page.getByRole('button', { name: /^Remove / })
    await expect(remove).toBeVisible()
    expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expectNoHorizontalScroll(page)
  })

  /** RESP-06 (AC-49): a long filename truncates but stays fully available. */
  test('RESP-06 a long attachment name truncates without breaking the layout', async ({ page }) => {
    await setup(page, requesterId, 'mobile')
    await page.goto(`/tickets/${attachmentTicketId}`)

    const filename = page.locator('.zen-filename').first()
    await expect(filename).toBeVisible()

    const title = await filename.getAttribute('title')
    expect(title, 'the full name must remain available').toMatch(/quarterly-network-outage/)
    expect(title!.length).toBeGreaterThan(40)

    // Rendered narrower than its own content: it is truncated, not wrapped or spilled.
    const box = (await filename.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width)
    const truncated = await filename.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    )
    expect(truncated).toBe(true)

    await expectNoHorizontalScroll(page)
  })
})
