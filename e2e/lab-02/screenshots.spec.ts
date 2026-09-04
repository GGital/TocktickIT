import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import {
  EXE_BYTES,
  PDF_BYTES,
  PNG_BYTES,
  REQUESTER_ID_KEY,
  VIEWPORTS,
  actAs,
  createTicket,
  getReferenceData,
  getRequesters,
  runTag,
  type ViewportName,
} from './helpers'

/**
 * RESP-07 (ui-spec §12, tests.md §4.2): every documented state captured at all
 * three viewports, named `<state>.<viewport>.png` under the screen's directory.
 */
const SCREENSHOT_ROOT = path.resolve('artifacts/lab-02/screenshots')
const VIEWPORT_NAMES = ['desktop', 'tablet', 'mobile'] as ViewportName[]

async function capture(page: Page, screen: string, state: string, viewport: ViewportName) {
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.screenshot({
    path: path.join(SCREENSHOT_ROOT, screen, `${state}.${viewport}.png`),
    fullPage: true,
  })
}

/** Runs `prepare` at each viewport and captures the result under one state name. */
function captureAtEveryViewport(
  screen: string,
  state: string,
  prepare: (page: Page) => Promise<void>,
) {
  test(`${screen}/${state}`, async ({ page }) => {
    for (const viewport of VIEWPORT_NAMES) {
      await page.setViewportSize(VIEWPORTS[viewport])
      await prepare(page)
      await capture(page, screen, state, viewport)
    }
  })
}

