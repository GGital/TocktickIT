import { expect, test } from '@playwright/test'
import {
  EXE_BYTES,
  PNG_BYTES,
  actAs,
  fillTicketForm,
  getReferenceData,
  getRequesters,
  readTicketNumber,
  runTag,
} from './helpers'

test.describe('Create Ticket end to end', () => {
  /**
   * E2E-02 (AC-11, AC-12, AC-16): an invalid submission, a corrected one that the
   * network then rejects, and a retry that succeeds — with nothing the user typed
   * lost along the way.
   */
  test('E2E-02 invalid, then a failed submission, then a successful retry', async ({
    page,
    request,
  }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} projector in the lecture hall flickers`
    const description = 'The HDMI cable appears loose whenever the projector warms up properly.'

    await actAs(page, requester.id)
    await page.goto('/tickets/new')

    // --- Validation failure: messages, focus, and no request at all (AC-11) ---
    let posted = 0
    await page.route('**/api/tickets', async (route) => {
      posted += 1
      await route.continue()
    })

    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await expect(page.getByRole('alert')).toContainText(/fields need attention/)
    await expect(page.getByText('Summary must be between 10 and 120 characters.')).toBeVisible()
    await expect(page.getByLabel(/^Ticket Summary/)).toBeFocused()
    expect(posted, 'an invalid form must not reach the API').toBe(0)

    // --- Boundary: nine characters is still short (AC-12) ---
    await page.getByLabel(/^Ticket Summary/).fill('a'.repeat(9))
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await expect(page.getByText('Summary must be between 10 and 120 characters.')).toBeVisible()
    expect(posted).toBe(0)

    // --- Corrected, but the backend is down: values must survive (AC-16, BR-20) ---
    await fillTicketForm(page, {
      summary,
      description,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    await page.unroute('**/api/tickets')
    await page.route('**/api/tickets', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Submit Ticket' }).click()

    await expect(page.getByText(/could not be submitted/i)).toBeVisible()
    await expect(page.getByLabel(/^Ticket Summary/)).toHaveValue(summary)
    await expect(page.getByLabel(/^Description/)).toHaveValue(description)
    await expect(page.getByLabel(/^Category/)).toHaveValue(String(categories[0].id))
    await expect(page.getByRole('button', { name: 'Submit Ticket' })).toBeEnabled()

    // --- Retry once the backend answers again ---
    await page.unroute('**/api/tickets')
    await page.getByRole('button', { name: 'Submit Ticket' }).click()

    const ticketNumber = await readTicketNumber(page)
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/)
  })

  /**
   * E2E-03 (AC-18, AC-19, AC-23): one permitted file and one rejected file staged
   * together. The ticket is created either way, the good file uploads, and the bad
   * one is reported on its own without ever being sent (BR-29).
   */
  test('E2E-03 a valid and an invalid attachment staged together', async ({ page, request }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const summary = `${runTag()} scanner will not pair over bluetooth`

    await actAs(page, requester.id)
    await page.goto('/tickets/new')

    const uploads: string[] = []
    page.on('request', (outgoing) => {
      if (outgoing.url().includes('/attachments')) uploads.push(outgoing.url())
    })

    await page.getByLabel('Choose files').setInputFiles([
      { name: 'screenshot.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'crash-dump.exe', mimeType: 'application/octet-stream', buffer: EXE_BYTES },
    ])

    // The invalid file is marked with its own reason and excluded from the count.
    await expect(page.getByText('File type not allowed')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Attachments (1 of 5)' })).toBeVisible()

    await fillTicketForm(page, {
      summary,
      description: 'The handheld scanner never appears in the Bluetooth device list at all.',
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })
    await page.getByRole('button', { name: 'Submit Ticket' }).click()

    const ticketNumber = await readTicketNumber(page)
    await expect(page.getByText(/1 uploaded · 0 failed/)).toBeVisible()
    expect(uploads, 'only the permitted file is uploaded').toHaveLength(1)

    // The uploaded file is on the ticket; the rejected one never existed.
    await page.getByRole('button', { name: 'View Ticket' }).click()
    await expect(page.getByRole('heading', { name: ticketNumber })).toBeVisible()
    await expect(page.getByText('screenshot.png')).toBeVisible()
    await expect(page.getByText('crash-dump.exe')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Attachments (1 active of 5)' })).toBeVisible()
  })
})
