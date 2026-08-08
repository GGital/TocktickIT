import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../../src/App'

describe('UI-01 TokTickIT heading', () => {
  it('renders the application heading and the Check System button', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'TokTickIT IT Service Desk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check System' })).toBeInTheDocument()
  })
})
