import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  API,
  PASSWORD,
  VIEWPORTS,
  createTicket,
  createUserReady,
  expectNoHorizontalScroll,
  getReferenceData,
  postMessage,
  rearmFirstLogin,
  removeFixtureUsers,
  runTag,
  signInAs,
  signInThroughUi,
  staffPatch,
  type AccountName,
  type ViewportName,
} from './helpers'

/** tests.md §4.3 / ui-spec §14: every state, at every viewport, as `<state>.<viewport>.png`. */
const INVENTORY = {
  authentication: ['login-initial', 'login-invalid', 'login-inactive', 'login-submitting', 'change-password-mandatory', 'change-password-validation', 'shell-signed-in', 'logged-out'],
  'staff-queue': ['loading', 'loaded', 'filtered', 'no-results', 'empty', 'forbidden', 'failure', 'page-2'],
  'staff-ticket-detail': ['loaded', 'claim', 'priority', 'status-confirm', 'invalid-transition', 'public-comment', 'internal-note', 'forbidden'],
  'user-management': ['list', 'search', 'role-filter', 'create', 'created-password', 'edit', 'duplicate-email', 'self-deactivation', 'last-administrator', 'forbidden'],
} as const

type Folder = keyof typeof INVENTORY
type Prepare = (page: Page, viewport: ViewportName) => Promise<void | { fullPage?: boolean }>

const ROOT = path.resolve('artifacts/lab-03/screenshots')
const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[]
const tag = runTag()

/** Captures one state at all three viewports, each in a fresh browser context signed in as `as`. */
function state<F extends Folder>(folder: F, name: (typeof INVENTORY)[F][number], as: AccountName | null, prepare: Prepare) {
  test(`${folder}/${name}`, async ({ browser }) => {
    for (const viewport of VIEWPORT_NAMES) {
      const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
      const page = await context.newPage()
      if (as) await signInAs(page, as)
      const options = (await prepare(page, viewport)) ?? {}
      await expectNoHorizontalScroll(page, `${folder}/${name}.${viewport}`)
      await page.screenshot({ path: path.join(ROOT, folder, `${name}.${viewport}.png`), fullPage: options.fullPage ?? true })
      await context.close()
    }
  })
}

const dialog = (page: Page) => page.getByRole('dialog')
const settled = (page: Page) => page.waitForLoadState('networkidle')

// --- Authentication ---------------------------------------------------------------------------------------------

test.describe('authentication screenshots', () => {
  let inactiveEmail: string

  test.beforeAll(async ({ request }) => {
    // A per-run inactive account, so repeated captures never push the seeded one towards the login throttle.
    const inactive = await createUserReady(request, { key: `inactive.${tag.toLowerCase()}`, fullName: 'Inactive Capture', role: 'REQUESTER', isActive: false })
    inactiveEmail = inactive.email
  })

  const failedSignIn = async (page: Page, email: string, password: string) => {
    await signInThroughUi(page, email, password)
    await expect(page.getByRole('alert')).toBeVisible()
  }

  state('authentication', 'login-initial', null, async (page) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  state('authentication', 'login-invalid', null, async (page) => {
    await failedSignIn(page, ACCOUNTS.requester.email, 'not-the-password-2026')
    // A successful sign-in on a separate request clears the failure count again (BR-08).
    const cleared = await page.context().request.post(`${API}/auth/login`, { data: { email: ACCOUNTS.requester.email, password: PASSWORD } })
    expect(cleared.status()).toBe(200)
    await page.context().clearCookies()
  })

  state('authentication', 'login-inactive', null, async (page) => {
    await failedSignIn(page, inactiveEmail, `${PASSWORD}-initial`)
  })

  state('authentication', 'login-submitting', null, async (page) => {
    // The sign-in request is held, never answered, so the busy state stays on screen for the capture; closing the
    // context afterwards discards it.
    await page.route('**/api/auth/login', () => new Promise(() => undefined))
    await page.goto('/login')
    await page.getByLabel('Email address').fill(ACCOUNTS.requester.email)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('button', { name: 'Signing in…' })).toBeVisible()
  })

  const mandatoryChange = async (page: Page) => {
    await rearmFirstLogin(page.context().request)
    await page.context().clearCookies()
    await signInThroughUi(page, ACCOUNTS.firstLogin.email, PASSWORD)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  }

  state('authentication', 'change-password-mandatory', null, mandatoryChange)

  state('authentication', 'change-password-validation', null, async (page) => {
    await mandatoryChange(page)
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('textbox', { name: 'New password', exact: true }).fill('short')
    await page.getByLabel('Confirm new password').fill('different')
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
  })

  state('authentication', 'shell-signed-in', 'requester', async (page) => {
    await page.goto('/tickets')
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
    await settled(page)
  })

  state('authentication', 'logged-out', 'requester', async (page) => {
    await page.goto('/tickets')
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })
})

