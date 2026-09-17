import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { createTicket as createLab2Ticket, type Requester } from '../lab-02/helpers'

export { VIEWPORTS, getReferenceData, runTag, type ViewportName } from '../lab-02/helpers'

export const API = 'http://localhost:3000/api'

/** README local-development credential — a test fixture, not a secret (BR-12). */
export const PASSWORD = 'TokTick-Local-Dev-1'

/** Addresses of users the Lab 3 suite creates; removed again in teardown because the API has no deletion (BR-53). */
export const FIXTURE_DOMAIN = '@e2e.toktickit.test'

/**
 * One seeded account per role (specification §7.5). Every one of them has `mustChangePassword = false` except
 * `firstLogin`, the dedicated mandatory-change account that only E2E-03 signs in with (tests.md §1.3, A-19).
 */
export const ACCOUNTS = {
  requester: { email: 'napat.s@toktickit.dev', fullName: 'Napat Siriwat' },
  otherRequester: { email: 'pimchanok.t@toktickit.dev', fullName: 'Pimchanok Thanee' },
  staff: { email: 'thanawat.it@toktickit.dev', fullName: 'Thanawat Chaiyo' },
  otherStaff: { email: 'malee.it@toktickit.dev', fullName: 'Malee Srisuk' },
  admin: { email: 'admin@toktickit.dev', fullName: 'Suda Administrator' },
  inactive: { email: 'former.staff@toktickit.dev', fullName: 'Somchai Retired' },
  firstLogin: { email: 'kittipong.w@toktickit.dev', fullName: 'Kittipong Wong' },
} as const

export type AccountName = keyof typeof ACCOUNTS
export type Account = { email: string; fullName?: string }

/** Signs a request context — or a page, whose request context shares the browser's cookies — in as an account. */
export async function signInAs(target: Page | APIRequestContext, account: Account | AccountName, password = PASSWORD) {
  const request = 'request' in target ? target.request : target
  const { email } = typeof account === 'string' ? ACCOUNTS[account] : account
  const response = await request.post(`${API}/auth/login`, { data: { email, password } })
  expect(response.status(), `sign-in as ${email}; run \`npx prisma db seed\` so the accounts exist`).toBe(200)
  return (await response.json()) as { id: number; fullName: string; email: string; role: string; mustChangePassword: boolean }
}

/** Signs in through the Login screen itself, for the specs whose subject is authentication. */
export async function signInThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/**
 * Puts the dedicated first-login account back into its seeded state — known password, change outstanding — through
 * the Administrator API (BR-54), so E2E-03 can run again after it has already changed that password once.
 */
export async function rearmFirstLogin(request: APIRequestContext) {
  await signInAs(request, 'admin')
  const [user] = (await (await request.get(`${API}/admin/users?search=${encodeURIComponent(ACCOUNTS.firstLogin.email)}`)).json()) as { id: number }[]
  const reset = await request.post(`${API}/admin/users/${user.id}/initial-password`, { data: { initialPassword: PASSWORD } })
  expect(reset.status(), await reset.text()).toBe(200)
}

/** Creates a user through the Administrator API; the account is ready to sign in with `password` and no pending change. */
export async function createUserReady(
  request: APIRequestContext,
  values: { key: string; fullName: string; role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'; isActive?: boolean },
  password = PASSWORD,
) {
  const email = `${values.key}${FIXTURE_DOMAIN}`
  await signInAs(request, 'admin')
  const created = await request.post(`${API}/admin/users`, {
    data: { fullName: values.fullName, email, role: values.role, isActive: values.isActive ?? true, initialPassword: `${password}-initial` },
  })
  expect(created.status(), await created.text()).toBe(201)
  const user = (await created.json()).user as { id: number; email: string; fullName: string }

  // An inactive account cannot sign in to change its password, and never needs to.
  if (values.isActive !== false) {
    await signInAs(request, { email }, `${password}-initial`)
    const changed = await request.post(`${API}/auth/change-password`, {
      data: { currentPassword: `${password}-initial`, newPassword: password, confirmPassword: password },
    })
    expect(changed.status(), await changed.text()).toBe(200)
  }
  return user
}

/** Staff operations through the API, to set a Ticket up before the screen under test opens it. */
export async function staffPatch(request: APIRequestContext, ticketId: number, action: 'assignment' | 'priority' | 'status', body: object) {
  await signInAs(request, 'staff')
  const response = await request.patch(`${API}/staff/tickets/${ticketId}/${action}`, { data: body })
  expect(response.status(), await response.text()).toBe(200)
  return response.json()
}

/** Posts a Public Comment or an Internal Note through the API as the given account. */
export async function postMessage(request: APIRequestContext, as: AccountName, ticketId: number, kind: 'comment' | 'note', body: string) {
  await signInAs(request, as)
  const url = kind === 'note' ? `${API}/staff/tickets/${ticketId}/internal-notes` : `${API}/tickets/${ticketId}/comments`
  const response = await request.post(url, { data: { body } })
  expect(response.status(), await response.text()).toBe(201)
}

/** Exit criterion: no Lab 3 screen may scroll sideways (AC-64, RESP-01). */
export async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, `${label}: page scrolls horizontally (${scrollWidth} > ${clientWidth})`).toBeLessThanOrEqual(clientWidth)
}

let database: { user: { deleteMany: Function; updateMany: Function; findMany: Function; count: Function }; $disconnect: () => Promise<void> } | undefined

/**
 * Direct database access, used only where the API deliberately offers no route: deleting fixture users after a run
 * (BR-53) and parking Administrators for the concurrent last-Administrator check (tests.md §1.4). It reads the
 * server's own `.env` and Prisma client, so it always talks to the database the API under test uses.
 */
export function db() {
  if (!database) {
    try {
      process.loadEnvFile(path.resolve('server/.env'))
    } catch {
      // Already loaded, or supplied by the environment.
    }
    const require = createRequire(path.resolve('server/package.json'))
    const { PrismaClient } = require('@prisma/client')
    database = new PrismaClient()
  }
  return database!
}

/** Removes every user this suite created. They own no Tickets or messages, so nothing else references them. */
export async function removeFixtureUsers() {
  await db().user.deleteMany({ where: { email: { endsWith: FIXTURE_DOMAIN, mode: 'insensitive' } } })
}

/** The Lab 2 ticket helper, taking any seeded account: it signs in by email alone. */
export const createTicket = (request: APIRequestContext, account: Account, seed: Parameters<typeof createLab2Ticket>[2]) =>
  createLab2Ticket(request, account as Requester, seed)
