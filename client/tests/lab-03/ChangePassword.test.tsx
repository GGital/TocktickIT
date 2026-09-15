import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

// Test fixtures, not real passwords (BR-12).
const CURRENT = 'fixture-issued-1'
const NEW_PASSWORD = 'fixture-chosen-1'
const RULES = 'At least 10 characters. Must differ from your current password and from your email address.'

type User = { id: number; fullName: string; email: string; role: string; mustChangePassword: boolean }
const gated: User = {
  id: 1,
  fullName: 'Nadia Charoen',
  email: 'nadia.charoen@toktickit.test',
  role: 'REQUESTER',
  mustChangePassword: true,
}

const response = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response

let session: User | null
let onChange: (body: Record<string, string>) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => url === `/api${path}`)

beforeEach(() => {
  session = gated
  // By default the server accepts the change and the next /me reflects it.
  onChange = () => {
    session = { ...gated, mustChangePassword: false }
    return Promise.resolve(response(200, session))
  }
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return Promise.resolve(
        session ? response(200, session) : response(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }),
      )
    }
    if (url === '/api/auth/change-password') return onChange(JSON.parse(String(init?.body)))
    if (url === '/api/auth/logout') {
      session = null
      return Promise.resolve(response(204))
    }
    if (url.startsWith('/api/tickets')) {
      return Promise.resolve(response(200, { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }))
    }
    return Promise.resolve(response(200, []))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

const renderAt = (path = '/change-password') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )

const current = () => screen.getByLabelText(/^Current password/)
const newPassword = () => screen.getByLabelText(/^New password/)
const confirm = () => screen.getByLabelText(/^Confirm new password/)

async function fill(values: { current?: string; next?: string; confirmation?: string }) {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Choose a new password' })
  if (values.current) await user.type(current(), values.current)
  if (values.next) await user.type(newPassword(), values.next)
  if (values.confirmation) await user.type(confirm(), values.confirmation)
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
  return user
}

describe('UI-06 the rules are visible before any typing (ui-spec §5.2)', () => {
  it('renders the rules as helper text described by the New password field', async () => {
    renderAt()

    expect(await screen.findByText(RULES)).toBeInTheDocument()
    expect(newPassword()).toHaveAccessibleDescription(RULES)
    expect(newPassword()).toHaveValue('')
    expect(current()).toHaveAttribute('autocomplete', 'current-password')
    expect(newPassword()).toHaveAttribute('autocomplete', 'new-password')
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(3)
  })
})

describe('UI-07 a mismatched confirmation (AC-12)', () => {
  it('shows the message below Confirm, moves focus there, and sends nothing', async () => {
    renderAt()
    await fill({ current: CURRENT, next: NEW_PASSWORD, confirmation: `${NEW_PASSWORD}x` })

    expect(confirm()).toHaveAccessibleDescription('The two passwords do not match.')
    expect(confirm()).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('1 field needs attention')
    expect(callsTo('/auth/change-password')).toHaveLength(0)
  })
})

describe('UI-08 password rule boundaries (AC-12, BR-11)', () => {
  it('rejects 9 characters', async () => {
    renderAt()
    await fill({ current: CURRENT, next: 'nine-char', confirmation: 'nine-char' })

    expect(newPassword()).toHaveAccessibleDescription(`${RULES} Use at least 10 characters.`)
    expect(newPassword()).toHaveFocus()
    expect(callsTo('/auth/change-password')).toHaveLength(0)
  })

  it('rejects a new password equal to the current one', async () => {
    renderAt()
    await fill({ current: CURRENT, next: CURRENT, confirmation: CURRENT })

    expect(screen.getByText('Choose a password you have not used here before.')).toBeInTheDocument()
    expect(callsTo('/auth/change-password')).toHaveLength(0)
  })

  it('accepts exactly 10 characters and sends the three fields once', async () => {
    onChange = () => new Promise(() => undefined)
    renderAt()
    await fill({ current: CURRENT, next: 'ten-chars1', confirmation: 'ten-chars1' })

    await waitFor(() => expect(callsTo('/auth/change-password')).toHaveLength(1))
    const [, init] = callsTo('/auth/change-password')[0]
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: CURRENT,
      newPassword: 'ten-chars1',
      confirmPassword: 'ten-chars1',
    })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('reports a wrong current password below that field and keeps the new values (BR-66)', async () => {
    onChange = () =>
      Promise.resolve(
        response(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Your password was not changed.',
            fields: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
          },
        }),
      )
    renderAt()
    await fill({ current: 'fixture-wrong-1', next: NEW_PASSWORD, confirmation: NEW_PASSWORD })

    await waitFor(() => expect(current()).toHaveAccessibleDescription('Your current password is incorrect.'))
    expect(newPassword()).toHaveValue(NEW_PASSWORD)
    expect(confirm()).toHaveValue(NEW_PASSWORD)
  })
})

describe('UI-09 a successful change (AC-13, AC-14, BR-06)', () => {
  it('re-reads the user from the API, then lands on the home route saying other sessions were signed out', async () => {
    renderAt()
    await fill({ current: CURRENT, next: NEW_PASSWORD, confirmation: NEW_PASSWORD })

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tickets$/)
    expect(screen.getByText(/You have been signed out on your other devices./).closest('[role="status"]')).not.toBeNull()

    // The gate lifted because GET /api/auth/me said so after the change, not because of local state.
    const order = fetchMock.mock.calls.map(([url]) => String(url))
    expect(order.lastIndexOf('/api/auth/me')).toBeGreaterThan(order.indexOf('/api/auth/change-password'))
  })

  it('stays on the screen if the server still reports a change outstanding', async () => {
    onChange = () => Promise.resolve(response(200, { ...gated, mustChangePassword: false }))
    renderAt()
    await fill({ current: CURRENT, next: NEW_PASSWORD, confirmation: NEW_PASSWORD })

    await waitFor(() => expect(callsTo('/auth/me').length).toBeGreaterThanOrEqual(2))
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/change-password$/)
  })
})

describe('UI-10 mandatory mode (AC-10, BR-15, BR-17)', () => {
  it('offers only Save and Log out, explains why, and renders no shell', async () => {
    renderAt()
    await screen.findByRole('heading', { name: 'Choose a new password' })

    expect(screen.getByText(/uses a password that was issued to you/)).toBeInTheDocument()
    const actions = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
      .filter((name) => name !== 'Show password')
    expect(actions).toEqual(['Save new password', 'Log out'])
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it.each(['/tickets', '/tickets/new', '/tickets/41', '/login', '/'])(
    'sends a direct visit or reload of %s back here',
    async (path) => {
      renderAt(path)

      expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/change-password$/)
      // Nothing gated is requested while the change is outstanding.
      expect(callsTo('/tickets')).toHaveLength(0)
    },
  )

  it('logs out through the API and returns to /login', async () => {
    renderAt()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(callsTo('/auth/logout')).toHaveLength(1)
  })

  it('in voluntary mode shows a Back link instead of the mandatory explanation', async () => {
    session = { ...gated, mustChangePassword: false }
    renderAt()
    await screen.findByRole('heading', { name: 'Choose a new password' })

    expect(screen.queryByText(/uses a password that was issued to you/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/tickets')
  })
})
