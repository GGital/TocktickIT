import { expect, test, type Page } from '@playwright/test'
import {
  VIEWPORTS,
  actionsPanel,
  addAction,
  dialog,
  expectNoHorizontalScroll,
  openStaffTicket,
  rowMenu,
  runTag,
  signInAs,
  ticketFixture,
  type AccountName,
  type Ticket,
  type ViewportName,
} from './helpers'

/** Lab 4 screens at desktop, tablet, and mobile (tests.md §2.13, RESP-01 – RESP-05). */

const NAMES = Object.keys(VIEWPORTS) as ViewportName[]
const tag = runTag()
let worked: Ticket
let unbroken: Ticket

test.beforeAll(async ({ request }) => {
  worked = await ticketFixture(request, `${tag} projector in the training room flickers on HDMI`, { owner: 'staff', itPriority: 'URGENT' })
  await addAction(request, 'staff', worked.id, {
    description: 'Swapped the HDMI cable and updated the projector firmware to 2.4.',
    result: 'Flicker gone at 1080p; still visible at 4K.',
    followUpNote: 'Order a certified 4K cable and test again next week.',
    attachmentNotes: 'projector-firmware-log.txt',
  })
  await addAction(request, 'otherStaff', worked.id, { description: 'Tested with a second laptop.', result: 'Same flicker, so the laptop is not the cause.' })

  // RESP-05: the longest description a field allows, with no space to break on.
  unbroken = await ticketFixture(request, `${tag} log line with no spaces at all`, { owner: 'staff' })
  await addAction(request, 'staff', unbroken.id, { description: 'x'.repeat(2000), result: 'y'.repeat(1000) })
})

/** No table may be wider than the card that holds it (RESP-01). */
async function expectTablesFit(page: Page, label: string) {
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('table')]
      .filter((table) => table.offsetParent !== null)
      .map((table) => {
        const card = table.closest('.zen-card') ?? document.body
        return { caption: table.querySelector('caption')?.textContent ?? table.className, over: table.getBoundingClientRect().right - card.getBoundingClientRect().right }
      })
      .filter(({ over }) => over > 0.5),
  )
  expect(overflowing, `${label}: a table overflows its card`).toEqual([])
}

type Screen = { name: string; as: AccountName; open: (page: Page) => Promise<void> }

const dashboardReady = (page: Page, label: string) => expect(page.getByRole('link', { name: new RegExp(`^${label}: \\d+\\. View list$`) })).toBeVisible()

const SCREENS: Screen[] = [
  { name: 'Requester Dashboard', as: 'requester', open: async (page) => { await page.goto('/dashboard'); await dashboardReady(page, 'Open tickets') } },
  { name: 'Staff Dashboard', as: 'staff', open: async (page) => { await page.goto('/staff/dashboard'); await dashboardReady(page, 'Unassigned tickets') } },
  { name: 'Administrator Dashboard', as: 'admin', open: async (page) => { await page.goto('/staff/dashboard'); await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible() } },
  { name: 'Staff Ticket Detail', as: 'staff', open: (page) => openStaffTicket(page, worked.id) },
  {
    name: 'Action dialog',
    as: 'staff',
    open: async (page) => {
      await openStaffTicket(page, worked.id)
      await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
      await expect(dialog(page).getByRole('heading', { name: 'Record action' })).toBeVisible()
    },
  },
  {
    name: 'Requester Ticket Detail',
    as: 'requester',
    open: async (page) => {
      await page.goto(`/tickets/${worked.id}`)
      await expect(page.getByRole('region', { name: 'Work done by IT' }).getByRole('listitem')).toHaveCount(2)
    },
  },
]

for (const viewport of NAMES) {
  test(`RESP-01 no horizontal scroll and no table wider than its card at ${viewport} (AC-49)`, async ({ browser }) => {
    for (const screen of SCREENS) {
      const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
      const page = await context.newPage()
      await signInAs(page, screen.as)
      await screen.open(page)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalScroll(page, `${screen.name} at ${viewport}`)
      await expectTablesFit(page, `${screen.name} at ${viewport}`)
      await context.close()
    }
  })
}