// --- IT Staff Ticket Queue -------------------------------------------------------------------------------------

test.describe('staff queue screenshots', () => {
  const emptyPage = JSON.stringify({ data: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, sortBy: 'itPriority', sortOrder: 'desc' } })
  const listVisible = (page: Page, viewport: ViewportName) =>
    expect(viewport === 'mobile' ? page.locator('ul.list-unstyled').first() : page.getByRole('table')).toBeVisible()

  state('staff-queue', 'loading', 'staff', async (page) => {
    // The three count requests (pageSize=10) answer; the list request itself never does.
    await page.route('**/api/staff/tickets?*', (route) => (route.request().url().includes('pageSize=10') ? route.continue() : new Promise(() => undefined)))
    await page.route('**/api/staff/tickets', () => new Promise(() => undefined))
    await page.goto('/staff/tickets')
    await expect(page.getByText('Loading the ticket queue…').first()).toBeAttached()
  })

  state('staff-queue', 'loaded', 'staff', async (page, viewport) => {
    await page.goto('/staff/tickets')
    await listVisible(page, viewport)
    await expect(page.getByText(/open · .* unassigned · .* waiting for requester/)).toBeVisible()
    await settled(page)
  })

  state('staff-queue', 'filtered', 'staff', async (page, viewport) => {
    await page.goto('/staff/tickets')
    await listVisible(page, viewport)
    if (viewport === 'mobile') await page.getByRole('button', { name: /^Filters/ }).click()
    await page.locator('summary', { hasText: 'Status' }).click()
    await page.getByRole('button', { name: 'Open work' }).click()
    await page.getByLabel('Owner').selectOption('me')
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await settled(page)
  })

  state('staff-queue', 'no-results', 'staff', async (page) => {
    await page.goto('/staff/tickets?search=no-ticket-matches-this-kingfisher')
    await expect(page.getByRole('heading', { name: 'No tickets match these filters.' })).toBeVisible()
  })

  state('staff-queue', 'empty', 'staff', async (page) => {
    // An empty database cannot be staged on shared data, so only the list response is replaced.
    await page.route('**/api/staff/tickets', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: emptyPage }))
    await page.goto('/staff/tickets')
    await expect(page.getByRole('heading', { name: 'No tickets have been created yet.' })).toBeVisible()
  })

  state('staff-queue', 'forbidden', 'requester', async (page) => {
    await page.goto('/staff/tickets')
    await expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible()
  })

  state('staff-queue', 'failure', 'staff', async (page) => {
    await page.route('**/api/staff/tickets', (route) => route.abort('failed'))
    await page.goto('/staff/tickets')
    await expect(page.getByText('Unable to load the ticket queue.')).toBeVisible()
  })

  state('staff-queue', 'page-2', 'staff', async (page, viewport) => {
    await page.goto('/staff/tickets?page=2')
    await listVisible(page, viewport)
    await settled(page)
  })
})

// --- IT Staff Ticket Detail -----------------------------------------------------------------------------------

