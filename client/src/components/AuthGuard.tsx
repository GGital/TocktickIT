import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Callout from './Callout'
import { SkeletonCard } from './Skeleton'
import { useAuth } from '../lib/auth'

/**
 * Renders its children only for an authenticated user; anyone else is sent to /login (FR-05). This is
 * feedback, not protection — every route it wraps is enforced by the API (BR-16).
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { state, reload } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <main id="main" className="container py-4">
        <SkeletonCard label="Checking your session…" />
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main id="main" className="container py-4">
        <Callout variant="error" onRetry={reload}>
          We could not check your session. Please try again.
        </Callout>
      </main>
    )
  }

  if (state.status === 'unauthenticated') {
    // The intended location travels with the redirect so the Login screen can return there.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
