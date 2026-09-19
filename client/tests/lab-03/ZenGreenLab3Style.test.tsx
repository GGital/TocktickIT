import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../src/styles/zen-theme.css'
import AppRoutes from '../../src/AppRoutes'
import PriorityBadge from '../../src/components/PriorityBadge'
import RoleBadge from '../../src/components/RoleBadge'
import StatusBadge from '../../src/components/StatusBadge'

/** jsdom leaves custom properties unresolved, so a computed colour reads back as the token it was built from. */
const styleOf = (element: Element) => {
  const style = getComputedStyle(element)
  return { background: style.backgroundColor, color: style.color }
}

/**
 * jsdom's cascade drops a var() border colour, though the stylesheet keeps it, so the outline is read from the
 * badge's own tone rule — the declaration that paints it in a browser.
 */
const declaredBorder = (element: Element) => {
  const tone = [...element.classList].find((name) => name !== 'zen-badge')
  const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]) as CSSStyleRule[]
  return rules.find((rule) => rule.selectorText === `.${tone}`)?.style.getPropertyValue('border-color')
}

/** The text a reader gets with colour removed: everything except aria-hidden decoration. */
function readableText(element: Element): string {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const badge = (ui: React.ReactElement) => render(ui).container.firstElementChild as HTMLElement

const STATUSES = [
  ['NEW', 'New', 'var(--zen-primary)', 'var(--zen-surface)'],
  ['OPEN', 'Open', 'var(--zen-secondary)', 'var(--zen-surface)'],
  ['IN_PROGRESS', 'In Progress', 'var(--zen-surface)', 'var(--zen-secondary)'],
  ['WAITING_FOR_REQUESTER', 'Waiting for Requester', 'color-mix(in srgb, var(--zen-warning) 12%, transparent)', 'var(--zen-warning)'],
  ['RESOLVED', 'Resolved', 'var(--zen-pale)', 'var(--zen-success)'],
  ['CLOSED', 'Closed', 'var(--zen-readonly-bg)', 'var(--zen-text)'],
  ['REOPENED', 'Reopened', 'var(--zen-surface)', 'var(--zen-warning)'],
  ['CANCELLED', 'Cancelled', 'var(--zen-readonly-bg)', 'color-mix(in srgb, var(--zen-text) 70%, transparent)'],
] as const

const PRIORITIES = [
  ['LOW', 'var(--zen-readonly-bg)', 'var(--zen-neutral)'],
  ['MEDIUM', 'var(--zen-pale)', 'var(--zen-primary)'],
  ['HIGH', 'var(--zen-warning-bg)', 'var(--zen-warning)'],
  ['URGENT', 'var(--zen-error-bg)', 'var(--zen-error)'],
] as const

const ROLES = [
  ['REQUESTER', 'Requester', 'var(--zen-readonly-bg)', 'var(--zen-text)'],
  ['IT_STAFF', 'IT Staff', 'var(--zen-pale)', 'var(--zen-secondary)'],
  ['ADMINISTRATOR', 'Administrator', 'var(--zen-primary)', 'var(--zen-surface)'],
] as const

describe('STYLE-02 all eight status badges (AC-68, ui-spec §1.2)', () => {
  it.each(STATUSES)('%s renders "%s" on its documented background and text colour', (value, label, background, color) => {
    const element = badge(<StatusBadge value={value} />)

    expect(element).toHaveClass('zen-badge')
    expect(readableText(element)).toBe(label)
    expect(styleOf(element)).toMatchObject({ background, color })
  })

  it('outlines In Progress and Reopened, and marks Resolved with a decorative check', () => {
    expect(declaredBorder(badge(<StatusBadge value="IN_PROGRESS" />))).toBe('var(--zen-secondary)')
    expect(declaredBorder(badge(<StatusBadge value="REOPENED" />))).toBe('var(--zen-warning)')
    expect(declaredBorder(badge(<StatusBadge value="OPEN" />))).toBeFalsy()

    const resolved = badge(<StatusBadge value="RESOLVED" />)
    expect(resolved.querySelector('[aria-hidden="true"]')).toHaveTextContent('✓')
  })
})

describe('STYLE-03 both priority families (AC-68)', () => {
  it.each(PRIORITIES)('%s: Requested and IT share the colour but never the label', (value, background, color) => {
    const requested = badge(<PriorityBadge kind="requested" value={value} />)
    const it = badge(<PriorityBadge kind="it" value={value} />)

    expect(readableText(requested)).toBe(`Requested: ${value}`)
    expect(readableText(it)).toBe(`IT: ${value}`)
    expect(styleOf(requested)).toMatchObject({ background, color })
    expect(styleOf(it)).toMatchObject({ background, color })
  })
})

describe('STYLE-04 the three role badges (AC-68, ui-spec §1.2)', () => {
  it.each(ROLES)('%s renders "%s" with its documented treatment', (role, label, background, color) => {
    const element = badge(<RoleBadge role={role} />)

    expect(element).toHaveClass('zen-badge')
    expect(readableText(element)).toBe(label)
    expect(styleOf(element)).toMatchObject({ background, color })
  })
})

describe('STYLE-08 every badge reads correctly with colour removed (AC-68)', () => {
  it('gives every value of every family its own readable text', () => {
    const texts = [
      ...STATUSES.map(([value]) => readableText(badge(<StatusBadge value={value} />))),
      ...PRIORITIES.flatMap(([value]) => [
        readableText(badge(<PriorityBadge kind="requested" value={value} />)),
        readableText(badge(<PriorityBadge kind="it" value={value} />)),
      ]),
      ...ROLES.map(([role]) => readableText(badge(<RoleBadge role={role} />))),
    ]

    // 8 statuses + 4 × 2 priorities + 3 roles, and no two read the same once colour is gone.
    expect(texts).toHaveLength(19)
    expect(new Set(texts).size).toBe(texts.length)
    for (const text of texts) expect(text).not.toBe('')
  })

  it('keeps glyphs decorative so they are never the only signal', () => {
    for (const value of ['HIGH', 'URGENT'] as const) {
      const element = badge(<PriorityBadge kind="it" value={value} />)
      const glyph = element.querySelector('[aria-hidden="true"]')
      expect(glyph?.textContent).toMatch(/▲/)
      expect(readableText(element)).toBe(`IT: ${value}`)
    }
  })
})

/** The declared value of a property on the first rule matching a selector — jsdom drops var() borders in the cascade. */
const declared = (selector: string, property: string) =>
  ([...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]) as CSSStyleRule[])
    .find((rule) => rule.selectorText === selector)
    ?.style.getPropertyValue(property)

