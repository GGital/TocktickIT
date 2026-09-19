import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

// Test fixture, not a real password (BR-12).
const PASSWORD = 'fixture-password-1'
const INVALID = 'Email or password is incorrect, or the account is not active.'

type User = { id: number; fullName: string; email: string; role: string; mustChangePassword: boolean }
const requester: User = {
  id: 1,
  fullName: 'Nadia Charoen',
  email: 'nadia@toktickit.test',
  role: 'REQUESTER',
  mustChangePassword: false,
}

const response = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response
const apiError = (status: number, code: string, message: string) => response(status, { error: { code, message } })

let session: User | null
let onLogin: (body: { email: string; password: string }) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

const loginCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/auth/login')

beforeEach(() => {
  session = null
  onLogin = () => Promise.resolve(apiError(401, 'INVALID_CREDENTIALS', INVALID))
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return Promise.resolve(session ? response(200, session) : apiError(401, 'UNAUTHENTICATED', 'Sign in to continue.'))
    }
    if (url === '/api/auth/login') return onLogin(JSON.parse(String(init?.body)))
    if (url.startsWith('/api/tickets')) {
      return Promise.resolve(response(200, { data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }))
    }
    return Promise.resolve(response(200, []))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

/** Shows the router location so a redirect can be asserted by path. */
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

const renderAt = (path = '/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  )

const emailField = () => screen.getByLabelText(/^Email address/)
const passwordField = () => screen.getByLabelText(/^Password/)
const signInButton = () => screen.getByRole('button', { name: 'Sign in' })

/** Resolves a successful login the way the API does: the session exists from then on. */
const succeedAs = (user: User) => {
  onLogin = () => {
    session = user
    return Promise.resolve(response(200, user))
  }
}

async function signIn(email = requester.email, password = PASSWORD) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText(/^Email address/), email)
  await user.type(passwordField(), password)
  await user.click(signInButton())
  return user
}

describe('UI-01 the Login screen renders (FR-01)', () => {
  it('has labelled email and password fields and a submit button inside a real form', async () => {
    renderAt()

    expect(await screen.findByRole('heading', { level: 1, name: 'TokTickIT' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeInTheDocument()

    const form = screen.getByRole('form', { name: 'Sign in' })
    expect(within(form).getByLabelText(/^Email address/)).toHaveAttribute('type', 'email')
    expect(within(form).getByLabelText(/^Email address/)).toHaveAttribute('autocomplete', 'username')
    expect(within(form).getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
    expect(within(form).getByLabelText(/^Password/)).toHaveAttribute('autocomplete', 'current-password')
    expect(within(form).getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'submit')

    expect(emailField()).toHaveFocus()
    expect(screen.getByText(/Ask your IT administrator to issue a new one/)).toBeInTheDocument()
    // No application shell on this route (ui-spec §3).
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('UI-02 client validation (FR-01)', () => {
  it('shows field-level messages and issues no request for an empty form', async () => {
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(emailField()).toHaveAttribute('aria-invalid', 'true')
    expect(emailField()).toHaveFocus()
    expect(loginCalls()).toHaveLength(0)
  })

  it('rejects a malformed email address without a request', async () => {
    renderAt()
    await signIn('nadia@', PASSWORD)

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
    expect(loginCalls()).toHaveLength(0)
  })
})

describe('UI-03 invalid credentials (AC-02)', () => {
  it('shows one alert with the single documented message, keeps the email, and clears and refocuses the password', async () => {
    renderAt()
    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(INVALID)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(emailField()).toHaveValue(requester.email)
    expect(passwordField()).toHaveValue('')
    expect(passwordField()).toHaveFocus()
  })

  it('shows the throttle message and leaves Sign in enabled (BR-08)', async () => {
    onLogin = () =>
      Promise.resolve(apiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait a few minutes and try again.'))
    renderAt()
    await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a few minutes and try again.',
    )
    expect(signInButton()).toBeEnabled()
  })

  it('offers Try again after an API failure and keeps both values for the retry', async () => {
    onLogin = () => Promise.reject(new TypeError('Failed to fetch'))
    renderAt()
    const user = await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign you in/i)
    expect(emailField()).toHaveValue(requester.email)

    succeedAs(requester)
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(loginCalls()).toHaveLength(2)
  })
})

describe('UI-04 submitting (FR-43)', () => {
  it('shows the busy state, locks the fields, and ignores a second click', async () => {
    let release: (value: Response) => void = () => undefined
    onLogin = () => new Promise((resolve) => (release = resolve))
    renderAt()
    const user = await signIn()

    const busy = screen.getByRole('button', { name: 'Signing in…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(emailField()).toHaveAttribute('readonly')
    expect(passwordField()).toHaveAttribute('readonly')

    await user.click(busy)
    expect(loginCalls()).toHaveLength(1)

    release(apiError(401, 'INVALID_CREDENTIALS', INVALID))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('UI-05 the reveal toggle (AC-67, ui-spec §2.1, §11)', () => {
  it('switches the input type, its accessible name, and aria-pressed without submitting', async () => {
    renderAt()
    const toggle = await screen.findByRole('button', { name: 'Show password' })

    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.type(passwordField(), PASSWORD)
    await userEvent.click(toggle)

    expect(passwordField()).toHaveAttribute('type', 'text')
    expect(passwordField()).toHaveValue(PASSWORD)
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordField()).toHaveAttribute('type', 'password')
    expect(loginCalls()).toHaveLength(0)
  })

  it('is operable from the keyboard alone: tab order, then Enter submits', async () => {
    succeedAs(requester)
    renderAt()
    const user = userEvent.setup()

    expect(await screen.findByLabelText(/^Email address/)).toHaveFocus()
    await user.keyboard(requester.email)
    await user.tab()
    expect(passwordField()).toHaveFocus()
    await user.keyboard(PASSWORD)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()
    await user.tab()
    expect(signInButton()).toHaveFocus()

    // Back to the password field, where Enter submits the form natively (ui-spec §4.3).
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    expect(passwordField()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
  })
})

describe('Login behaviour (ui-spec §4.3, AC-01, AC-10)', () => {
  it.each([
    ['REQUESTER', '/tickets'],
    ['IT_STAFF', '/staff/tickets'],
    ['ADMINISTRATOR', '/staff/tickets'],
  ])('sends a %s to their home route', async (role, home) => {
    succeedAs({ ...requester, role })
    renderAt()
    await signIn()

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(new RegExp(`^${home}$`)))
  })

  it('sends a user with an outstanding password change to /change-password and nowhere else', async () => {
    succeedAs({ ...requester, mustChangePassword: true })
    renderAt()
    await signIn()

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/change-password$/)
  })

  it('redirects an already signed-in visitor away from /login', async () => {
    session = requester
    renderAt()

    expect(await screen.findByRole('heading', { name: 'My Tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('never puts the password in the URL, storage, the console, or markup (exit criterion, ui-spec §2.1)', async () => {
    const logged: unknown[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => void logged.push(...args))
    }

    renderAt()
    const user = await signIn()
    await screen.findByRole('alert')
    expect(document.body.innerHTML).not.toContain(PASSWORD)

    succeedAs(requester)
    await user.type(passwordField(), PASSWORD)
    await user.click(signInButton())
    await screen.findByRole('heading', { name: 'My Tickets' })

    expect(screen.getByTestId('location').textContent).not.toContain(PASSWORD)
    expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(PASSWORD)
    expect(JSON.stringify(logged)).not.toContain(PASSWORD)
    expect(document.body.innerHTML).not.toContain(PASSWORD)
    vi.restoreAllMocks()
  })
})
