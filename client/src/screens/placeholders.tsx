import { Link } from 'react-router-dom'
import { homeFor, useCurrentUser } from '../lib/auth'

/**
 * The one screen left in this file (ui-spec §3, FR-31): an unknown address inside the shell. It names nothing about
 * what might have been there and offers one way back.
 */
export function NotFoundScreen() {
  const user = useCurrentUser()
  return (
    <div className="zen-card zen-empty">
      <h1>Page not found</h1>
      <p>This address does not match any page. Check the link, or go back to your dashboard.</p>
      {user && (
        <Link to={homeFor(user.role)} className="btn btn-primary">
          Go to your dashboard
        </Link>
      )}
    </div>
  )
}
