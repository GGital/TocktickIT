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