describe('Staff Ticket Detail surfaces (Lab 3 ui-spec §8)', () => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response
  const detail = {
    id: 41,
    ticketNumber: 'TKT-2026-000041',
    summary: 'VPN disconnects',
    description: 'Drops every ten minutes.',
    category: { id: 2, name: 'Network' },
    relatedSystem: { id: 3, name: 'VPN' },
    requester: { id: 12, fullName: 'Nara Sukjai', email: 'nara@toktickit.test', department: null },
    requestedPriority: 'HIGH',
    itPriority: 'MEDIUM',
    status: 'OPEN',
    assignee: null,
    requesterResolvedFlaggedAt: null,
    createdAt: '2026-09-04T02:20:00.000Z',
    updatedAt: '2026-09-09T08:02:31.000Z',
    attachments: [],
  }

  const renderDetail = () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return Promise.resolve(json({ id: 7, fullName: 'Ada', email: 'a@t.test', role: 'IT_STAFF', mustChangePassword: false }))
        if (url === '/api/staff/tickets/41') return Promise.resolve(json(detail))
        return Promise.resolve(json([]))
      }),
    )
    render(
      <MemoryRouter initialEntries={['/staff/tickets/41']}>
        <AppRoutes />
      </MemoryRouter>,
    )
  }

  afterEach(() => vi.unstubAllGlobals())

  describe('STYLE-05 the Internal Notes panel (AC-66)', () => {
    it('resolves its border and heading to --zen-warning, distinct from the Public panel border', async () => {
      renderDetail()
      const internal = await screen.findByRole('region', { name: 'Internal Notes, not visible to the Requester' })
      const publicPanel = screen.getByRole('region', { name: 'Public Comments' })

      expect(internal).toHaveClass('zen-internal')
      expect(publicPanel).not.toHaveClass('zen-internal')
      expect(declared('.zen-internal', 'border-color')).toBe('var(--zen-warning)')
      expect(declared('.zen-card', 'border')).toContain('var(--zen-border)')
      expect(getComputedStyle(within(internal).getByRole('heading', { level: 2 })).color).toBe('var(--zen-warning)')
      expect(getComputedStyle(within(publicPanel).getByRole('heading', { level: 2 })).color).not.toBe('var(--zen-warning)')
      // Thicker than the standard card border, so the difference survives a greyscale rendering.
      expect(declared('.zen-internal', 'border-left-width')).toBe('6px')
    })
  })

  describe('STYLE-06 read-only fields versus operations controls (AC-65)', () => {
    it('paints read-only values with --zen-readonly-bg and editable controls with --zen-field-bg', async () => {
      renderDetail()
      const info = await screen.findByRole('region', { name: 'Ticket information' })
      const operations = screen.getByRole('region', { name: 'Operations' })

      const values = info.querySelectorAll('.zen-readonly-value')
      expect(values.length).toBeGreaterThanOrEqual(6)
      for (const value of values) expect(getComputedStyle(value).backgroundColor).toBe('var(--zen-readonly-bg)')

      for (const control of within(operations).getAllByRole('combobox')) {
        expect(getComputedStyle(control).backgroundColor).toBe('var(--zen-field-bg)')
      }
    })
  })
})

