import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UI-03 backend unavailable', () => {
  it('shows a useful error message when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Check System' }))

    expect(await screen.findByText('System Status: Offline')).toBeInTheDocument()
    expect(screen.getByText('Unable to connect to TokTickIT API')).toBeInTheDocument()
  })
})
