import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext, type Locator, type Page, type Response } from '@playwright/test'
import { ACCOUNTS, API, createTicket, getReferenceData, signInAs, type AccountName } from '../lab-03/helpers'

export {
  ACCOUNTS,
  API,
  PASSWORD,
  VIEWPORTS,
  createUserReady,
  expectNoHorizontalScroll,
  getReferenceData,
  postMessage,
  removeFixtureUsers,
  runTag,
  signInAs,
  signInThroughUi,
  type AccountName,
  type ViewportName,
} from '../lab-03/helpers'

export type Ticket = { id: number; ticketNumber: string; summary: string }

/** A Requester Ticket through the API, optionally claimed by a staff account so actions can be recorded (BR-14). */
export async function ticketFixture(
  request: APIRequestContext,
  summary: string,
  options: { owner?: AccountName; itPriority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; requester?: AccountName } = {},
): Promise<Ticket> {
  const requester = options.requester ?? 'requester'
  await signInAs(request, requester)
  const { categories, systems } = await getReferenceData(request)
  const ticket = await createTicket(request, ACCOUNTS[requester], {
    summary,
    description: 'Created by the Lab 4 end-to-end suite so the workflow has a realistic Ticket to act on.',
    categoryId: categories[0].id,
    relatedSystemId: systems[0].id,
    requestedPriority: 'HIGH',
  })
  if (options.owner) await staffWrite(request, options.owner, ticket.id, 'assignment', { assigneeId: 'me' })
  if (options.itPriority) await staffWrite(request, options.owner ?? 'staff', ticket.id, 'priority', { itPriority: options.itPriority })
  return ticket
}

/** One staff operation as `as`, sent with the Ticket's current version (BR-78). */
export async function staffWrite(request: APIRequestContext, as: AccountName, ticketId: number, action: 'assignment' | 'priority' | 'status', body: object) {
  await signInAs(request, as)
  const { version } = await (await request.get(`${API}/staff/tickets/${ticketId}`)).json()
  const response = await request.patch(`${API}/staff/tickets/${ticketId}/${action}`, { data: { ...body, expectedVersion: version } })
  expect(response.status(), await response.text()).toBe(200)
  return response.json()
}

type ActionInput = { description?: string; result?: string; followUpNote?: string; attachmentNotes?: string }

/** Records one Action Taken as `as`; `followUpNote` makes it a follow-up action. `actionAt` is now (BR-06). */
export async function addAction(request: APIRequestContext, as: AccountName, ticketId: number, input: ActionInput = {}) {
  await signInAs(request, as)
  const response = await request.post(`${API}/staff/tickets/${ticketId}/actions`, {
    data: {
      clientRequestId: randomUUID(),
      actionAt: new Date().toISOString(),
      description: input.description ?? 'Checked the configuration and applied the documented fix.',
      result: input.result ?? 'Working again after the change.',
      followUpRequired: input.followUpNote !== undefined,
      ...(input.followUpNote !== undefined ? { followUpNote: input.followUpNote } : {}),
      ...(input.attachmentNotes ? { attachmentNotes: input.attachmentNotes } : {}),
    },
  })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as { id: number; version: number; actionAt: string }
}

export const dialog = (page: Page) => page.getByRole('dialog')
export const actionsPanel = (page: Page) => page.locator('section#actions')
export const operations = (page: Page) => page.getByRole('region', { name: 'Operations' })
export const badges = (page: Page) => page.getByTestId('ticket-badges')

/** Opens the staff Ticket Detail and waits until both the Ticket and its Actions Taken have loaded. */
export async function openStaffTicket(page: Page, ticketId: number) {
  await page.goto(`/staff/tickets/${ticketId}`)
  await expect(operations(page)).toBeVisible()
  await expect(actionsPanel(page).getByRole('heading', { name: /^Actions Taken \(\d+\)$/ })).toBeVisible()
}