test('RESP-02 the dashboard grid has 3 / 2 / 1 columns at desktop / tablet / mobile', async ({ browser }) => {
  const expected: Record<ViewportName, number> = { desktop: 3, tablet: 2, mobile: 1 }
  for (const viewport of NAMES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
    const page = await context.newPage()
    await signInAs(page, 'staff')
    await page.goto('/staff/dashboard')
    await dashboardReady(page, 'Unassigned tickets')
    // Cards on the first row share the first card's top edge.
    const columns = await page.locator('section[aria-labelledby="staff-cards"] li').evaluateAll((cards) => {
      const top = cards[0].getBoundingClientRect().top
      return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 1).length
    })
    expect(columns, viewport).toBe(expected[viewport])
    await context.close()
  }
})

test('RESP-03 Actions Taken is a table at desktop and cards at tablet and mobile', async ({ browser }) => {
  for (const viewport of NAMES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
    const page = await context.newPage()
    await signInAs(page, 'staff')
    await openStaffTicket(page, worked.id)
    const table = actionsPanel(page).locator('table')
    const header = await table.locator('thead').evaluate((element) => getComputedStyle(element).display)
    const row = await table.locator('tbody tr').first().evaluate((element) => getComputedStyle(element).display)
    if (viewport === 'desktop') expect([header, row], viewport).toEqual(['table-header-group', 'table-row'])
    else expect([header, row], viewport).toEqual(['none', 'block'])
    await context.close()
  }
})

test('RESP-04 on mobile the action form and the Void dialog are full-screen, and Save is reachable with the keyboard open', async ({ browser }) => {
  const context = await browser.newContext({ viewport: VIEWPORTS.mobile })
  const page = await context.newPage()
  await signInAs(page, 'staff')
  await openStaffTicket(page, worked.id)

  const fullScreen = async () => {
    const box = (await dialog(page).boundingBox())!
    expect(Math.round(box.width)).toBe(VIEWPORTS.mobile.width)
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(VIEWPORTS.mobile.height - 1)
  }

  await actionsPanel(page).getByRole('button', { name: 'Record action' }).click()
  await fullScreen()
  // An on-screen keyboard takes roughly half the height; the form must still reach Save.
  await page.setViewportSize({ width: VIEWPORTS.mobile.width, height: 420 })
  await dialog(page).getByLabel(/^Action description/).focus()
  const save = dialog(page).getByRole('button', { name: 'Save action' })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await page.setViewportSize(VIEWPORTS.mobile)

  await rowMenu(page, 'Void', actionsPanel(page).locator('tbody tr').filter({ hasText: 'Swapped the HDMI cable' }))
  await expect(dialog(page).getByLabel(/^Reason for voiding/)).toBeVisible()
  await fullScreen()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await context.close()
})

test('RESP-05 a 2000-character unbroken description wraps and clamps without page scroll', async ({ browser }) => {
  for (const viewport of NAMES) {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
    const page = await context.newPage()
    await signInAs(page, 'staff')
    await openStaffTicket(page, unbroken.id)
    await expectNoHorizontalScroll(page, `staff detail at ${viewport}`)
    const text = actionsPanel(page).locator('.zen-action-text').first()
    const { height, wraps } = await text.evaluate((element) => ({ height: element.clientHeight, wraps: element.scrollWidth <= element.clientWidth }))
    expect(wraps, `${viewport}: the description stays inside its column`).toBe(true)
    // Clamped to three lines until "Show more".
    expect(height, `${viewport}: clamped`).toBeLessThan(100)
    await expect(actionsPanel(page).getByRole('button', { name: 'Show more' })).toBeVisible()

    await signInAs(page, 'requester')
    await page.goto(`/tickets/${unbroken.id}`)
    await expect(page.getByRole('region', { name: 'Work done by IT' }).getByRole('listitem')).toHaveCount(1)
    await expectNoHorizontalScroll(page, `requester detail at ${viewport}`)
    await context.close()
  }
})
