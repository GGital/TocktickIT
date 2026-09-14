import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** The three documented test viewports (ui-spec §8). */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 375, height: 812 },
} as const

export type ViewportName = keyof typeof VIEWPORTS

export const API = 'http://localhost:3000/api'

export type Requester = { id: number; fullName: string; email: string }
export type Reference = { id: number; name: string }

/** Every run tags the tickets it creates, so specs never collide on shared data. */
export const runTag = () => `E2E-${Date.now().toString(36).toUpperCase()}`

/**
 * Local-development credentials from README.md — test fixtures, not secrets. These two seeded Requesters are
 * seeded with mustChangePassword = false precisely so the suite can sign in directly (Lab 3 A-19).
 */
const E2E_PASSWORD = 'TokTick-Local-Dev-1'
const E2E_REQUESTER_EMAILS = ['napat.s@toktickit.dev', 'pimchanok.t@toktickit.dev']

/** Signs a request context in as the requester; the session cookie replaces any previous one (Lab 3 BR-03). */
export async function signIn(request: APIRequestContext, requester: Pick<Requester, 'email'>) {
  const response = await request.post(`${API}/auth/login`, {
    data: { email: requester.email, password: E2E_PASSWORD },
  })
  expect(response.status(), 'run `npx prisma db seed` so the E2E accounts exist').toBe(200)
  return (await response.json()) as Requester
}

/** The two seeded E2E Requesters, A then B. Leaves `request` signed in as B. */
export async function getRequesters(request: APIRequestContext): Promise<Requester[]> {
  const requesters: Requester[] = []
  for (const email of E2E_REQUESTER_EMAILS) requesters.push(await signIn(request, { email }))
  return requesters
}

export async function getReferenceData(request: APIRequestContext) {
  const [categories, systems] = await Promise.all([
    request.get(`${API}/categories`).then((res) => res.json() as Promise<Reference[]>),
    request.get(`${API}/related-systems`).then((res) => res.json() as Promise<Reference[]>),
  ])

  return { categories, systems }
}

type TicketSeed = {
  summary: string
  description?: string
  categoryId: number
  relatedSystemId: number
  requestedPriority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}

/** Creates a ticket through the API as the requester — used to set a list up quickly, never to
 * stand in for the UI flow the specs actually assert. Leaves `request` signed in as that requester. */
export async function createTicket(
  request: APIRequestContext,
  requester: Requester,
  seed: TicketSeed,
) {
  await signIn(request, requester)
  const response = await request.post(`${API}/tickets`, {
    data: {
      summary: seed.summary,
      description:
        seed.description ?? 'Seeded by the end-to-end suite so the list has something to show.',
      categoryId: seed.categoryId,
      relatedSystemId: seed.relatedSystemId,
      requestedPriority: seed.requestedPriority ?? 'MEDIUM',
    },
  })

  expect(response.status(), await response.text()).toBe(201)
  return response.json() as Promise<{ id: number; ticketNumber: string; summary: string }>
}

/** A real PNG (1x1) and a real one-page PDF: the server validates magic bytes. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'binary',
)

/** Not a permitted type, and its bytes do not match any allowlisted signature. */
export const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])

/**
 * Signs the browser in as the requester without a Login screen, for specs whose subject is a later screen.
 * page.request shares its cookie store with the page, so the browser carries the same session.
 */
export async function actAs(page: Page, requester: Requester) {
  await signIn(page.request, requester)
}

/** Fills the Create Ticket form with valid values, leaving submission to the caller. */
export async function fillTicketForm(
  page: Page,
  values: { summary: string; description: string; categoryId: number; relatedSystemId: number },
) {
  await page.getByLabel(/^Category/).selectOption(String(values.categoryId))
  await page.getByLabel(/^Related System/).selectOption(String(values.relatedSystemId))
  await page.getByLabel(/^Ticket Summary/).fill(values.summary)
  await page.getByLabel(/^Description/).fill(values.description)
}

/** The ticket number shown on the success card, e.g. TKT-2026-000041. */
export async function readTicketNumber(page: Page) {
  const number = page.locator('.zen-ticket-number')
  await expect(number).toBeVisible()

  const text = (await number.textContent())?.trim() ?? ''
  expect(text).toMatch(/^TKT-\d{4}-\d{6}$/)

  return text
}
