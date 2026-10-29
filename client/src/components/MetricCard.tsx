import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type Metric = { count: number; href: string }

/**
 * One count, one definition, one link (ui-spec §2.1). The number is the API's; zero is an answer, not a failure, so
 * it keeps its card and its link (BR-51). `showing` travels to the list so it can say which card opened it (§8).
 */
export default function MetricCard({
  label,
  definition,
  metric,
  emphasis = false,
  name,
}: {
  label: string
  definition: string
  metric: Metric
  /** Adds the warning edge when the count is above zero; the label carries the meaning too (AC-52). */
  emphasis?: boolean
  /** Overrides the accessible name for a card with more than one number. */
  name?: string
}) {
  const { count, href } = metric
  return (
    <li className="col">
      <Link
        to={href}
        state={{ showing: label }}
        aria-label={name ?? `${label}: ${count}. View list`}
        className={`zen-card zen-metric ${emphasis && count > 0 ? 'zen-metric-attention' : ''}`.trim()}
      >
        <h3 className="zen-metric-label">{label}</h3>
        {/* Bootstrap's h2 size, without making the number a heading (ui-spec §1.3). */}
        <p className={`h2 zen-metric-number ${count === 0 ? 'zen-metric-zero' : ''}`.trim()}>{count}</p>
        <p className="zen-help">{definition}</p>
        <span className="zen-metric-more">
          View list <span aria-hidden="true">→</span>
        </span>
      </Link>
    </li>
  )
}

/** A titled group of cards: a `<ul>`, so a screen reader announces "list, 6 items" (ui-spec §11). */
export function MetricGroup({ id, title, hidden = false, children }: { id: string; title: string; hidden?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-4">
      <h2 id={id} className={hidden ? 'visually-hidden' : undefined}>
        {title}
      </h2>
      <ul className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3 list-unstyled mb-0">{children}</ul>
    </section>
  )
}
