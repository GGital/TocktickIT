import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  API,
  FIXTURE_DOMAIN,
  PASSWORD,
  createUserReady,
  db,
  removeFixtureUsers,
  runTag,
  signInAs,
  signInThroughUi,
} from './helpers'

const dialog = (page: Page) => page.getByRole('dialog')

async function openUsers(page: Page, search?: string) {
  await page.goto('/admin/users')
  await expect(page.getByRole('table')).toBeVisible()
  if (search) {
    const filtered = page.waitForResponse((response) => response.url().includes('/api/admin/users?search='))
    await page.getByLabel('Search name or email').fill(search)
    await filtered
  }
}

const editUser = async (page: Page, name: string) => {
  await page.getByRole('table').getByRole('button', { name: `Edit ${name}` }).click()
  await expect(dialog(page)).toBeVisible()
}

test.afterAll(async () => {
  await removeFixtureUsers()
})

test.describe('E2E-08 an Administrator creates a user who then signs in (AC-53, AC-60)', () => {
  test('the initial password is shown once; the new user is forced through Change Password to their home screen', async ({ browser, page }) => {
    const tag = runTag().toLowerCase()
    const email = `newcomer.${tag}${FIXTURE_DOMAIN}`

    await signInAs(page, 'admin')
    await openUsers(page)
    await page.getByRole('button', { name: 'Create user' }).click()
    await dialog(page).getByLabel(/^Full name/).fill(`Newcomer ${tag}`)
    await dialog(page).getByLabel(/^Email address/).fill(email)
    await dialog(page).getByRole('radio', { name: 'Requester', exact: true }).check()
    await dialog(page).getByRole('radio', { name: 'Active', exact: true }).check()
    await dialog(page).getByRole('textbox', { name: 'Initial password', exact: true }).fill('handover-e2e-2026')
    await dialog(page).getByRole('button', { name: 'Create user' }).click()

    await expect(dialog(page).getByRole('heading', { name: 'Account created' })).toBeVisible()
    await expect(dialog(page)).toContainText('It is shown only once')
    const shown = (await dialog(page).locator('output').textContent())!
    expect(shown).toBe('handover-e2e-2026')

    await dialog(page).getByRole('button', { name: 'Done' }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await page.content()).not.toContain(shown)
    await page.getByLabel('Search name or email').fill(tag)
    await page.getByRole('table').getByRole('button', { name: `Edit Newcomer ${tag}` }).click()
    expect(await page.content()).not.toContain(shown)

    const newcomer = await browser.newContext()
    const newcomerPage = await newcomer.newPage()
    await signInThroughUi(newcomerPage, email, shown)
    await expect(newcomerPage).toHaveURL(/\/change-password$/)
    await newcomerPage.goto('/tickets')
    await expect(newcomerPage).toHaveURL(/\/change-password$/)

    await newcomerPage.getByLabel('Current password').fill(shown)
    await newcomerPage.getByRole('textbox', { name: 'New password', exact: true }).fill(PASSWORD)
    await newcomerPage.getByLabel('Confirm new password').fill(PASSWORD)
    await newcomerPage.getByRole('button', { name: 'Save new password' }).click()

    await expect(newcomerPage).toHaveURL(/\/tickets$/)
    await expect(newcomerPage.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
    await newcomer.close()
  })
})

test.describe('E2E-09 refusals change nothing (AC-54, AC-58, AC-59)', () => {
  test('a duplicate email is refused below the Email field and no account is written', async ({ page }) => {
    await signInAs(page, 'admin')
    await openUsers(page)
    const before = await (await page.request.get(`${API}/admin/users`)).json()

    await page.getByRole('button', { name: 'Create user' }).click()
    await dialog(page).getByLabel(/^Full name/).fill('Duplicate Napat')
    await dialog(page).getByLabel(/^Email address/).fill(ACCOUNTS.requester.email.toUpperCase())
    await dialog(page).getByRole('radio', { name: 'Requester', exact: true }).check()
    await dialog(page).getByRole('radio', { name: 'Active', exact: true }).check()
    await dialog(page).getByRole('textbox', { name: 'Initial password', exact: true }).fill('duplicate-e2e-2026')
    await dialog(page).getByRole('button', { name: 'Create user' }).click()

    await expect(dialog(page).getByText('That email address is already in use.')).toBeVisible()
    await expect(dialog(page).getByLabel(/^Email address/)).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog(page).getByLabel(/^Full name/)).toHaveValue('Duplicate Napat')

    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    const after = await (await page.request.get(`${API}/admin/users`)).json()
    expect(after).toEqual(before)
  })

  test('self-deactivation is refused with its own message and the controls return to the stored values', async ({ page }) => {
    await signInAs(page, 'admin')
    await openUsers(page, 'admin@toktickit.dev')
    await editUser(page, ACCOUNTS.admin.fullName)

    await dialog(page).getByRole('radio', { name: 'Inactive', exact: true }).check()
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog(page).getByRole('alert')).toContainText('You cannot deactivate your own account or change your own role.')
    await expect(dialog(page).getByRole('radio', { name: 'Active', exact: true })).toBeChecked()
    const [stored] = await (await page.request.get(`${API}/admin/users?search=admin%40toktickit.dev`)).json()
    expect(stored).toMatchObject({ isActive: true, role: 'ADMINISTRATOR' })
  })

  test('the last two Administrators deactivating each other at once leave one active, and the refused one sees the rule', async ({ browser, request }) => {
    const tag = runTag().toLowerCase()
    const second = await createUserReady(request, { key: `second-admin.${tag}`, fullName: `Second Admin ${tag}`, role: 'ADMINISTRATOR' })
    const seeded = await signInAs(request, 'admin')
    const pair = [seeded.id, second.id]
    const database = db()
    // Every other active Administrator is parked so these two really are the last two (tests.md §1.4).
    const parked = ((await database.user.findMany({ where: { role: 'ADMINISTRATOR', isActive: true, id: { notIn: pair } }, select: { id: true } })) as { id: number }[]).map((user) => user.id)
    await database.user.updateMany({ where: { id: { in: parked } }, data: { isActive: false } })

    const racer = async (browserInstance: Browser, account: { email: string }, target: string) => {
      const context = await browserInstance.newContext()
      const page = await context.newPage()
      await signInAs(page, account)
      await openUsers(page, target)
      await editUser(page, target)
      await dialog(page).getByRole('radio', { name: 'Inactive', exact: true }).check()
      return { context, page }
    }

    let refusalSeen = false
    try {
      // Every round runs, even after a refusal has been seen: a single round can serialise by chance, and only
      // repeated overlap reliably exposes a missing lock (without it, a round ends with zero Administrators).
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        await database.user.updateMany({ where: { id: { in: pair } }, data: { isActive: true, role: 'ADMINISTRATOR' } })
        const one = await racer(browser, ACCOUNTS.admin, second.fullName)
        const two = await racer(browser, { email: second.email }, ACCOUNTS.admin.fullName)

        // Both PATCH requests are held in their browsers and released together, so they reach the API at once.
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => (release = resolve))
        let held = 0
        for (const { page } of [one, two]) {
          await page.route('**/api/admin/users/*', async (route) => {
            if (route.request().method() !== 'PATCH') return route.continue()
            held += 1
            await gate
            await route.continue()
          })
        }
        const responses = [one, two].map(({ page }) => page.waitForResponse((response) => response.request().method() === 'PATCH'))
        await Promise.all([one, two].map(({ page }) => dialog(page).getByRole('button', { name: 'Save changes' }).click()))
        await expect.poll(() => held).toBe(2)
        release()
        const statuses = await Promise.all(responses.map(async (response) => (await response).status()))

        expect(await database.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }), `attempt ${attempt}: ${statuses}`).toBe(1)
        expect(statuses.filter((status) => status === 200), `attempt ${attempt}`).toHaveLength(1)

        // The loser is refused by the rule — or, if the winner's commit already ended its session, by authentication.
        const loser = statuses[0] === 200 ? two : one
        if (statuses.includes(409)) {
          await expect(dialog(loser.page).getByRole('alert')).toContainText('There must be at least one active administrator.')
          await expect(dialog(loser.page).getByRole('radio', { name: 'Active', exact: true })).toBeChecked()
          refusalSeen = true
        }
        await one.context.close()
        await two.context.close()
      }
      expect(refusalSeen, 'no attempt produced the 409 refusal in the browser').toBe(true)
    } finally {
      await database.user.updateMany({ where: { id: { in: [...parked, seeded.id] } }, data: { isActive: true, role: 'ADMINISTRATOR' } })
      await database.user.updateMany({ where: { id: second.id }, data: { isActive: false } })
    }
  })
})

test.describe('E2E-10 a Requester opens staff and Administrator URLs directly (AC-21)', () => {
  test('both render the forbidden state, and the underlying API calls answer 403', async ({ page }) => {
    await signInAs(page, 'requester')

    for (const url of ['/admin/users', '/staff/tickets']) {
      await page.goto(url)
      await expect(page.getByRole('heading', { name: 'You do not have access to this page.' }), url).toBeVisible()
      await expect(page.getByText('Your account has the Requester role, which cannot open this screen.')).toBeVisible()
    }

    for (const url of ['/admin/users', '/staff/tickets']) {
      const response = await page.request.get(`${API}${url}`)
      expect(response.status(), url).toBe(403)
      expect((await response.json()).error.code).toBe('FORBIDDEN')
    }
  })
})
