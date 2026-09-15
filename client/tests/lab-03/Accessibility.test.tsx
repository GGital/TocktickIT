import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForbiddenState from '../../src/components/ForbiddenState'

const renderForbidden = (role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') =>
  render(
    <MemoryRouter>
      <ForbiddenState role={role} />
    </MemoryRouter>,
  )

describe('UI-35 the shared forbidden state (AC-21, ui-spec §2.5)', () => {
  it.each([
    ['REQUESTER', 'Requester', '/tickets'],
    ['IT_STAFF', 'IT Staff', '/staff/tickets'],
    ['ADMINISTRATOR', 'Administrator', '/staff/tickets'],
  ] as const)('for a %s: one heading, the role named, and one action back home', (role, label, home) => {
    const { container } = renderForbidden(role)

    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('You do not have access to this page.')
    expect(screen.getByText(`Your account has the ${label} role, which cannot open this screen.`)).toBeInTheDocument()

    const actions = [...screen.queryAllByRole('link'), ...screen.queryAllByRole('button')]
    expect(actions).toHaveLength(1)
    expect(actions[0]).toHaveAttribute('href', home)
    expect(actions[0]).toHaveClass('btn', 'btn-primary')

    // States the fact without naming anything protected: no identifier, title, or count (BR-24).
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('is announced and looks different from the Lab 2 not-found state', () => {
    const { container } = renderForbidden('REQUESTER')

    const callout = screen.getByRole('alert')
    expect(callout).toHaveClass('zen-callout-warning')
    expect(within(callout).getByRole('heading')).toBeInTheDocument()
    expect(container.querySelector('.zen-empty')).toBeNull()
  })
})
