import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../lib/auth'

/**
 * Application shell (ui-spec §3), shown only to an authenticated user (FR-11).
 */
export default function AppShell() {
  const user = useCurrentUser()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  // The mobile panel closes on navigation and on Esc (ui-spec §3).
  useEffect(() => setNavOpen(false), [location.pathname])

  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `zen-nav-link ${isActive ? 'zen-nav-link-active' : ''}`

  return (
    <>
      <header className="zen-header">
        <div className="container d-flex flex-wrap align-items-center gap-3 py-2">
          <Link to="/tickets" className="zen-wordmark">
            TokTickIT
          </Link>

          <button
            type="button"
            className="btn zen-nav-toggle d-md-none ms-auto"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>

          <nav
            aria-label="Main"
            className={`${navOpen ? 'd-flex' : 'd-none'} d-md-flex flex-column flex-md-row align-items-md-center gap-3 w-100 w-md-auto`}
          >
            <NavLink to="/tickets" end className={navLinkClass}>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navLinkClass}>
              Create Ticket
            </NavLink>

            <div className="ms-md-auto d-flex flex-column flex-md-row align-items-md-center gap-2">
              <span className="zen-user">
                <strong>{user?.fullName}</strong>
              </span>
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="container py-4">
        <Outlet />
      </main>
    </>
  )
}
