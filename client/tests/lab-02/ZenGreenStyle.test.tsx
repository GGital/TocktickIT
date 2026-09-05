import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '../../src/styles/zen-theme.css'
import AppRoutes from '../../src/AppRoutes'
import Badge from '../../src/components/Badge'
import Button from '../../src/components/Button'
import { REQUESTER_ID_KEY } from '../../src/lib/requesterContext'

// Vitest runs with the client project root as cwd.
const srcDir = join(process.cwd(), 'src')
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

describe('STYLE-01 theme tokens (AC-46, ui-spec §1.1)', () => {
  it('resolves the documented Zen Green values on :root', () => {
    expect(token('--zen-primary')).toBe('#006B3C')
    expect(token('--zen-secondary')).toBe('#0B7A46')
    expect(token('--zen-pale')).toBe('#EAF6EF')
    expect(token('--zen-page-bg')).toBe('#F5F7F6')
  })

  it('maps the tokens onto Bootstrap variables instead of restyling components', () => {
    expect(token('--bs-primary')).toBe('var(--zen-primary)')
    expect(token('--bs-body-bg')).toBe('var(--zen-page-bg)')
    expect(token('--bs-link-color')).toBe('var(--zen-secondary)')
  })
})

describe('STYLE-05 button hierarchy (ui-spec §2.3)', () => {
  it('renders the documented class for each level', () => {
    render(
      <>
        <Button variant="primary">Submit Ticket</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="tertiary">View</Button>
        <Button variant="destructive">Remove attachment</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Submit Ticket' })).toHaveClass('btn', 'btn-primary')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('btn', 'btn-outline-primary')
    expect(screen.getByRole('button', { name: 'View' })).toHaveClass('btn', 'btn-link')
    expect(screen.getByRole('button', { name: 'Remove attachment' })).toHaveClass(
      'btn',
      'btn-outline-danger',
    )
  })
})

describe('STYLE-06 disabled and busy controls (ui-spec §2.1)', () => {
  it('disables the control so it cannot be activated', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Submit Ticket
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Submit Ticket' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks a busy button with aria-busy, a spinner, and an explicit label', async () => {
    const onClick = vi.fn()
    render(
      <Button busy busyLabel="Submitting…" onClick={onClick}>
        Submit Ticket
      </Button>,
    )

    const button = screen.getByRole('button', { name: /Submitting…/ })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button.querySelector('.zen-spinner')).not.toBeNull()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('STYLE-07 badges (AC-48, ui-spec §2.4)', () => {
  it.each([
    ['LOW', 'zen-badge-low'],
    ['MEDIUM', 'zen-badge-medium'],
    ['HIGH', 'zen-badge-high'],
    ['URGENT', 'zen-badge-urgent'],
  ] as const)('renders %s with its own text and documented class', (value, className) => {
    const { container } = render(<Badge kind="priority" value={value} />)
    const badge = container.firstElementChild as HTMLElement

    expect(badge).toHaveClass('zen-badge', className)
    // Text alone identifies the value once colour is removed.
    expect(badge.textContent).toContain(value)
  })

  it('renders the NEW status badge with its own text', () => {
    const { container } = render(<Badge kind="status" value="NEW" />)
    const badge = container.firstElementChild as HTMLElement

    expect(badge).toHaveClass('zen-badge', 'zen-badge-new')
    expect(badge.textContent).toBe('NEW')
  })
})

describe('STYLE-08 no hard-coded colours (AC-46)', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return path.endsWith('zen-theme.css') ? [] : [path]
    })

  it('keeps every colour literal inside zen-theme.css', () => {
    const colourLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

    const offenders = sourceFiles(srcDir).filter((path) =>
      colourLiteral.test(readFileSync(path, 'utf8')),
    )

    expect(offenders.map((path) => relative(srcDir, path))).toEqual([])
  })
})


const ok = (body: unknown, status = 200) =>
  ({ ok: true, status, json: () => Promise.resolve(body) }) as Response

/** Create Ticket is the screen that carries read-only, required, and validated fields. */
function renderCreateTicket() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/requesters')) {
        return Promise.resolve(
          ok([{ id: 1, fullName: 'Nadia Charoen', email: 'n@t.test', department: 'Registrar' }]),
        )
      }
      if (url.startsWith('/api/categories')) return Promise.resolve(ok([{ id: 2, name: 'Hardware' }]))
      if (url.startsWith('/api/related-systems')) {
        return Promise.resolve(ok([{ id: 7, name: 'Corporate Laptop' }]))
      }
      return Promise.resolve(ok({}))
    }),
  )

  return render(
    <MemoryRouter initialEntries={['/tickets/new']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('Create Ticket field styling (STYLE-02, 03, 04)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(REQUESTER_ID_KEY, '1')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('STYLE-02 marks system-generated fields read-only and editable fields not', async () => {
    renderCreateTicket()

    for (const label of ['Ticket Number', 'Ticket Date', 'Current Status', 'Requester']) {
      const field = await screen.findByLabelText(label)
      expect(field).toHaveAttribute('readonly')
      expect(field).toHaveClass('zen-control')
    }

    expect(screen.getByLabelText(/^Ticket Summary/)).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^Description/)).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^Category/)).not.toHaveAttribute('readonly')
  })

  it('STYLE-03 marks every required control with an asterisk and aria-required', async () => {
    const { container } = renderCreateTicket()

    const requiredLabels = ['Ticket Summary', 'Description', 'Category', 'Related System']
    for (const label of requiredLabels) {
      const control = await screen.findByLabelText(new RegExp(`^${label}`))
      expect(control).toHaveAttribute('aria-required', 'true')

      const field = control.closest('.zen-field')!
      expect(within(field as HTMLElement).getByText('*')).toHaveClass('zen-required')
    }

    // The priority radio group carries the same marking on its fieldset.
    expect(container.querySelector('fieldset')).toHaveAttribute('aria-required', 'true')

    // The legend appears exactly once per form.
    expect(screen.getAllByText('Fields marked * are required.')).toHaveLength(1)
  })

  it('STYLE-04 puts each message beside its own field and links it with aria-describedby', async () => {
    renderCreateTicket()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Submit Ticket' }))

    for (const [label, message] of [
      [/^Ticket Summary/, 'Summary must be between 10 and 120 characters.'],
      [/^Description/, 'Description must be between 20 and 2000 characters.'],
      [/^Category/, 'Select a valid category.'],
    ] as const) {
      const control = screen.getByLabelText(label)
      const describedBy = control.getAttribute('aria-describedby')!.split(' ')
      const messageNode = describedBy
        .map((id) => document.getElementById(id))
        .find((node) => node?.textContent === message)

      expect(messageNode, `${message} must be referenced by its own field`).toBeTruthy()
      // A sibling of the control, not a distant top-of-page block.
      expect(messageNode!.parentElement).toBe(control.closest('.zen-field'))
      expect(messageNode).toHaveClass('zen-error-text')
    }

    // The summary callout is additional, never a replacement for the field messages.
    expect(screen.getByRole('alert')).toHaveTextContent(/fields need attention/)
  })
})
