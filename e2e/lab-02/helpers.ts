import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** The three documented test viewports (ui-spec §8). */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 375, height: 812 },
} as const

export type ViewportName = keyof typeof VIEWPORTS

/** The single documented storage key for the simulated requester context (BR-10). */
export const REQUESTER_ID_KEY = 'toktickit.requesterId'

export const API = 'http://localhost:3000/api'

export type Requester = { id: number; fullName: string; department: string }
export type Reference = { id: number; name: string }

/** Every run tags the tickets it creates, so specs never collide on shared data. */
export const runTag = () => `E2E-${Date.now().toString(36).toUpperCase()}`

export async function getRequesters(request: APIRequestContext): Promise<Requester[]> {
  const response = await request.get(`${API}/requesters`)
  expect(response.status(), 'the seed must provide active requesters').toBe(200)

  const requesters = (await response.json()) as Requester[]
  expect(requesters.length, 'at least two active requesters are needed').toBeGreaterThan(1)

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

/** Creates a ticket through the API — used to set a list up quickly, never to
 * stand in for the UI flow the specs actually assert. */
export async function createTicket(
  request: APIRequestContext,
  requesterId: number,
  seed: TicketSeed,
) {
  const response = await request.post(`${API}/tickets`, {
    headers: { 'X-Requester-Id': String(requesterId) },
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
 * Puts a requester into the browser context without walking the selection screen,
 * for specs whose subject is a later screen. E2E-01 and E2E-08 drive the real
 * screen instead.
 *
 * The script runs on every navigation, so it only seeds an *absent* context: a
 * spec that switches requester or clears the key must keep that change across the
 * next `goto`, which an unconditional write would silently undo.
 */
export async function actAs(page: Page, requesterId: number) {
  await page.addInitScript(
    ([key, id]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, String(id))
      }
    },
    [REQUESTER_ID_KEY, requesterId] as const,
  )
}

/** Establishes the context the way a user does, for specs that test the context. */
export async function selectRequesterThroughUi(page: Page, requesterId: number) {
  await page.goto('/select-requester')
  await page.getByLabel(/Development Requester/).selectOption(String(requesterId))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/tickets$/)
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
