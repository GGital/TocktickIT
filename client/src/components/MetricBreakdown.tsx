import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Metric } from './MetricCard'

/**
 * Per-status or per-priority counts (ui-spec §2.2): every key, zero included, in the order given, each row a link to
 * its list. Badges and numbers only — no charts (X-06).
 */
export default function MetricBreakdown<K extends string>({
  id,
  title,
  keys,
  metrics,
  badge,
}: {
  id: string
  title: string
  keys: readonly K[]
  metrics: Record<K, Metric>
  badge: (key: K) => ReactNode
}) {
  return (
    <section className="zen-card h-100" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="list-unstyled mb-0">
        {keys.map((key) => (
          <li key={key}>
            <Link to={metrics[key].href} state={{ showing: title }} className="zen-breakdown-row">
              {badge(key)}
              <span className="zen-metric-count">{metrics[key].count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