/** Fills the Record / Edit action dialog; `followUpNote` answers Yes, otherwise No. */
export async function fillAction(page: Page, values: { description: string; result: string; followUpNote?: string }) {
  const form = dialog(page)
  await form.getByLabel(/^Action description/).fill(values.description)
  await form.getByLabel(/^Result/).fill(values.result)
  await form.getByRole('radio', { name: values.followUpNote === undefined ? 'No' : 'Yes', exact: true }).check()
  if (values.followUpNote !== undefined) await form.getByLabel(/^Follow-up note/).fill(values.followUpNote)
}

/** Opens a row's `⋯` menu (the only row with one if `row` is omitted) and picks an item. */
export async function rowMenu(page: Page, item: 'Edit' | 'Mark follow-up done' | 'Void', row?: Locator) {
  const scope = row ?? actionsPanel(page)
  await scope.getByRole('button', { name: /^Actions for action recorded/ }).locator('visible=true').first().click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Chooses a status and saves it, confirming when the screen asks (Resolve, Close, Cancel). */
export async function changeStatus(page: Page, label: string, confirm?: string) {
  await operations(page).getByLabel('Status', { exact: true }).selectOption({ label })
  await operations(page).getByRole('button', { name: 'Save status' }).click()
  if (confirm) await dialog(page).getByRole('button', { name: confirm }).click()
  await expect(badges(page)).toContainText(label)
}

/**
 * AC-47: listens for console errors, uncaught page errors, and 404 responses on a page. `check()` fails with the
 * list of everything seen. Browsers log a failed fetch as a console error, so a step that fails a request on purpose
 * calls `allow` with the URL fragment first.
 */
export function watchConsole(page: Page) {
  const problems: string[] = []
  const allowed: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!allowed.some((fragment) => text.includes(fragment) || message.location().url.includes(fragment))) problems.push(`console: ${text} (${message.location().url})`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('response', (response) => {
    if (response.status() === 404 && !allowed.some((fragment) => response.url().includes(fragment))) problems.push(`404: ${response.url()}`)
  })
  return {
    allow: (fragment: string) => allowed.push(fragment),
    check: () => expect(problems, problems.join('\n')).toEqual([]),
  }
}

/**
 * Records list responses for `pattern`, so a drill-down can be checked against what the list itself received.
 * `latest()` is the most recent, once the page has settled.
 */
export function listResponses(page: Page, pattern: (url: URL) => boolean) {
  const seen: Response[] = []
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (response.request().method() === 'GET' && response.ok() && pattern(url)) seen.push(response)
  })
  return {
    reset: () => seen.splice(0),
    latest: async () => {
      await page.waitForLoadState('networkidle')
      expect(seen.length, 'the list requested its data').toBeGreaterThan(0)
      return seen[seen.length - 1]
    },
  }
}

/** The count a dashboard card shows, read from its accessible name ("Label: 3. View list"). */
export async function cardCount(page: Page, label: string) {
  const card = page.getByRole('link', { name: new RegExp(`^${escape(label)}: \\d+\\. View list$`) })
  const name = (await card.getAttribute('aria-label'))!
  return { card, count: Number(name.match(/: (\d+)\. View list$/)![1]) }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Keyboard only (AC-51): presses Tab until `target` has focus, then checks the focus is visible. Fails rather than
 * looping forever when the target is not in the tab order.
 */
export async function tabTo(page: Page, target: Locator, limit = 120) {
  for (let presses = 0; presses < limit; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) {
      await expectVisibleFocus(page)
      return
    }
    await page.keyboard.press('Tab')
  }
  throw new Error(`${target} was not reached with Tab`)
}

/** The focused element draws an outline or a box-shadow ring (Lab 2 focus style). */
export async function expectVisibleFocus(page: Page) {
  const ring = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element || element === document.body) return 'nothing focused'
    const style = getComputedStyle(element)
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    const shadow = style.boxShadow !== 'none'
    return outline || shadow ? 'visible' : `no ring on ${element.tagName} ${element.textContent?.trim().slice(0, 40)}`
  })
  expect(ring).toBe('visible')
}
