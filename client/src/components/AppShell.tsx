import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Button from './Button'
import { apiFetch, type Requester } from '../lib/apiClient'
import { clearRequesterId, useRequesterId } from '../lib/requesterContext'

/**
 * Application shell (ui-spec §3). Present on every route except /select-requester.
 * "Testing as" is deliberate wording: nobody may read this as a signed-in user
 * (BR-08, BR-50).
 */
export default function AppShell() {
  const requesterId = useRequesterId()
  const [requester, setRequester] = useState<Requester | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (requesterId === null) return

    let active = true
    apiFetch<Requester[]>('/requesters')
      .then((requesters) => {
        if (!active) return
        const match = requesters.find((candidate) => candidate.id === requesterId)
        // Absent from the active list means the stored context is no longer usable (BR-11).
        if (match) setRequester(match)
        else clearRequesterId({ wasRejected: true })
      })
      .catch(() => active && setRequester(null))

    return () => {
      active = false
    }
  }, [requesterId])

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
              <span className="zen-requester">
                Testing as: <strong>{requester?.fullName ?? '…'}</strong>
                {requester && (
                  <span className="zen-requester-department d-none d-lg-inline">
                    {' '}
                    — {requester.department}
                  </span>
                )}
              </span>

              <Button
                variant="secondary"
                className="zen-on-primary"
                onClick={() => navigate('/select-requester')}
              >
                Change Requester
              </Button>
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
