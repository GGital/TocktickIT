import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App'

const seededCategories = [
  { id: 1, name: 'Account and Access' },
  { id: 2, name: 'Hardware' },
  { id: 3, name: 'Software' },
  { id: 4, name: 'Network' },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UI-02 loading state', () => {
  it('shows the loading state, then replaces it with the category list', async () => {
    // Responses stay pending until released, so the loading state can be asserted before the data lands.
    const release: Array<() => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise((resolve) => {
            release.push(() =>
              resolve({
                ok: true,
                json: async () =>
                  url.includes('/api/health')
                    ? { status: 'ok', service: 'TokTickIT API' }
                    : seededCategories,
              })
            )
          })
      )
    )

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Check System' }))

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText('Account and Access')).not.toBeInTheDocument()

    await act(async () => {
      release.forEach((resolve) => resolve())
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(await screen.findByText('System Status: Online')).toBeInTheDocument()
    for (const category of seededCategories) {
      expect(screen.getByText(category.name)).toBeInTheDocument()
    }
  })
})
