import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../../src/AppRoutes'

type User = { id: number; fullName: string; email: string; role: string; isActive: boolean; mustChangePassword: boolean; createdAt: string }

const adminUser = { id: 3, fullName: 'Suda Administrator', email: 'admin@toktickit.test', role: 'ADMINISTRATOR', mustChangePassword: false }

const person = (id: number, fullName: string, email: string, role = 'REQUESTER', isActive = true): User => ({
  id,
  fullName,
  email,
  role,
  isActive,
  mustChangePassword: false,
  createdAt: '2026-09-01T02:00:00.000Z',
})

const LONG_EMAIL = 'kittipong.wongsawat.from.the.registrar.office@toktickit.test'

const response = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response
const apiError = (status: number, code: string, message = 'Refused.') => response(status, { error: { code, message } })

type Handler = (body: Record<string, unknown> | undefined, url: URL) => Response | Promise<Response>
let me: Record<string, unknown>
let users: User[]
let handlers: Record<string, Handler>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  me = adminUser
  users = [
    person(3, 'Suda Administrator', 'admin@toktickit.test', 'ADMINISTRATOR'),
    person(7, 'Ada Chaiyawat', 'ada@toktickit.test', 'IT_STAFF'),
    person(12, 'Nara Sukjai', 'nara@toktickit.test'),
    person(15, 'Kittipong Wongsawat', LONG_EMAIL, 'REQUESTER', false),
    person(21, 'Pim Rattana', 'pim@toktickit.test', 'ADMINISTRATOR'),
  ]
  handlers = {
    'GET /api/auth/me': () => response(200, me),
    // Behaves like the API: case-insensitive search over name and email, one optional role, by name.
    'GET /api/admin/users': (_body, url) => {
      const search = url.searchParams.get('search')?.toLowerCase()
      const role = url.searchParams.get('role')
      return response(
        200,
        users
          .filter((user) => !search || `${user.fullName} ${user.email}`.toLowerCase().includes(search))
          .filter((user) => !role || user.role === role)
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      )
    },
  }
  fetchMock = vi.fn((input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost')
    const path = url.pathname.replace(/\/\d+(?=\/|$)/, '/:id')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const handler = handlers[`${init.method ?? 'GET'} ${path}`]
    return Promise.resolve(handler ? handler(body, url) : response(404, { error: { code: 'NOT_MOCKED', message: path } }))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const renderAt = (path = '/admin/users') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

const calls = (method: string, pathPrefix: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).startsWith(pathPrefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
    .map(([input, init]) => ({ url: String(input), body: JSON.parse(String((init as RequestInit | undefined)?.body ?? 'null')) }))

const table = () => screen.findByRole('table')
const rowFor = async (name: string) => (await within(await table()).findByText(name)).closest('tr')!
const dialog = () => screen.findByRole('dialog')

async function openEdit(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(await rowFor(name)).getByRole('button', { name: `Edit ${name}` }))
  return dialog()
}

async function fillCreate(user: ReturnType<typeof userEvent.setup>, form: HTMLElement, values: { role?: string; status?: string } = {}) {
  await user.type(within(form).getByLabelText(/^Full name/), 'Malee Srisuk')
  await user.type(within(form).getByLabelText(/^Email address/), 'Malee.Srisuk@toktickit.test')
  if (values.role !== '') await user.click(within(form).getByRole('radio', { name: values.role ?? 'IT Staff' }))
  if (values.status !== '') await user.click(within(form).getByRole('radio', { name: values.status ?? 'Active' }))
  await user.type(within(form).getByLabelText(/^Initial password/), 'first-login-2026')
}

describe('UI-28 the user list (AC-51, BR-53)', () => {
  it('renders Name, Email, Role, Status, and an Edit action for every user', async () => {
    renderAt()
    const list = await table()

    expect(within(list).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Name', 'Email', 'Role', 'Status', 'Actions'])
    const ada = await rowFor('Ada Chaiyawat')
    expect(within(ada).getByText('ada@toktickit.test')).toBeInTheDocument()
    expect(within(ada).getByText('IT Staff')).toHaveClass('zen-badge')
    expect(within(ada).getByText('Active')).toHaveClass('zen-badge')
    expect(within(await rowFor('Kittipong Wongsawat')).getByText('Inactive')).toHaveClass('zen-badge')
    expect(within(list).getAllByRole('button', { name: /^Edit / })).toHaveLength(users.length)
  })

  it('has no Delete or Remove control anywhere — not in the list and not in the Edit dialog', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()

    const noDeletion = () => {
      expect(screen.queryAllByRole('button', { name: /delete|remove/i })).toEqual([])
      expect(document.body.textContent).not.toMatch(/delete/i)
    }
    noDeletion()
    await openEdit(user, 'Nara Sukjai')
    noDeletion()
  })

  it('truncates a long email and exposes it in full through title', async () => {
    renderAt()
    const cell = within(await rowFor('Kittipong Wongsawat')).getByText(LONG_EMAIL)
    expect(cell).toHaveAttribute('title', LONG_EMAIL)
    expect(cell).toHaveClass('text-truncate')
  })

  it('renders a mobile card per user with a full-width Edit button', async () => {
    renderAt()
    await table()
    const cards = screen.getByRole('list', { name: 'Users' })
    const items = within(cards).getAllByRole('listitem')
    expect(items).toHaveLength(users.length)
    const edit = within(items[0]).getByRole('button', { name: /^Edit / })
    expect(edit).toHaveClass('w-100')
    expect(within(items[0]).getAllByText(/Administrator|IT Staff|Requester/).length).toBeGreaterThan(0)
  })
})

describe('UI-29 the role and activation controls (BR-22, BR-47)', () => {
  it('offers exactly three single-choice roles and an explicit activation state, neither pre-selected on create', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const form = await dialog()

    const role = within(form).getByRole('group', { name: /^Role/ })
    expect(within(role).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual(['Requester', 'IT Staff', 'Administrator'])
    for (const radio of within(role).getAllByRole('radio')) expect(radio).not.toBeChecked()
    expect(form.querySelector('select[multiple], input[type="checkbox"]')).toBeNull()

    const status = within(form).getByRole('group', { name: /^Account status/ })
    expect(within(status).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual(['Active', 'Inactive'])
    for (const radio of within(status).getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('refuses to submit without a role or an activation state, naming both, and sends nothing', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const form = await dialog()

    await fillCreate(user, form, { role: '', status: '' })
    await user.click(within(form).getByRole('button', { name: 'Create user' }))

    expect(within(form).getByText('Choose one role.')).toBeInTheDocument()
    expect(within(form).getByText('Choose whether the account is active.')).toBeInTheDocument()
    expect(calls('POST', '/api/admin/users')).toEqual([])
  })

  it('validates name, email, and password before sending', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const form = await dialog()

    await user.type(within(form).getByLabelText(/^Full name/), 'M')
    await user.type(within(form).getByLabelText(/^Email address/), 'not-an-email')
    await user.type(within(form).getByLabelText(/^Initial password/), 'short')
    await user.click(within(form).getByRole('button', { name: 'Create user' }))

    expect(within(form).getByText("Enter the user's full name.")).toBeInTheDocument()
    expect(within(form).getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(within(form).getByText('Use at least 10 characters.')).toBeInTheDocument()
    expect(calls('POST', '/api/admin/users')).toEqual([])
  })
})

describe('UI-30 duplicate email (AC-54)', () => {
  it('shows the message below Email on create and keeps every entered value', async () => {
    handlers['POST /api/admin/users'] = () => apiError(409, 'EMAIL_ALREADY_EXISTS')
    renderAt()
    const user = userEvent.setup()
    await table()
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const form = await dialog()

    await fillCreate(user, form)
    await user.click(within(form).getByRole('button', { name: 'Create user' }))

    const email = within(form).getByLabelText(/^Email address/)
    const message = await within(form).findByText('That email address is already in use.')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain(message.id)
    expect(email).toHaveValue('Malee.Srisuk@toktickit.test')
    expect(within(form).getByLabelText(/^Full name/)).toHaveValue('Malee Srisuk')
    expect(within(form).getByRole('radio', { name: 'IT Staff' })).toBeChecked()
    expect(within(form).getByRole('radio', { name: 'Active' })).toBeChecked()
    expect(within(form).getByLabelText(/^Initial password/)).toHaveValue('first-login-2026')
  })

  it('shows the same message on edit and leaves the dialog open', async () => {
    handlers['PATCH /api/admin/users/:id'] = () => apiError(409, 'EMAIL_ALREADY_EXISTS')
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Nara Sukjai')

    const email = within(form).getByLabelText(/^Email address/)
    await user.clear(email)
    await user.type(email, 'ada@toktickit.test')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    expect(await within(form).findByText('That email address is already in use.')).toBeInTheDocument()
    expect(email).toHaveValue('ada@toktickit.test')
  })
})

describe('UI-31 self-deactivation refused (AC-58, BR-51)', () => {
  it('shows the warning in the dialog and resets role and status to their stored values', async () => {
    handlers['PATCH /api/admin/users/:id'] = () => apiError(409, 'SELF_DEACTIVATION_FORBIDDEN')
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Suda Administrator')

    await user.click(within(form).getByRole('radio', { name: 'Inactive' }))
    await user.click(within(form).getByRole('radio', { name: 'Requester' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    const warning = await within(form).findByRole('alert')
    expect(warning).toHaveTextContent('You cannot deactivate your own account or change your own role.')
    expect(warning).toHaveClass('zen-callout-warning')
    expect(within(form).getByRole('radio', { name: 'Active' })).toBeChecked()
    expect(within(form).getByRole('radio', { name: 'Administrator' })).toBeChecked()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('UI-32 last active Administrator refused (AC-59, BR-52, exit criterion)', () => {
  it('names the rule and resets the controls, so the screen never shows the Administrator removed', async () => {
    handlers['PATCH /api/admin/users/:id'] = () => apiError(409, 'LAST_ACTIVE_ADMINISTRATOR')
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Pim Rattana')

    await user.click(within(form).getByRole('radio', { name: 'Inactive' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    const warning = await within(form).findByRole('alert')
    expect(warning).toHaveTextContent('There must be at least one active administrator.')
    expect(within(form).getByRole('radio', { name: 'Active' })).toBeChecked()
    expect(within(form).getByRole('radio', { name: 'Inactive' })).not.toBeChecked()

    // The list behind the dialog still shows the Administrator active.
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(within(await rowFor('Pim Rattana')).getByText('Active')).toBeInTheDocument()
  })
})

describe('UI-33 the one-time initial password panel (BR-13)', () => {
  it('shows the created user’s password once with Copy; after Done, nothing on the screen can show it again', async () => {
    handlers['POST /api/admin/users'] = (body) => {
      const created = person(40, String(body!.fullName), String(body!.email).toLowerCase(), String(body!.role), Boolean(body!.isActive))
      users = [...users, { ...created, mustChangePassword: true }]
      return response(201, { user: created, initialPassword: body!.initialPassword })
    }
    renderAt()
    const user = userEvent.setup()
    await table()
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const form = await dialog()

    await fillCreate(user, form)
    await user.click(within(form).getByRole('button', { name: 'Create user' }))

    expect(await within(form).findByRole('heading', { name: 'Account created' })).toBeInTheDocument()
    expect(within(form).getByText('first-login-2026')).toBeInTheDocument()
    expect(form).toHaveTextContent('It is shown only once')
    expect(calls('POST', '/api/admin/users')[0].body).toEqual({
      fullName: 'Malee Srisuk',
      email: 'Malee.Srisuk@toktickit.test',
      role: 'IT_STAFF',
      isActive: true,
      initialPassword: 'first-login-2026',
    })

    await user.click(within(form).getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toBe('first-login-2026')
    expect(await within(form).findByText('Copied.')).toBeInTheDocument()

    // The list refreshed behind the panel.
    expect(await within(await table()).findByText('Malee Srisuk')).toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.innerHTML).not.toContain('first-login-2026')

    await openEdit(user, 'Malee Srisuk')
    expect(document.body.innerHTML).not.toContain('first-login-2026')
  })

  it('issues a new initial password from the Edit dialog and shows it once', async () => {
    handlers['POST /api/admin/users/:id/initial-password'] = (body) =>
      response(200, { user: { ...users[2], mustChangePassword: true }, initialPassword: body!.initialPassword })
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Nara Sukjai')

    await user.click(within(form).getByRole('button', { name: 'Set a new initial password' }))
    expect(within(form).getByText(/signs Nara Sukjai out/)).toBeInTheDocument()
    await user.type(within(form).getByLabelText(/^New initial password/), 'temporary-2026-09')
    await user.click(within(form).getByRole('button', { name: 'Issue password' }))

    expect(await within(form).findByRole('heading', { name: 'New initial password issued' })).toBeInTheDocument()
    expect(within(form).getByText('temporary-2026-09')).toBeInTheDocument()
    expect(calls('POST', '/api/admin/users/12/initial-password')[0].body).toEqual({ initialPassword: 'temporary-2026-09' })

    await user.click(within(form).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(document.body.innerHTML).not.toContain('temporary-2026-09'))
  })
})

describe('UI-34 no pagination or sorting controls (X-12)', () => {
  it('renders all 40 users with no pagination, page-size, or second sort control', async () => {
    users = Array.from({ length: 40 }, (_, index) => person(100 + index, `Seeded User ${String(index).padStart(2, '0')}`, `seeded${index}@toktickit.test`))
    renderAt()
    const list = await table()

    expect(within(list).getAllByRole('row')).toHaveLength(41)
    expect(screen.queryByRole('navigation', { name: /pag/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/per page|page size|next|previous/i)).not.toBeInTheDocument()
    // The Role filter is the only select on the screen.
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(document.querySelector('[aria-sort]')).toBeNull()
    expect(within(list).queryAllByRole('button').filter((button) => button.closest('th'))).toEqual([])
    expect(calls('GET', '/api/admin/users').every(({ url }) => !/page|sort/.test(url))).toBe(true)
  })
})

describe('search, role filter, and list states (ui-spec §9.3)', () => {
  it('searches and filters by one role through the API', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()

    await user.type(screen.getByLabelText('Search name or email'), 'ADA')
    await waitFor(() => expect(calls('GET', '/api/admin/users').at(-1)!.url).toBe('/api/admin/users?search=ADA'))
    await user.selectOptions(screen.getByLabelText('Role'), 'IT_STAFF')
    await waitFor(() => expect(calls('GET', '/api/admin/users').at(-1)!.url).toBe('/api/admin/users?search=ADA&role=IT_STAFF'))
    expect(await within(await table()).findByText('Ada Chaiyawat')).toBeInTheDocument()
    expect(within(await table()).queryByText('Nara Sukjai')).not.toBeInTheDocument()
  })

  it('shows no results with a Clear action that resets both filters', async () => {
    renderAt()
    const user = userEvent.setup()
    await table()

    await user.type(screen.getByLabelText('Search name or email'), 'kingfisher')
    expect(await screen.findByRole('heading', { name: 'No users match this search.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByLabelText('Search name or email')).toHaveValue('')
    expect(screen.getByLabelText('Role')).toHaveValue('')
    expect(await within(await table()).findByText('Nara Sukjai')).toBeInTheDocument()
  })

  it('shows four skeleton rows while loading, and a retry on failure', async () => {
    let attempts = 0
    let finish: (value: Response) => void = () => undefined
    handlers['GET /api/admin/users'] = () => {
      attempts += 1
      if (attempts === 1) return new Promise<Response>((resolve) => (finish = resolve))
      return response(200, users)
    }
    renderAt()
    const user = userEvent.setup()

    const loading = await screen.findByText('Loading users…')
    expect(loading.parentElement!.querySelectorAll('.zen-skeleton')).toHaveLength(4)
    finish(apiError(500, 'INTERNAL_ERROR'))

    expect(await screen.findByText('Unable to load users.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await table()).toBeInTheDocument()
  })

  it('a non-Administrator opening the URL gets the forbidden state and no user request is made', async () => {
    me = { ...adminUser, role: 'IT_STAFF' }
    renderAt()
    expect(await screen.findByRole('heading', { name: 'You do not have access to this page.' })).toBeInTheDocument()
    expect(calls('GET', '/api/admin/users')).toEqual([])
  })
})

describe('editing (AC-56)', () => {
  it('opens with the stored values, sends only what changed, closes, refreshes, and announces the save', async () => {
    handlers['PATCH /api/admin/users/:id'] = (body) => {
      users = users.map((stored) => (stored.id === 12 ? { ...stored, ...body } : stored))
      return response(200, users.find((stored) => stored.id === 12))
    }
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Nara Sukjai')

    expect(within(form).getByRole('heading', { name: 'Edit Nara Sukjai' })).toBeInTheDocument()
    expect(within(form).getByLabelText(/^Full name/)).toHaveValue('Nara Sukjai')
    expect(within(form).getByRole('radio', { name: 'Requester' })).toBeChecked()
    expect(within(form).getByRole('radio', { name: 'Active' })).toBeChecked()
    expect(within(form).queryByLabelText(/^Initial password/)).not.toBeInTheDocument()

    await user.click(within(form).getByRole('radio', { name: 'IT Staff' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(calls('PATCH', '/api/admin/users/12').map(({ body }) => body)).toEqual([{ role: 'IT_STAFF' }]))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Changes saved for Nara Sukjai.')).toBeInTheDocument()
    expect(within(await rowFor('Nara Sukjai')).getByText('IT Staff')).toBeInTheDocument()
  })

  it('makes the fields read-only and shows the busy label while saving', async () => {
    handlers['PATCH /api/admin/users/:id'] = () => new Promise<Response>(() => undefined)
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Nara Sukjai')

    await user.click(within(form).getByRole('radio', { name: 'Inactive' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(within(form).getByLabelText(/^Full name/)).toBeDisabled()
  })

  it('keeps the dialog and its values on an unexpected failure, with Try again', async () => {
    let attempts = 0
    handlers['PATCH /api/admin/users/:id'] = (body) => {
      attempts += 1
      return attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : response(200, { ...users[2], ...body })
    }
    renderAt()
    const user = userEvent.setup()
    const form = await openEdit(user, 'Nara Sukjai')

    await user.click(within(form).getByRole('radio', { name: 'Inactive' }))
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    expect(await within(form).findByText('The user was not saved.')).toBeInTheDocument()
    expect(within(form).getByRole('radio', { name: 'Inactive' })).toBeChecked()
    await user.click(within(form).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
