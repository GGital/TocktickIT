import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderAt, requesterUser, response, staffUser, stubApi } from '../helpers/actions'

/**
 * Lab 4 hardening (FR-29, BR-82, AC-45): a second submit while the first is in flight sends nothing. A disabled
 * button stops a second click, but not a second `submit` event — Enter in a field, or a fast re-dispatch — so each
 * form also guards its handler.
 */

const adminUser = { id: 3, fullName: 'Chai Admin', email: 'chai@toktickit.test', role: 'ADMINISTRATOR', mustChangePassword: false }
const never = () => new Promise<Response>(() => undefined)

afterEach(() => vi.unstubAllGlobals())

/** Sets a field in one change event: typing key by key overran the 5 s test timeout under full-suite load. */
const fill = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })

/** Two submit events on one form in the same tick, before React can re-render the busy state. */
const submitTwice = (form: HTMLFormElement) =>
  act(() => {
    fireEvent.submit(form)
    fireEvent.submit(form)
  })

describe('AC-45 rapid repeated submits produce one write', () => {
  it('Create Ticket', async () => {
    const api = stubApi({
      'GET /api/auth/me': () => response(200, requesterUser),
      'GET /api/categories': () => response(200, [{ id: 2, name: 'Hardware' }]),
      'GET /api/related-systems': () => response(200, [{ id: 7, name: 'Corporate Laptop' }]),
      'POST /api/tickets': never,
    })
    renderAt('/tickets/new')
    const user = userEvent.setup()

    const category = await screen.findByLabelText(/^Category/)
    await within(category).findByRole('option', { name: 'Hardware' })
    await user.selectOptions(category, '2')
    await user.selectOptions(screen.getByLabelText(/^Related System/), '7')
    fill(screen.getByLabelText(/^Ticket Summary/), 'Laptop battery drains within thirty minutes')
    fill(screen.getByLabelText(/^Description/), 'The battery drops from full to fifteen percent within half an hour.')

    await submitTwice(screen.getByRole('button', { name: 'Submit Ticket' }).closest('form')!)
    expect(api.calls('POST', '/api/tickets')).toHaveLength(1)
  })

  it('User create', async () => {
    const api = stubApi({
      'GET /api/auth/me': () => response(200, adminUser),
      'GET /api/admin/users': () => response(200, []),
      'POST /api/admin/users': never,
    })
    renderAt('/admin/users')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create user' }))
    const form = await screen.findByRole('dialog')
    fill(within(form).getByLabelText(/^Full name/), 'Malee Srisuk')
    fill(within(form).getByLabelText(/^Email address/), 'malee.srisuk@toktickit.test')
    await user.click(within(form).getByRole('radio', { name: 'IT Staff' }))
    await user.click(within(form).getByRole('radio', { name: 'Active' }))
    fill(within(form).getByLabelText(/^Initial password/), 'first-login-2026')

    await submitTwice(form.querySelector('form')!)
    expect(api.calls('POST', '/api/admin/users')).toHaveLength(1)
  })
})

describe('a filter chosen while the search is still settling is kept (BR-81, ui-spec §7.4)', () => {
  it('sends the search and the Owner filter together, instead of the search wiping the filter', async () => {
    const requested: string[] = []
    const empty = { data: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, sortBy: 'itPriority', sortOrder: 'desc' } }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        requested.push(url)
        const path = url.split('?')[0]
        const body = path === '/api/auth/me' ? staffUser : path === '/api/staff/tickets' ? empty : []
        return Promise.resolve(response(200, body))
      }),
    )
    renderAt('/staff/tickets')
    const owner = await screen.findByLabelText('Owner')

    // The search waits 300 ms before it applies; the Owner change lands inside that window.
    fireEvent.change(screen.getByLabelText('Search', { selector: 'input' }), { target: { value: 'printer' } })
    fireEvent.change(owner, { target: { value: 'unassigned' } })

    await waitFor(() => expect(requested.some((url) => url.includes('search=printer'))).toBe(true))
    const lists = requested.filter((url) => url.startsWith('/api/staff/tickets?') && !url.includes('pageSize=10'))
    expect(lists.at(-1)).toContain('assignee=unassigned')
    expect(lists.at(-1)).toContain('search=printer')
  })
})
