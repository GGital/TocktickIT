import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

/** Shared fixtures for the Lab 4 Actions Taken suites (ActionsTaken.test.tsx, Accessibility.test.tsx). */

export const ada = { id: 7, fullName: 'Ada Chaiyawat', role: 'IT_STAFF' } as const
export const bee = { id: 9, fullName: 'Bee Somchai', role: 'IT_STAFF' } as const
export const malee = { id: 11, fullName: 'Malee Srisuk', role: 'IT_STAFF' } as const

export const staffUser = { ...ada, email: 'ada@toktickit.test', mustChangePassword: false }
export const requesterUser = { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', role: 'REQUESTER', mustChangePassword: false }

/** Ticket 41, owned by Bee and in progress, so any staff member may record work on it (BR-14). */
export const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  description: 'Since the firmware update the VPN drops every ten minutes.',
  category: { id: 2, name: 'Network' },
  relatedSystem: { id: 3, name: 'Corporate VPN' },
  requester: { id: 1, fullName: 'Nadia Charoen', email: 'nadia@toktickit.test', department: 'Finance' },
  requestedPriority: 'HIGH',
  itPriority: 'MEDIUM',
  status: 'IN_PROGRESS',
  assignee: { id: bee.id, fullName: bee.fullName },
  requesterResolvedFlaggedAt: null,
  createdAt: '2026-09-04T02:20:00.000Z',
  updatedAt: '2026-10-19T08:02:31.000Z',
  attachments: [],
  ...overrides,
})

/** The staff ActionTaken projection (api-spec §2.1). */
export const action = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  ticketId: 41,
  actionAt: '2026-10-19T03:15:00.000Z',
  description: `Action ${id} description`,
  result: `Action ${id} result`,
  followUpRequired: false,
  followUpNote: null,
  followUpCompletedAt: null,
  followUpCompletedBy: null,
  followUpOutstanding: false,
  attachmentNotes: null,
  performedBy: ada,
  lastEditedBy: null,
  voided: false,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  version: 1,
  createdAt: '2026-10-19T03:20:41.000Z',
  updatedAt: '2026-10-19T03:20:41.000Z',
  canEdit: true,
  ...overrides,
})

/**
 * Four actions in API order: an outstanding follow-up by someone else (only Mark done), the caller's own edited action
 * (Edit and Void), a voided one, and a completed follow-up by someone else (no menu at all).
 */
export const staffActions = () => [
  action(214, {
    actionAt: '2026-10-19T03:15:00.000Z',
    description: 'Replaced the VPN client profile and cleared cached credentials.',
    result: 'Connection stable for 30 minutes in testing.',
    followUpRequired: true,
    followUpNote: "Confirm with the requester after Monday's peak usage.",
    followUpOutstanding: true,
    attachmentNotes: 'See vpn-log-2026-10-19.txt in Attachments.',
    performedBy: malee,
    canEdit: false,
  }),
  action(215, {
    actionAt: '2026-10-19T07:40:00.000Z',
    description: 'Called the user to confirm the new profile.',
    result: 'User confirmed the VPN stays connected.',
    performedBy: ada,
    lastEditedBy: malee,
    version: 2,
    updatedAt: '2026-10-19T08:00:00.000Z',
  }),
  action(216, {
    actionAt: '2026-10-19T08:00:00.000Z',
    description: 'Reset the router.',
    result: 'No change.',
    performedBy: bee,
    voided: true,
    voidedAt: '2026-10-19T09:00:00.000Z',
    voidedBy: bee,
    voidReason: 'Wrong ticket; see TKT-2026-000044',
    canEdit: false,
  }),
  action(217, {
    actionAt: '2026-10-19T09:30:00.000Z',
    description: 'Checked the firewall logs.',
    result: 'No drops recorded since the change.',
    followUpRequired: true,
    followUpNote: 'Re-check logs on Friday.',
    followUpCompletedAt: '2026-10-19T10:00:00.000Z',
    followUpCompletedBy: bee,
    performedBy: bee,
    canEdit: false,
  }),
]

export const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response
export const apiError = (status: number, code: string, message = 'Refused.', fields?: unknown) =>
  response(status, { error: { code, message, fields } })

export type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>

/** A fetch stub keyed by "METHOD /api/path"; unmocked routes answer 404 so a stray request is visible. */
export function stubApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const handler = handlers[key]
    return Promise.resolve().then(() => (handler ? handler(body) : response(404, { error: { code: 'NOT_MOCKED', message: key } })))
  })
  vi.stubGlobal('fetch', fetchMock)

  /** Parsed JSON bodies of every call to one route, in order. */
  const calls = (method: string, url: string) =>
    fetchMock.mock.calls
      .filter(([calledUrl, init]) => calledUrl === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
      .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null')))

  return { fetchMock, calls }
}

export const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
