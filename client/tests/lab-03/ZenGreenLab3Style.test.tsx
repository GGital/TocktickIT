import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import '../../src/styles/zen-theme.css'
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
