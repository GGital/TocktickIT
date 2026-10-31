import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../src/styles/zen-theme.css'
import MetricCard from '../../src/components/MetricCard'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { action, ada } from '../helpers/actions'

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

// --- STYLE-01, STYLE-03, STYLE-04, STYLE-07 --------------------------------------------------------------------------

type Rule = CSSStyleRule & { cssRules?: CSSRuleList }

/** Every style rule in the loaded stylesheets, including those nested inside @media blocks. */
const allStyleRules = () => {
  const walk = (rules: CSSRuleList): CSSStyleRule[] =>
    // A style rule is checked first: jsdom gives every style rule a (nesting) cssRules list too.
    [...rules].flatMap((item) => ('selectorText' in item ? [item as CSSStyleRule] : (item as Rule).cssRules ? walk((item as Rule).cssRules!) : []))
  return [...document.styleSheets].flatMap((sheet) => walk(sheet.cssRules))
}

const declarations = (item: CSSStyleRule) =>
  Array.from({ length: item.style.length }, (_, index) => item.style[index]).map((property) => [property, item.style.getPropertyValue(property)] as const)

const COLOUR_PROPERTY = /color|background|border|outline|shadow|fill|stroke/
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklch)\(/i

/** The Lab 4 components and screens: none may carry a colour of its own, inline or otherwise (FR-34). */
const LAB4_SOURCES = [
  'components/ActionTakenForm.tsx',
  'components/ActionsTakenPanel.tsx',
  'components/DashboardList.tsx',
  'components/DrilldownNotice.tsx',
  'components/FollowUpBadge.tsx',
  'components/MetricBreakdown.tsx',
  'components/MetricCard.tsx',
  'components/RequesterActionsList.tsx',
  'components/StaleCallout.tsx',
  'screens/RequesterDashboard.tsx',
  'screens/StaffDashboard.tsx',
  'screens/StaffTicketDetail.tsx',
]

describe('STYLE-01 the stylesheet and the Lab 4 components use only Zen Green tokens (AC-50, FR-34)', () => {
  it('declares no colour literal outside the :root token block', () => {
    // Guards against a walker that silently finds nothing: the theme has well over a hundred rules.
    expect(allStyleRules().length).toBeGreaterThan(100)
    const literals = allStyleRules()
      .filter((item) => item.selectorText !== ':root')
      .flatMap((item) =>
        declarations(item)
          .filter(([property, value]) => COLOUR_PROPERTY.test(property) && COLOUR_LITERAL.test(value))
          .map(([property, value]) => `${item.selectorText} { ${property}: ${value} }`),
      )
    expect(literals).toEqual([])
  })

  it('references only custom properties that the :root block defines', () => {
    const root = allStyleRules().find((item) => item.selectorText === ':root')!
    const defined = new Set(declarations(root).map(([property]) => property))
    const referenced = allStyleRules().flatMap((item) => declarations(item).flatMap(([, value]) => [...value.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1])))
    expect(referenced.length).toBeGreaterThan(50)
    expect([...new Set(referenced)].filter((name) => !defined.has(name))).toEqual([])
  })

  it('finds no colour literal and no inline style in any Lab 4 component or screen', () => {
    const offending = LAB4_SOURCES.flatMap((file) => {
      const source = readFileSync(resolve('src', file), 'utf8')
      return [...(COLOUR_LITERAL.test(source) ? [`${file}: colour literal`] : []), ...(/\bstyle=\{/.test(source) ? [`${file}: inline style`] : [])]
    })
    expect(offending).toEqual([])
  })
})

describe('STYLE-03 Performed by and Created are read-only text on their own ground (AC-50)', () => {
  it('renders them as values on --zen-readonly-bg, distinct from the --zen-field-bg of the fields', async () => {
    const { default: ActionTakenForm } = await import('../../src/components/ActionTakenForm')
    render(
      <ActionTakenForm
        ticketId={41}
        ticketCreatedAt="2026-10-19T03:00:00.000Z"
        action={action(214) as never}
        me={ada}
        onSaved={() => undefined}
        onClose={() => undefined}
        loadLatest={async () => undefined}
      />,
    )
    for (const term of ['Performed by', 'Created']) {
      const value = screen.getByText(term).nextElementSibling!
      expect(value.tagName).toBe('DD')
      expect(value).toHaveClass('zen-readonly-value')
      expect(value.querySelector('input, textarea, select')).toBeNull()
    }
    expect(screen.getByRole('textbox', { name: /^Action description/ })).toHaveClass('zen-control')
    expect(rule('.zen-readonly-value').getPropertyValue('background-color')).toBe('var(--zen-readonly-bg)')
    expect(rule('.zen-control').getPropertyValue('background-color')).toBe('var(--zen-field-bg)')
  })
})

describe('STYLE-04 follow-up, voided, and edited markers read as text (AC-52)', () => {
  it('names each follow-up state in its own words, so greyscale loses nothing', async () => {
    const { default: FollowUpBadge } = await import('../../src/components/FollowUpBadge')
    render(
      <>
        <FollowUpBadge required completed={false} />
        <FollowUpBadge required completed />
        <FollowUpBadge required={false} completed={false} />
      </>,
    )
    const texts = [...document.querySelectorAll('.zen-badge')].map((badge) => badge.textContent?.replace(/[◷✓]/g, '').trim())
    expect(texts).toEqual(['Follow-up outstanding', 'Follow-up done', 'No follow-up'])
    // Glyphs are decoration only, hidden from assistive technology.
    for (const glyph of document.querySelectorAll('.zen-badge [aria-hidden="true"]')) expect(glyph.textContent?.trim()).toMatch(/^[◷✓]$/)
  })

  it('gives the voided badge and the edited marker visible text', async () => {
    const { default: Badge } = await import('../../src/components/Badge')
    render(
      <>
        <Badge tone="voided">Voided</Badge>
        <span className="zen-edited">Edited</span>
      </>,
    )
    expect(screen.getByText('Voided')).toHaveClass('zen-badge-voided')
    expect(screen.getByText('Edited')).toBeVisible()
    expect(rule('.zen-badge-voided').getPropertyValue('color')).not.toBe('transparent')
  })
})

describe('STYLE-07 the Lab 2 focus ring reaches the Lab 4 controls (AC-51)', () => {
  /** The :focus-visible outline that would style this element, if any rule gives it one. */
  const focusOutline = (element: Element) => {
    for (const item of allStyleRules()) {
      for (const part of item.selectorText.split(',')) {
        if (!part.includes(':focus-visible')) continue
        const base = part.replace(/:focus-visible/g, '').trim() || '*'
        const outline = item.style.getPropertyValue('outline')
        if (element.matches(base) && outline && !/^(none|0)/.test(outline)) return outline
      }
    }
    return null
  }

  it('outlines metric cards, the row menu and its items, the voided-row toggle, and dialog fields and buttons', () => {
    const link = card(4)
    render(
      <>
        <div className="zen-row-menu">
          <button type="button" className="btn btn-outline-primary zen-row-menu-trigger" aria-haspopup="menu">
            ⋯
          </button>
          <ul role="menu" className="zen-row-menu-list">
            <li role="none">
              <button type="button" role="menuitem">
                Edit
              </button>
            </li>
          </ul>
        </div>
        <table>
          <tbody>
            <tr className="zen-action-voided">
              <td>
                <details>
                  <summary>Voided</summary>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
        <dialog open className="zen-dialog">
          <textarea className="zen-control" aria-label="Reason for voiding" />
          <button type="button" className="btn btn-primary">
            Void action
          </button>
        </dialog>
      </>,
    )
    const controls = {
      'metric card': link,
      'row menu trigger': screen.getByRole('button', { name: '⋯' }),
      'row menu item': screen.getByRole('menuitem', { name: 'Edit' }),
      'voided row toggle': screen.getByText('Voided'),
      'dialog field': screen.getByLabelText('Reason for voiding'),
      'dialog button': screen.getByRole('button', { name: 'Void action' }),
    }
    const missing = Object.entries(controls)
      .filter(([, element]) => !focusOutline(element))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })
})
