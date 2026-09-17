import { expect, test, type Page } from '@playwright/test'
import {
  VIEWPORTS,
  createTicket,
  expectNoHorizontalScroll,
  getReferenceData,
  postMessage,
  runTag,
  signInAs,
  staffPatch,
  type ViewportName,
} from './helpers'

const MOBILE = VIEWPORTS.mobile

test.describe('Lab 3 responsive behaviour', () => {
  const tag = runTag()
  let assigned: { id: number; ticketNumber: string }
  let unassigned: { id: number; ticketNumber: string }

  test.beforeAll(async ({ request }) => {
    await signInAs(request, 'requester')
    const { categories, systems } = await getReferenceData(request)
    const seed = (summary: string) =>
      createTicket(request, { email: 'napat.s@toktickit.dev' }, {
        summary: `${tag} ${summary}`,
        description: 'Created by the Lab 3 responsive suite so every screen has realistic content at every width.',
        categoryId: categories[0].id,
        relatedSystemId: systems[0].id,
        requestedPriority: 'HIGH',
      })

    assigned = await seed('wireless keeps dropping in the east wing meeting rooms during video calls')
    await staffPatch(request, assigned.id, 'assignment', { assigneeId: 'me' })
    await staffPatch(request, assigned.id, 'priority', { itPriority: 'URGENT' })
    await postMessage(request, 'requester', assigned.id, 'comment', 'It drops roughly every ten minutes, usually mid-call.')
    await postMessage(request, 'staff', assigned.id, 'note', 'Access point firmware scheduled for upgrade on Friday.')

    unassigned = await seed('new starter needs a laptop and building access badge')
  })

  /** Every Lab 3 screen, as the role that sees it, with the element that proves it rendered. */
  const screens: { name: string; as?: 'requester' | 'staff' | 'admin'; url: () => string; ready: (page: Page) => Promise<void> }[] = [
    { name: 'Login', url: () => '/login', ready: (page) => expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible() },
    { name: 'Change Password', as: 'requester', url: () => '/change-password', ready: (page) => expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible() },
    { name: 'My Tickets (Lab 3 shell)', as: 'requester', url: () => '/tickets', ready: (page) => expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible() },
    { name: 'Requester Ticket Detail', as: 'requester', url: () => `/tickets/${assigned.id}`, ready: (page) => expect(page.getByRole('region', { name: 'Conversation' }).getByRole('listitem').first()).toBeVisible() },
    { name: 'Ticket Queue', as: 'staff', url: () => '/staff/tickets', ready: (page) => expect(page.getByRole('heading', { name: 'Ticket Queue' })).toBeVisible().then(() => page.waitForLoadState('networkidle')) },
    { name: 'Staff Ticket Detail', as: 'staff', url: () => `/staff/tickets/${assigned.id}`, ready: (page) => expect(page.getByRole('region', { name: 'Internal Notes, not visible to the Requester' }).getByRole('listitem').first()).toBeVisible() },
    { name: 'User Management', as: 'admin', url: () => '/admin/users', ready: (page) => expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible().then(() => page.waitForLoadState('networkidle')) },
    { name: 'Forbidden state', as: 'requester', url: () => '/admin/users', ready: (page) => expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible() },
  ]

  for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
    test(`RESP-01 no horizontal page scroll on any Lab 3 screen at ${viewport} (AC-64, exit criterion)`, async ({ browser }) => {
      for (const screen of screens) {
        const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
        const page = await context.newPage()
        if (screen.as) await signInAs(page, screen.as)
        await page.goto(screen.url())
        await screen.ready(page)
        await expectNoHorizontalScroll(page, `${screen.name} at ${viewport}`)
        await context.close()
      }
    })
  }

  test('RESP-02 the Queue below 768 px renders cards, and the filter disclosure shows the active count (ui-spec §7.3)', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await signInAs(page, 'staff')
    await page.goto(`/staff/tickets?search=${encodeURIComponent(tag)}&itPriority=URGENT`)

    const card = page.getByRole('link', { name: new RegExp(assigned.ticketNumber) }).locator('visible=true')
    await expect(card).toHaveCount(1)
    await expect(card.locator('xpath=ancestor::ul[1]')).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible()
    await expect(page.getByLabel('IT Priority')).toBeHidden()

    await page.getByRole('button', { name: 'Filters (1)' }).click()
    await expect(page.getByLabel('IT Priority')).toBeVisible()
    await expect(page.getByLabel('IT Priority')).toHaveValue('URGENT')
  })

  test('RESP-03 User Management below 768 px renders cards with a full-width Edit per user (ui-spec §9.1)', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await signInAs(page, 'admin')
    await page.goto('/admin/users')

    const cards = page.getByRole('list', { name: 'Users' })
    await expect(cards).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()

    const widths = await cards.getByRole('listitem').evaluateAll((items) =>
      items.map((item) => {
        const style = getComputedStyle(item)
        const inner = item.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const edit = item.querySelector('button')!
        return { inner, edit: edit.getBoundingClientRect().width, label: edit.getAttribute('aria-label') }
      }),
    )
    expect(widths.length).toBeGreaterThan(3)
    for (const { inner, edit, label } of widths) {
      expect(label).toMatch(/^Edit /)
      expect(Math.abs(edit - inner), `${label}: ${edit}px button in a ${inner}px card`).toBeLessThanOrEqual(1)
    }
  })

  test('RESP-04 Staff Ticket Detail below 768 px puts operations, and Claim, above the description (ui-spec §8.1)', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await signInAs(page, 'staff')
    await page.goto(`/staff/tickets/${unassigned.id}`)

    const operations = await page.getByRole('heading', { name: 'Operations' }).boundingBox()
    const claim = await page.getByRole('button', { name: 'Claim' }).boundingBox()
    const description = await page.getByRole('region', { name: 'Ticket information' }).getByText('Description', { exact: true }).boundingBox()
    const information = await page.getByRole('heading', { name: 'Ticket information' }).boundingBox()

    expect(operations!.y).toBeLessThan(information!.y)
    expect(claim!.y + claim!.height).toBeLessThan(description!.y)
  })

  /** Full-screen, actions on screen, and no label or element clipped or spilling out of the dialog (ui-spec §10). */
  async function expectMobileDialog(page: Page, name: string) {
    const dialog = page.getByRole('dialog')
    await expect(dialog, name).toBeVisible()
    const layout = await dialog.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const buttons = [...element.querySelectorAll('button')].filter((button) => button.offsetParent !== null)
      const lastButton = buttons.at(-1)!.getBoundingClientRect()
      const clipped = [...element.querySelectorAll('label, legend, h2, p, button')]
        .filter((node) => (node as HTMLElement).offsetParent !== null && node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflow !== 'visible')
        .map((node) => node.textContent)
      const spilling = [...element.querySelectorAll('*')]
        .filter((node) => (node as HTMLElement).offsetParent !== null && node.getBoundingClientRect().right > box.right + 1)
        .map((node) => node.outerHTML.slice(0, 60))
      return { x: box.x, y: box.y, width: box.width, height: box.height, actionsBottom: lastButton.bottom, clipped, spilling }
    })
    expect(layout.x, `${name}: left edge`).toBeLessThanOrEqual(1)
    expect(layout.y, `${name}: top edge`).toBeLessThanOrEqual(1)
    expect(layout.width, `${name}: width`).toBeGreaterThanOrEqual(MOBILE.width - 1)
    expect(layout.height, `${name}: height`).toBeGreaterThanOrEqual(MOBILE.height - 1)
    expect(layout.actionsBottom, `${name}: actions on screen`).toBeLessThanOrEqual(MOBILE.height)
    expect(layout.clipped, `${name}: clipped text`).toEqual([])
    expect(layout.spilling, `${name}: elements outside the dialog`).toEqual([])
  }

  test('RESP-05 every dialog below 768 px is full-screen with its actions reachable (ui-spec §10)', async ({ browser }) => {
    const open = async (as: 'requester' | 'staff' | 'admin') => {
      const context = await browser.newContext({ viewport: MOBILE })
      const page = await context.newPage()
      await signInAs(page, as)
      return { context, page }
    }

    // User Management: Create, Edit, and the one-time password step.
    {
      const { context, page } = await open('admin')
      await page.goto('/admin/users')
      await page.getByRole('button', { name: 'Create user' }).click()
      await expectMobileDialog(page, 'Create user')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Edit Napat Siriwat' }).locator('visible=true').click()
      await expectMobileDialog(page, 'Edit user')
      await page.getByRole('dialog').getByRole('button', { name: 'Set a new initial password' }).click()
      await expectMobileDialog(page, 'Set a new initial password')
      await context.close()
    }

    // Staff Ticket Detail: the status confirmation.
    {
      const { context, page } = await open('staff')
      await page.goto(`/staff/tickets/${assigned.id}`)
      await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
      await page.getByRole('button', { name: 'Save status' }).click()
      await expectMobileDialog(page, 'Resolve confirmation')
      await context.close()
    }

    // Requester Ticket Detail: "Problem appears resolved".
    {
      const { context, page } = await open('requester')
      await page.goto(`/tickets/${unassigned.id}`)
      await page.getByRole('button', { name: 'Problem appears resolved' }).click()
      await expectMobileDialog(page, 'Appears-resolved confirmation')
      await context.close()
    }
  })
})
