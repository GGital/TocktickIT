import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../src/styles/zen-theme.css'
import MetricCard from '../../src/components/MetricCard'

/** The declarations of one class's own rule: jsdom drops var() colours from the cascade, the stylesheet keeps them. */
const rule = (selector: string) => {
  const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]) as CSSStyleRule[]
  const found = rules.find((item) => item.selectorText === selector)
  if (!found) throw new Error(`No rule for ${selector}`)
  return found.style
}

const card = (count: number, emphasis = false) => {
  render(
    <MemoryRouter>
      <ul>
        <MetricCard label="Unassigned tickets" definition="Active, no owner" metric={{ count, href: '/staff/tickets' }} emphasis={emphasis} />
      </ul>
    </MemoryRouter>,
  )
  return screen.getByRole('link')
}

afterEach(() => vi.unstubAllGlobals())

describe('STYLE-02 metric card styles (ui-spec §2.1)', () => {
  it('a non-zero number is primary; zero is plain text', () => {
    const nonZero = card(3).querySelector('.zen-metric-number')!
    expect(nonZero).not.toHaveClass('zen-metric-zero')
    expect(rule('.zen-metric-number').getPropertyValue('color')).toBe('var(--zen-primary)')
    expect(rule('.zen-metric-zero').getPropertyValue('color')).toBe('var(--zen-text)')
  })

  it('zero renders "0" with the zero class and the same link', () => {
    const link = card(0)
    expect(link.querySelector('.zen-metric-number')).toHaveClass('zen-metric-zero')
    expect(link.querySelector('.zen-metric-number')).toHaveTextContent('0')
    expect(link).toHaveAttribute('href', '/staff/tickets')
  })

  it('is a zen-card: one radius and shadow token set, raised one step on hover, with the focus ring', () => {
    expect(card(1)).toHaveClass('zen-card', 'zen-metric')
    expect(rule('.zen-card').getPropertyValue('border-radius')).toBe('var(--zen-radius-card)')
    expect(rule('.zen-metric:hover').getPropertyValue('box-shadow')).toBe('var(--zen-shadow-raised)')
    expect(rule('.zen-metric:focus-visible').getPropertyValue('outline')).toBe('3px solid var(--zen-focus-ring)')
  })
})

describe('STYLE-05 the warning border on attention cards (ui-spec §2.1)', () => {
  it('is applied only when the count is above zero', () => {
    expect(card(2, true)).toHaveClass('zen-metric-attention')
    expect(rule('.zen-metric-attention').getPropertyValue('border-left-color')).toBe('var(--zen-warning)')
  })

  it('is not applied at zero', () => {
    expect(card(0, true)).not.toHaveClass('zen-metric-attention')
  })

  it('is not applied to a card without emphasis', () => {
    expect(card(5, false)).not.toHaveClass('zen-metric-attention')
  })
})

describe('STYLE-06 metric numbers use tabular figures (ui-spec §1.3)', () => {
  it('declares font-variant-numeric: tabular-nums', () => {
    expect(rule('.zen-metric-number').getPropertyValue('font-variant-numeric')).toBe('tabular-nums')
  })
})
