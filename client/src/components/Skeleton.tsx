// ui-spec §2.5: a loading placeholder always carries accessible text, never a bare shape.

export function SkeletonRows({ rows = 6, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="zen-skeleton zen-skeleton-row" />
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 3, label = 'Loading…' }: { lines?: number; label?: string }) {
  return (
    <div className="zen-card mb-3" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="zen-skeleton zen-skeleton-row"
          style={{ width: index === 0 ? '40%' : '100%' }}
        />
      ))}
    </div>
  )
}

/** A dashboard's skeleton in its final layout, so nothing shifts when the numbers arrive (ui-spec §4.3, §5.4). */
export function DashboardSkeleton({ cards, lists }: { cards: number; lists: number }) {
  return (
    <>
      <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3 mb-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="col">
            <SkeletonCard lines={3} label="Loading dashboard…" />
          </div>
        ))}
      </div>
      <div className="row g-3">
        {Array.from({ length: lists }, (_, index) => (
          <div key={index} className="col-lg-6">
            <SkeletonCard lines={5} label="Loading dashboard…" />
          </div>
        ))}
      </div>
    </>
  )
}