test.describe('staff ticket detail screenshots', () => {
  let counter = 0

  /** A realistic Ticket with a conversation on both sides, set up through the API only. */
  async function detailFixture(request: APIRequestContext, options: { unassigned?: boolean; resolvedAndFlagged?: boolean } = {}) {
    counter += 1
    await signInAs(request, 'requester')
    const { categories, systems } = await getReferenceData(request)
    const ticket = await createTicket(request, ACCOUNTS.requester, {
      summary: `${tag} VPN disconnects every few minutes (${counter})`,
      description: 'Since the firmware update last Tuesday the VPN drops every ten minutes.\nReconnecting works, but any open file transfer fails and has to restart.',
      categoryId: categories.find((category) => category.name === 'Network')?.id ?? categories[0].id,
      relatedSystemId: systems[0].id,
      requestedPriority: 'HIGH',
    })
    await postMessage(request, 'requester', ticket.id, 'comment', 'The VPN drops every ten minutes, usually during video calls.')
    if (!options.unassigned) await staffPatch(request, ticket.id, 'assignment', { assigneeId: 'me' })
    await postMessage(request, 'staff', ticket.id, 'comment', 'We have replaced your VPN profile. Please try again and tell us if it still drops.')
    await postMessage(request, 'staff', ticket.id, 'note', 'Vendor case 118822 opened for the gateway firmware.')
    await postMessage(request, 'staff', ticket.id, 'note', 'Rollback to firmware 4.2 scheduled for Friday night.')
    if (options.resolvedAndFlagged) {
      await staffPatch(request, ticket.id, 'status', { status: 'RESOLVED' })
      await signInAs(request, 'requester')
      expect((await request.post(`${API}/tickets/${ticket.id}/appears-resolved`, { data: {} })).status()).toBe(200)
    }
    return ticket
  }

  const open = async (page: Page, ticketId: number) => {
    await page.goto(`/staff/tickets/${ticketId}`)
    await expect(page.getByRole('region', { name: 'Operations' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Internal Notes, not visible to the Requester' }).getByRole('listitem').first()).toBeVisible()
  }
  const withFixture = (options: Parameters<typeof detailFixture>[1], after: (page: Page, ticketId: number) => Promise<void | { fullPage?: boolean }>): Prepare =>
    async (page) => {
      const ticket = await detailFixture(page.context().request, options)
      await signInAs(page, 'staff')
      await open(page, ticket.id)
      return after(page, ticket.id)
    }

  state('staff-ticket-detail', 'loaded', null, withFixture({ resolvedAndFlagged: true }, async () => undefined))

  state('staff-ticket-detail', 'claim', null, withFixture({ unassigned: true }, async (page) => {
    await page.getByRole('button', { name: 'Claim' }).click()
    await expect(page.getByText('Ticket claimed.')).toBeAttached()
  }))

  state('staff-ticket-detail', 'priority', null, withFixture({}, async (page) => {
    await page.getByRole('radio', { name: 'Urgent', exact: true }).check()
    await expect(page.getByText('IT Priority saved.')).toBeAttached()
  }))

  state('staff-ticket-detail', 'status-confirm', null, withFixture({}, async (page) => {
    await page.getByLabel('Status', { exact: true }).selectOption('RESOLVED')
    await page.getByRole('button', { name: 'Save status' }).click()
    await expect(dialog(page)).toBeVisible()
    return { fullPage: false }
  }))

  state('staff-ticket-detail', 'invalid-transition', null, withFixture({}, async (page, ticketId) => {
    // Another staff member cancels the Ticket behind this screen, so the next save meets a real 409.
    await staffPatch(page.context().request, ticketId, 'status', { status: 'CANCELLED' })
    await page.getByLabel('Status', { exact: true }).selectOption('IN_PROGRESS')
    await page.getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText('This ticket cannot move from Open to In Progress.')).toBeVisible()
  }))

  state('staff-ticket-detail', 'public-comment', null, withFixture({}, async (page) => {
    const panel = page.getByRole('region', { name: 'Public Comments' })
    await panel.getByLabel('Public — the Requester will see this.').fill('Please restart the VPN client once more and let us know if the drops continue.')
    await panel.getByRole('button', { name: 'Post comment' }).click()
    await expect(panel.getByRole('listitem').filter({ hasText: 'Please restart the VPN client once more' })).toBeVisible()
  }))

  state('staff-ticket-detail', 'internal-note', null, withFixture({}, async (page) => {
    const panel = page.getByRole('region', { name: 'Internal Notes, not visible to the Requester' })
    await panel.getByLabel('Internal — not visible to the Requester.').fill('Requester confirmed the drops stop on a 4G hotspot, so the office gateway is the likely cause.')
    await panel.getByRole('button', { name: 'Post note' }).click()
    await expect(panel.getByRole('listitem').filter({ hasText: 'office gateway is the likely cause' })).toBeVisible()
  }))

  state('staff-ticket-detail', 'forbidden', null, async (page) => {
    const ticket = await detailFixture(page.context().request)
    await signInAs(page, 'requester')
    await page.goto(`/staff/tickets/${ticket.id}`)
    await expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible()
  })
})

// --- Administrator User Management ---------------------------------------------------------------------------

test.describe('user management screenshots', () => {
  const key = (name: string) => `${name}.${tag.toLowerCase()}`
  const listReady = async (page: Page, viewport: ViewportName) => {
    await page.goto('/admin/users')
    await expect(viewport === 'mobile' ? page.getByRole('list', { name: 'Users' }) : page.getByRole('table')).toBeVisible()
  }
  const edit = (page: Page, name: string) => page.getByRole('button', { name: `Edit ${name}` }).locator('visible=true').first().click()

  test.beforeAll(async ({ request }) => {
    for (const [name, fullName, role, isActive] of [
      ['anong.kaewmanee', 'Anong Kaewmanee', 'IT_STAFF', true],
      ['boonsri.thammarat.registrar.office', 'Boonsri Thammarat', 'REQUESTER', true],
      ['chanida.phromma', 'Chanida Phromma', 'REQUESTER', false],
      ['decha.wattanakul', 'Decha Wattanakul', 'ADMINISTRATOR', true],
    ] as const) {
      await createUserReady(request, { key: key(name), fullName, role, isActive })
    }
  })

  test.afterAll(async () => {
    await removeFixtureUsers()
  })

  state('user-management', 'list', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    await settled(page)
  })

  state('user-management', 'search', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    const searched = page.waitForResponse((response) => response.url().includes('search=e2e.toktickit'))
    await page.getByLabel('Search name or email').fill('e2e.toktickit')
    await searched
    await settled(page)
  })

  state('user-management', 'role-filter', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    const filtered = page.waitForResponse((response) => response.url().includes('role=IT_STAFF'))
    await page.getByLabel('Role', { exact: true }).selectOption('IT_STAFF')
    await filtered
    await settled(page)
  })

  state('user-management', 'edit', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    await edit(page, 'Anong Kaewmanee')
    await expect(dialog(page).getByLabel(/^Full name/)).toBeVisible()
    return { fullPage: false }
  })

  state('user-management', 'duplicate-email', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    await edit(page, 'Anong Kaewmanee')
    await dialog(page).getByLabel(/^Email address/).fill(`${key('chanida.phromma')}@e2e.toktickit.test`.toUpperCase())
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page).getByText('That email address is already in use.')).toBeVisible()
    return { fullPage: false }
  })

  state('user-management', 'self-deactivation', 'admin', async (page, viewport) => {
    await listReady(page, viewport)
    await edit(page, ACCOUNTS.admin.fullName)
    await dialog(page).getByRole('radio', { name: 'Inactive', exact: true }).check()
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page).getByText('You cannot deactivate your own account or change your own role.')).toBeVisible()
    return { fullPage: false }
  })

  state('user-management', 'last-administrator', 'admin', async (page, viewport) => {
    // Over HTTP this refusal only happens when two Administrators remove each other at once — E2E-09 proves that
    // race for real. The capture answers one PATCH with the API's own error body so the state is deterministic.
    await page.route('**/api/admin/users/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'LAST_ACTIVE_ADMINISTRATOR', message: 'At least one active Administrator must remain.' } }) })
        : route.continue(),
    )
    await listReady(page, viewport)
    await edit(page, 'Decha Wattanakul')
    await dialog(page).getByRole('radio', { name: 'Inactive', exact: true }).check()
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page).getByText('There must be at least one active administrator.')).toBeVisible()
    return { fullPage: false }
  })

  state('user-management', 'forbidden', 'staff', async (page) => {
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'You do not have access to this page.' })).toBeVisible()
  })

  // Creating users last keeps them out of the list, search, and filter captures above.
  const fillCreate = async (page: Page, viewport: ViewportName, emailName: string) => {
    await listReady(page, viewport)
    await page.getByRole('button', { name: 'Create user' }).click()
    await dialog(page).getByLabel(/^Full name/).fill('Malee Srisuk')
    await dialog(page).getByLabel(/^Email address/).fill(`${key(emailName)}@e2e.toktickit.test`)
    await dialog(page).getByRole('radio', { name: 'IT Staff', exact: true }).check()
    await dialog(page).getByRole('radio', { name: 'Active', exact: true }).check()
    await dialog(page).getByRole('textbox', { name: 'Initial password', exact: true }).fill('first-login-2026')
  }

  state('user-management', 'create', 'admin', async (page, viewport) => {
    await fillCreate(page, viewport, `malee.srisuk.${viewport}`)
    return { fullPage: false }
  })

  state('user-management', 'created-password', 'admin', async (page, viewport) => {
    await fillCreate(page, viewport, `malee.srisuk.created.${viewport}`)
    await dialog(page).getByRole('button', { name: 'Create user' }).click()
    await expect(dialog(page).getByRole('heading', { name: 'Account created' })).toBeVisible()
    return { fullPage: false }
  })
})

// --- RESP-06 -------------------------------------------------------------------------------------------------

test.describe('RESP-06 screenshot inventory (DoD, ui-spec §14)', () => {
  test('every documented state exists at desktop, tablet, and mobile', () => {
    const missing = Object.entries(INVENTORY).flatMap(([folder, states]) =>
      states.flatMap((name) => VIEWPORT_NAMES.map((viewport) => path.join(folder, `${name}.${viewport}.png`))),
    ).filter((file) => !fs.existsSync(path.join(ROOT, file)))

    expect(missing).toEqual([])
  })
})

