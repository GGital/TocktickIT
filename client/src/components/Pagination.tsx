import Button from './Button'

// ui-spec §6.4: range text, Prev / numbered pages / Next, current page marked
// aria-current, Prev disabled on page 1 and Next on the last page.
type PaginationProps = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalItems === 0) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, totalItems)
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  return (
    <nav className="zen-pagination" aria-label="Ticket list pages">
      <p className="zen-page-range mb-0">
        Showing {first}–{last} of {totalItems}
      </p>

      <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ‹ Prev
      </Button>

      {pages.map((number) => (
        <Button
          key={number}
          variant={number === page ? 'primary' : 'secondary'}
          className="zen-page"
          aria-current={number === page ? 'page' : undefined}
          aria-label={`Page ${number}`}
          onClick={() => onPageChange(number)}
        >
          {number}
        </Button>
      ))}

      <Button
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next ›
      </Button>
    </nav>
  )
}
