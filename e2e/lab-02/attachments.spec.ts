import { expect, test } from '@playwright/test'
import {
  API,
  PDF_BYTES,
  actAs,
  createTicket,
  getReferenceData,
  getRequesters,
  runTag,
} from './helpers'

test.describe('Attachments on Ticket Detail', () => {
  /**
   * E2E-06 (AC-24 – AC-27): add a file, download it, then soft-remove it with a
   * reason. Afterwards the metadata is still listed and the download control is
   * gone (BR-30, BR-32).
   */
  test('E2E-06 add, download, then soft-remove an attachment', async ({ page, request }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)

    const ticket = await createTicket(request, requester.id, {
      summary: `${runTag()} battery report needs an attachment`,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    await actAs(page, requester.id)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByText('No attachments on this ticket.')).toBeVisible()

    // --- Add (FR-15) ---
    await page
      .getByLabel('Add attachment')
      .setInputFiles({ name: 'battery-report.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES })

    await expect(page.getByRole('heading', { name: 'Attachments (1 active of 5)' })).toBeVisible()
    await expect(page.getByText('battery-report.pdf')).toBeVisible()

    // --- Download (AC-24) ---
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('battery-report.pdf')

    // --- Removal needs an explicit confirmation with a reason (AC-25, BR-31) ---
    await page.getByRole('button', { name: 'Remove battery-report.pdf' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/record is kept on the ticket/i)).toBeVisible()

    const confirm = dialog.getByRole('button', { name: 'Remove attachment' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(/Reason for removal/).fill('four')
    await expect(confirm).toBeDisabled()

    await dialog.getByLabel(/Reason for removal/).fill('Uploaded the wrong report')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    // --- Removed: metadata retained, controls gone (AC-26, AC-27) ---
    await expect(page.getByRole('heading', { name: 'Attachments (0 active of 5)' })).toBeVisible()
    const removedRow = page.getByTestId('removed-attachment')
    await expect(removedRow).toContainText('battery-report.pdf')
    await expect(removedRow).toContainText('Removed')
    await expect(removedRow).toContainText('Uploaded the wrong report')
    await expect(removedRow.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0)

    // The row itself still exists on the ticket — removal is never a delete (BR-30).
    const detail = await request.get(`${API}/tickets/${ticket.id}`, {
      headers: { 'X-Requester-Id': String(requester.id) },
    })
    const body = await detail.json()
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0]).toMatchObject({ isRemoved: true, downloadUrl: null })
  })

  /**
   * E2E-07 (AC-26): the removed attachment's own download URL is requested
   * directly. The bytes are still on disk, and the API refuses to serve them.
   *
   * The request carries X-Requester-Id, because a plain browser navigation cannot
   * send headers and would be answered 400 REQUESTER_CONTEXT_MISSING before the
   * removal rule is ever reached — the rule under test here is the 410.
   */
  test('E2E-07 a removed attachment cannot be downloaded by URL', async ({ page, request }) => {
    const [requester] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    const context = { 'X-Requester-Id': String(requester.id) }

    const ticket = await createTicket(request, requester.id, {
      summary: `${runTag()} removed attachment stays unreachable`,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    const uploaded = await request.post(`${API}/tickets/${ticket.id}/attachments`, {
      headers: context,
      multipart: {
        file: { name: 'evidence.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES },
      },
    })
    expect(uploaded.status()).toBe(201)
    const attachmentId = (await uploaded.json()).id as number

    // While active, the bytes are served.
    const active = await request.get(`${API}/attachments/${attachmentId}/download`, {
      headers: context,
    })
    expect(active.status()).toBe(200)
    expect(active.headers()['x-content-type-options']).toBe('nosniff')

    const removed = await request.delete(`${API}/attachments/${attachmentId}`, {
      headers: context,
      data: { removalReason: 'Uploaded the wrong evidence file' },
    })
    expect(removed.status()).toBe(200)

    // After removal the same URL is refused, and no bytes come back (BR-32).
    const blocked = await request.get(`${API}/attachments/${attachmentId}/download`, {
      headers: context,
    })
    expect(blocked.status()).toBe(410)
    expect((await blocked.json()).error.code).toBe('ATTACHMENT_REMOVED')

    // And the screen offers nothing that could reach it.
    await actAs(page, requester.id)
    await page.goto(`/tickets/${ticket.id}`)
    await expect(page.getByTestId('removed-attachment')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0)
  })
})
