import { expect, test } from '@playwright/test'
import {
  ACCOUNTS,
  API,
  PASSWORD,
  createTicket,
  getReferenceData,
  rearmFirstLogin,
  runTag,
  signInAs,
  signInThroughUi,
} from './helpers'

const INVALID = 'Email or password is incorrect, or the account is not active.'

// E2E-02 runs first: its one failed attempt against the Requester is cleared by E2E-01's successful sign-in, so
// repeated runs never accumulate towards the login throttle (BR-08).
test.describe('E2E-02 failed sign-ins are indistinguishable (AC-02, BR-01)', () => {
  test('a wrong password, an unknown address, and the inactive account show the same busy-then-failure screen', async ({ page }) => {
    const tag = runTag().toLowerCase()
    const attempts = [
      { label: 'wrong password', email: ACCOUNTS.requester.email, password: 'not-the-password-2026' },
      { label: 'unknown address', email: `nobody.${tag}@toktickit.dev`, password: PASSWORD },
      { label: 'inactive account', email: ACCOUNTS.inactive.email, password: PASSWORD },
    ]

    // Each attempt is held briefly so the busy state is observable, then released to the real API.
    let release: () => void = () => undefined
    await page.route('**/api/auth/login', async (route) => {
      await new Promise<void>((resolve) => (release = resolve))
      await route.continue()
    })

    const screens: string[] = []
    for (const attempt of attempts) {
      await page.goto('/login')
      await page.getByLabel('Email address').fill(attempt.email)
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(attempt.password)
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page.getByRole('button', { name: 'Signing in…' }), attempt.label).toBeDisabled()
      release()

      await expect(page.getByRole('alert'), attempt.label).toContainText(INVALID)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveValue('')
      // Everything the reader sees, apart from the email they typed themselves, is identical.
      screens.push(await page.locator('main').innerText())
    }

    expect(new Set(screens).size, 'the three failure screens differ').toBe(1)
  })
})

test.describe('E2E-01 sign in, work, sign out (AC-01, AC-05, AC-06)', () => {
  test('opens the role home, and after logout a direct URL shows Login with none of the previous data', async ({ page, request }) => {
    const tag = runTag()
    await signInAs(request, 'requester')
    const { categories, systems } = await getReferenceData(request)
    const ticket = await createTicket(request, ACCOUNTS.requester, {
      summary: `${tag} laptop dock stops charging after sleep`,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
    })

    await signInThroughUi(page, ACCOUNTS.requester.email, PASSWORD)

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()
    await expect(page.getByText(`Signed in as ${ACCOUNTS.requester.fullName}`)).toBeVisible()

    // Work: open a Ticket from the list.
    await page.getByLabel('Search', { exact: true }).fill(tag)
    await page.getByRole('link', { name: ticket.ticketNumber }).first().click()
    await expect(page.getByRole('heading', { name: ticket.ticketNumber })).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await page.goto(`/tickets/${ticket.id}`)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    expect(await page.content()).not.toContain(tag)
    expect(await page.content()).not.toContain(ticket.ticketNumber)

    // The session is really gone, not just hidden.
    expect((await page.request.get(`${API}/auth/me`)).status()).toBe(401)
  })
})

test.describe('E2E-03 the mandatory first password change (AC-10, AC-13)', () => {
  const NEW_PASSWORD = 'E2E-first-login-changed-2026'

  test('the application opens only after a valid new password; direct URLs return to Change Password; the old password then fails', async ({ page, request }) => {
    await rearmFirstLogin(request)

    await signInThroughUi(page, ACCOUNTS.firstLogin.email, PASSWORD)
    await expect(page).toHaveURL(/\/change-password$/)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

    // Every application URL leads back here while the change is outstanding.
    for (const url of ['/tickets', '/tickets/new', '/staff/tickets']) {
      await page.goto(url)
      await expect(page, url).toHaveURL(/\/change-password$/)
    }
    expect((await page.request.get(`${API}/tickets`)).status()).toBe(403)

    // An invalid attempt keeps the gate closed.
    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByRole('textbox', { name: 'New password', exact: true }).fill('short')
    await page.getByLabel('Confirm new password').fill('short')
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
    await expect(page).toHaveURL(/\/change-password$/)

    await page.getByRole('textbox', { name: 'New password', exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save new password' }).click()

    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.getByRole('heading', { name: 'My Tickets' })).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await signInThroughUi(page, ACCOUNTS.firstLogin.email, PASSWORD)
    await expect(page.getByRole('alert')).toContainText(INVALID)

    await signInThroughUi(page, ACCOUNTS.firstLogin.email, NEW_PASSWORD)
    await expect(page).toHaveURL(/\/tickets$/)

    // Leave the dedicated account armed for the next run.
    await rearmFirstLogin(request)
  })
})