test.describe('RESP-07 screenshot inventory', () => {
  const tag = runTag()
  let requesterId: number
  let otherRequesterId: number
  let categoryId: number
  let systemId: number
  let listTicketId: number
  let attachmentTicketId: number
  let removedTicketId: number

  test.beforeAll(async ({ request }) => {
    const [requester, other] = await getRequesters(request)
    const { categories, systems } = await getReferenceData(request)
    requesterId = requester.id
    otherRequesterId = other.id
    categoryId = categories[0].id
    systemId = systems[0].id

    // Enough rows for a populated list and a second page.
    for (let index = 0; index < 12; index += 1) {
      await createTicket(request, requester.id, {
        summary: `${tag} screenshot fixture ticket ${String(index + 1).padStart(2, '0')}`,
        categoryId: categories[index % categories.length].id,
        relatedSystemId: systems[index % systems.length].id,
        requestedPriority: (['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)[index % 4],
      })
    }

    const listTicket = await createTicket(request, requester.id, {
      summary: `${tag} laptop battery drains within thirty minutes`,
      categoryId,
      relatedSystemId: systemId,
      requestedPriority: 'HIGH',
    })
    listTicketId = listTicket.id

    // One ticket with an active attachment, one with a removed attachment.
    const withActive = await createTicket(request, requester.id, {
      summary: `${tag} ticket carrying an active attachment`,
      categoryId,
      relatedSystemId: systemId,
    })
    attachmentTicketId = withActive.id
    await request.post(`http://localhost:3000/api/tickets/${withActive.id}/attachments`, {
      headers: { 'X-Requester-Id': String(requester.id) },
      multipart: { file: { name: 'battery-report.pdf', mimeType: 'application/pdf', buffer: PDF_BYTES } },
    })

    const withRemoved = await createTicket(request, requester.id, {
      summary: `${tag} ticket carrying a removed attachment`,
      categoryId,
      relatedSystemId: systemId,
    })
    removedTicketId = withRemoved.id
    const uploaded = await request.post(
      `http://localhost:3000/api/tickets/${withRemoved.id}/attachments`,
      {
        headers: { 'X-Requester-Id': String(requester.id) },
        multipart: {
          file: { name: 'wrong-screenshot.png', mimeType: 'image/png', buffer: PNG_BYTES },
        },
      },
    )
    await request.delete(`http://localhost:3000/api/attachments/${(await uploaded.json()).id}`, {
      headers: { 'X-Requester-Id': String(requester.id) },
      data: { removalReason: 'Uploaded the wrong screenshot' },
    })
  })

  // --- Requester Selection -------------------------------------------------

  captureAtEveryViewport('requester-selection', 'loading', async (page) => {
    // Hold the requesters response open so the loading state is on screen.
    await page.route('**/api/requesters', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      await route.continue()
    })
    await page.goto('/select-requester')
    await page.getByText('Loading requesters…').waitFor()
  })

  captureAtEveryViewport('requester-selection', 'loaded', async (page) => {
    await page.goto('/select-requester')
    await page.getByLabel(/Development Requester/).waitFor()
  })

  captureAtEveryViewport('requester-selection', 'empty', async (page) => {
    await page.route('**/api/requesters', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.goto('/select-requester')
    await page.getByText('No active Development Requesters found.').waitFor()
  })

  captureAtEveryViewport('requester-selection', 'error', async (page) => {
    await page.route('**/api/requesters', (route) => route.abort('failed'))
    await page.goto('/select-requester')
    await page.getByText('Unable to load the development requesters.').waitFor()
  })

  // --- Create Ticket -------------------------------------------------------

  captureAtEveryViewport('create-ticket', 'initial', async (page) => {
    await actAs(page, requesterId)
    await page.goto('/tickets/new')
    await page.getByLabel(/^Ticket Summary/).waitFor()
  })

  captureAtEveryViewport('create-ticket', 'validation-failure', async (page) => {
    await actAs(page, requesterId)
    await page.goto('/tickets/new')
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await page.getByText('Summary must be between 10 and 120 characters.').waitFor()
  })

  captureAtEveryViewport('create-ticket', 'submitting', async (page) => {
    await actAs(page, requesterId)
    // Hold the create request open so the busy state is on screen.
    await page.route('**/api/tickets', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      await route.continue()
    })

    await page.goto('/tickets/new')
    await fillForScreenshot(page, `${tag} submitting state capture for the report`)
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await page.getByRole('button', { name: /Submitting…/ }).waitFor()
  })

  captureAtEveryViewport('create-ticket', 'success', async (page) => {
    await actAs(page, requesterId)
    await page.goto('/tickets/new')
    await fillForScreenshot(page, `${tag} success state capture ${Date.now()}`)
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await page.locator('.zen-ticket-number').waitFor()
  })

  captureAtEveryViewport('create-ticket', 'api-failure', async (page) => {
    await actAs(page, requesterId)
    await page.route('**/api/tickets', (route) =>
      route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
    )
    await page.goto('/tickets/new')
    await fillForScreenshot(page, `${tag} api failure state capture for the report`)
    await page.getByRole('button', { name: 'Submit Ticket' }).click()
    await page.getByText(/could not be submitted/i).waitFor()
  })

  captureAtEveryViewport('create-ticket', 'invalid-attachment', async (page) => {
    await actAs(page, requesterId)
    await page.goto('/tickets/new')
    await page.getByLabel('Choose files').setInputFiles([
      { name: 'screenshot.png', mimeType: 'image/png', buffer: PNG_BYTES },
      { name: 'crash-dump.exe', mimeType: 'application/octet-stream', buffer: EXE_BYTES },
    ])
    await page.getByText('File type not allowed').waitFor()
  })

  // --- My Tickets ----------------------------------------------------------

  captureAtEveryViewport('my-tickets', 'loaded', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets?search=${encodeURIComponent(tag)}`)
    await page.getByText(/Showing 1–10 of/).waitFor()
  })

  captureAtEveryViewport('my-tickets', 'empty', async (page) => {
    await actAs(page, requesterId)
    // The list route with or without a query; a glob's ? is a single-character
    // wildcard, so '**/api/tickets?**' misses the bare request entirely.
    await page.route(/\/api\/tickets(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
        }),
      }),
    )
    await page.goto('/tickets')
    await page.getByText('You have not created any tickets yet.').waitFor()
  })

  captureAtEveryViewport('my-tickets', 'no-results', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets?search=${encodeURIComponent(`${tag}-nothing-matches-this`)}`)
    await page.getByText('No tickets match your search.').waitFor()
  })

  captureAtEveryViewport('my-tickets', 'filtered', async (page) => {
    await actAs(page, requesterId)
    await page.goto(
      `/tickets?search=${encodeURIComponent(tag)}&requestedPriority=URGENT&categoryId=${categoryId}`,
    )
    await page.getByLabel('Search').waitFor()
  })

  captureAtEveryViewport('my-tickets', 'page-2', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets?search=${encodeURIComponent(tag)}&page=2`)
    await page.getByText(/Showing 11–/).waitFor()
  })

  captureAtEveryViewport('my-tickets', 'error', async (page) => {
    await actAs(page, requesterId)
    await page.route(/\/api\/tickets(\?|$)/, (route) => route.abort('failed'))
    await page.goto('/tickets')
    await page.getByText('Unable to load your tickets.').waitFor()
  })

  // --- Ticket Detail -------------------------------------------------------

  captureAtEveryViewport('ticket-detail', 'loaded', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets/${listTicketId}`)
    await page.getByRole('heading', { name: 'Ticket information' }).waitFor()
  })

  captureAtEveryViewport('ticket-detail', 'attachment-active', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets/${attachmentTicketId}`)
    await page.getByRole('heading', { name: 'Attachments (1 active of 5)' }).waitFor()
  })

  captureAtEveryViewport('ticket-detail', 'attachment-removed', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets/${removedTicketId}`)
    await page.getByTestId('removed-attachment').waitFor()
  })

  captureAtEveryViewport('ticket-detail', 'remove-dialog', async (page) => {
    await actAs(page, requesterId)
    await page.goto(`/tickets/${attachmentTicketId}`)
    await page.getByRole('button', { name: /^Remove / }).click()
    await page.getByRole('dialog').waitFor()
  })

  captureAtEveryViewport('ticket-detail', 'not-found', async (page) => {
    // The other requester's context: the same card a non-existent id produces.
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key as string, String(id)),
      [REQUESTER_ID_KEY, otherRequesterId] as const,
    )
    await page.goto(`/tickets/${listTicketId}`)
    await page.getByText('Ticket not found.').waitFor()
  })

  test('every documented state was captured', async () => {
    const { readdirSync } = await import('node:fs')

    const expected: Record<string, string[]> = {
      'requester-selection': ['loading', 'loaded', 'empty', 'error'],
      'create-ticket': [
        'initial',
        'validation-failure',
        'submitting',
        'success',
        'api-failure',
        'invalid-attachment',
      ],
      'my-tickets': ['loaded', 'empty', 'no-results', 'filtered', 'page-2', 'error'],
      'ticket-detail': [
        'loaded',
        'attachment-active',
        'attachment-removed',
        'remove-dialog',
        'not-found',
      ],
    }

    for (const [screen, states] of Object.entries(expected)) {
      const files = readdirSync(path.join(SCREENSHOT_ROOT, screen))
      for (const state of states) {
        for (const viewport of VIEWPORT_NAMES) {
          expect(files, `${screen}/${state}.${viewport}.png is missing`).toContain(
            `${state}.${viewport}.png`,
          )
        }
      }
    }
  })

  /** Fills the form far enough to submit, for the states that need a submission. */
  async function fillForScreenshot(page: Page, summary: string) {
    await page.getByLabel(/^Category/).selectOption(String(categoryId))
    await page.getByLabel(/^Related System/).selectOption(String(systemId))
    await page.getByLabel(/^Ticket Summary/).fill(summary)
    await page
      .getByLabel(/^Description/)
      .fill('Captured by the screenshot suite so the report shows a realistic form.')
  }
})