// --- STYLE-01 and STYLE-07 read the theme itself: jsdom keeps the declared values, so the stylesheet is the evidence.

type Rule = CSSStyleRule & { cssRules?: CSSRuleList }

/** Every style rule in the loaded stylesheets, including those nested inside @media blocks. */
const allStyleRules = () => {
  const walk = (rules: CSSRuleList): CSSStyleRule[] =>
    // A style rule is checked first: jsdom gives every style rule a (nesting) cssRules list too.
    [...rules].flatMap((rule) => ('selectorText' in rule ? [rule as CSSStyleRule] : (rule as Rule).cssRules ? walk((rule as Rule).cssRules!) : []))
  return [...document.styleSheets].flatMap((sheet) => walk(sheet.cssRules))
}

const declarations = (rule: CSSStyleRule) =>
  Array.from({ length: rule.style.length }, (_, index) => rule.style[index]).map((property) => [property, rule.style.getPropertyValue(property)] as const)

const COLOUR_PROPERTY = /color|background|border|outline|shadow|fill|stroke/
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklch)\(|\b(?:white|black|red|green|blue|gray|grey|orange|yellow)\b/i

describe('STYLE-01 every colour resolves to a Zen Green token (AC-65)', () => {
  it('declares no colour literal outside the :root token block', () => {
    // Guards against a walker that silently finds nothing: the theme has well over a hundred rules.
    expect(allStyleRules().length).toBeGreaterThan(100)
    const literals = allStyleRules()
      .filter((rule) => rule.selectorText !== ':root')
      .flatMap((rule) =>
        declarations(rule)
          .filter(([property, value]) => COLOUR_PROPERTY.test(property) && COLOUR_LITERAL.test(value))
          .map(([property, value]) => `${rule.selectorText} { ${property}: ${value} }`),
      )
    expect(literals).toEqual([])
  })

  it('references only custom properties that the :root block defines', () => {
    const root = allStyleRules().find((rule) => rule.selectorText === ':root')!
    const defined = new Set(declarations(root).map(([property]) => property))
    const referenced = allStyleRules().flatMap((rule) =>
      declarations(rule).flatMap(([, value]) => [...value.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1])),
    )
    expect(referenced.length).toBeGreaterThan(50)
    expect([...new Set(referenced)].filter((name) => !defined.has(name))).toEqual([])
  })
})

describe('STYLE-07 focus stays visible on the Lab 3 controls (AC-67)', () => {
  /** The :focus-visible rule that would style this element, with its outline value. */
  const focusOutline = (element: Element) => {
    for (const rule of allStyleRules()) {
      for (const part of rule.selectorText.split(',')) {
        if (!part.includes(':focus-visible')) continue
        const base = part.replace(/:focus-visible/g, '').trim() || '*'
        const outline = rule.style.getPropertyValue('outline')
        if (element.matches(base) && outline && !/^(none|0)/.test(outline)) return outline
      }
    }
    return null
  }

  it('gives password fields, reveal toggles, Queue sort headers, and dialog actions a visible focus ring', async () => {
    const { default: PasswordField } = await import('../../src/components/PasswordField')
    const { default: ConfirmDialog } = await import('../../src/components/ConfirmDialog')
    render(
      <>
        <PasswordField id="style07-password" label="Password" />
        <table>
          <thead>
            <tr>
              <th aria-sort="descending">
                <button type="button" className="zen-sort">IT Priority</button>
              </th>
            </tr>
          </thead>
        </table>
        <ConfirmDialog open title="Resolve ticket?" confirmLabel="Resolve ticket" onConfirm={() => undefined} onCancel={() => undefined}>
          <p>Body</p>
        </ConfirmDialog>
      </>,
    )

    const controls = {
      'password field': screen.getByLabelText('Password'),
      'reveal toggle': screen.getByRole('button', { name: 'Show password' }),
      'Queue sort header': screen.getByRole('button', { name: 'IT Priority' }),
      'dialog cancel': screen.getByRole('button', { name: 'Cancel', hidden: true }),
      'dialog confirm': screen.getByRole('button', { name: 'Resolve ticket', hidden: true }),
    }
    for (const [name, element] of Object.entries(controls)) {
      expect(focusOutline(element), name).toContain('var(--zen-focus-ring)')
    }
  })

  it('never removes an outline without putting a replacement indicator in its place', () => {
    const removed = allStyleRules().filter((rule) =>
      declarations(rule).some(([property, value]) => /^outline(-style|-width)?$/.test(property) && /^(none|0(px)?)$/.test(value.trim())),
    )
    const unreplaced = removed.filter((rule) => !declarations(rule).some(([property]) => property === 'box-shadow' || property.startsWith('border')))
    expect(unreplaced.map((rule) => rule.selectorText)).toEqual([])
  })
})
