import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Button from './Button'
import Callout from './Callout'
import RoleBadge from './RoleBadge'
import { homeFor, useAuth, useCurrentUser } from '../lib/auth'
import { NAVIGATION } from '../lib/roles'

/**
 * Application shell (Lab 3 ui-spec §3), rendered only inside AuthGuard. Navigation comes from the role alone: a
 * destination the role may not open is never rendered (FR-11, ui-spec §2.2).
 */
export default function AppShell() {
  // AuthGuard renders the shell only for a signed-in user.
  const user = useCurrentUser()!
  const { signOut } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice

  // The mobile panel closes on navigation and on Esc (ui-spec §3).
  useEffect(() => setNavOpen(false), [location.pathname])

  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setNavOpen(false)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  async function handleLogOut() {
    setSigningOut(true)
    setSignOutFailed(false)
    try {
      // On success AuthGuard sees the session gone and replaces the whole shell with /login (AC-06).
      await signOut()
    } catch {
      setSignOutFailed(true)
      setSigningOut(false)
    }
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `zen-nav-link ${isActive ? 'zen-nav-link-active' : ''}`

  return (
    <>
      <header className="zen-header">
        <div className="container d-flex flex-wrap align-items-center gap-3 py-2">
          <Link to={homeFor(user.role)} className="zen-wordmark">
            TokTickIT
          </Link>

          <button
            type="button"
            className="btn zen-nav-toggle d-md-none"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>

          {/* Identity, Change Password, and Logout stay outside the collapsible menu at every width (ui-spec §3). */}
          <div className="zen-identity ms-auto d-flex flex-wrap align-items-center gap-2 order-md-last">
            <span className="zen-user">
              Signed in as <strong>{user.fullName}</strong>
            </span>
            <RoleBadge role={user.role} />
            <Link to="/change-password" className="zen-header-link">
              Change Password
            </Link>
            <Button
              variant="secondary"
              className="zen-on-primary"
              onClick={handleLogOut}
              busy={signingOut}
              busyLabel="Logging out…"
            >
              Log out
            </Button>
          </div>

          <nav
            aria-label="Main"
            // Full width only as the open mobile panel; beside the wordmark from 768 px up.
            className={`${navOpen ? 'd-flex w-100' : 'd-none'} d-md-flex flex-column flex-md-row gap-3`}
          >
            {NAVIGATION[user.role].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="container py-4">
        {signOutFailed && (
          <div className="mb-4">
            <Callout variant="error" onRetry={handleLogOut}>
              We could not log you out. Please try again.
            </Callout>
          </div>
        )}
        {/* A one-off message handed over by the previous screen, e.g. after a password change. */}
        {notice && (
          <div className="mb-4">
            <Callout variant="success">{notice}</Callout>
          </div>
        )}
        <Outlet />
      </main>
    </>
  )
}
