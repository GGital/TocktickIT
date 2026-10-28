import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bee, malee, renderAt, response, staffActions, staffUser, stubApi, ticket } from '../helpers/actions'

beforeEach(() => {
  stubApi({
    'GET /api/auth/me': () => response(200, staffUser),
    'GET /api/staff/tickets/41': () => response(200, ticket()),
    'GET /api/staff/assignees': () => response(200, [bee, malee]),
    'GET /api/tickets/41/comments': () => response(200, []),
    'GET /api/staff/tickets/41/internal-notes': () => response(200, []),
    'GET /api/staff/tickets/41/actions': () => response(200, staffActions()),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const loadedPanel = async () => {
  const panel = await screen.findByRole('region', { name: /^Actions Taken/ })
  await within(panel).findByText('Called the user to confirm the new profile.')
  return panel
}

/** What the browser fires on Esc in an open modal <dialog>; jsdom has no key handling for it. */
const pressEscapeIn = (dialog: HTMLElement) => act(() => void dialog.dispatchEvent(new Event('cancel', { cancelable: true })))

describe('A11Y-02 action and void dialog focus (AC-51)', () => {
  it('the action dialog is modal, focuses the first field, cancels on Esc, and returns focus to Record action', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const trigger = within(panel).getByRole('button', { name: 'Record action' })

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Record action' })

    // showModal makes everything outside the dialog inert, which is what confines Tab to it in the browser.
    expect(showModal).toHaveBeenCalled()
    expect(within(dialog).getByLabelText(/Action date and time \(Bangkok time\)/)).toHaveFocus()

    await pressEscapeIn(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('the void dialog focuses its reason, and Cancel returns focus to the row menu trigger', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const trigger = within(panel).getByRole('button', { name: 'Actions for action recorded 19 Oct 2026 14:40' })

    await user.click(trigger)
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Void' }))
    const dialog = screen.getByRole('dialog', { name: /^Void action recorded/ })
    expect(within(dialog).getByRole('textbox', { name: 'Reason for voiding' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Esc also cancels the void dialog', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const trigger = within(panel).getByRole('button', { name: 'Actions for action recorded 19 Oct 2026 14:40' })
    await user.click(trigger)
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Void' }))

    await pressEscapeIn(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('A11Y-03 the conditional follow-up note (AC-51)', () => {
  it('is inserted right after the radio group, required, and leaves focus on the radio', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    await user.click(within(panel).getByRole('button', { name: 'Record action' }))
    const dialog = screen.getByRole('dialog', { name: 'Record action' })

    const yes = within(dialog).getByRole('radio', { name: 'Yes' })
    await user.click(yes)

    const group = within(dialog).getByRole('group', { name: 'Follow-up required?' })
    const note = within(dialog).getByRole('textbox', { name: 'Follow-up note' })
    expect(group.nextElementSibling).toContainElement(note)
    expect(note).toHaveAttribute('aria-required', 'true')
    expect(yes).toHaveFocus()
    expect(group).toHaveAccessibleDescription(/A follow-up note will be required\./)
  })
})

describe('A11Y-04 the row menu (AC-51)', () => {
  it('is a menu button whose items are menuitems, moved through with arrow keys and closed with Esc', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets/41')
    const panel = await loadedPanel()
    const trigger = within(panel).getByRole('button', { name: 'Actions for action recorded 19 Oct 2026 14:40' })

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    trigger.focus()
    await user.keyboard('{Enter}')
    const menu = screen.getByRole('menu')
    const [edit, voidItem] = within(menu).getAllByRole('menuitem')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(edit).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(voidItem).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(edit).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(voidItem).toHaveFocus()
    await user.keyboard('{Home}')
    expect(edit).toHaveFocus()
    await user.keyboard('{End}')
    expect(voidItem).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
