import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Callout from './Callout'
import { SkeletonCard } from './Skeleton'
import { useAuth } from '../lib/auth'

/**
 * Renders its children only for an authenticated user; anyone else is sent to /login (FR-05). A user with an
 * outstanding password change is sent to /change-password from every other route, including a direct URL and a
 * reload (BR-17). This is feedback, not protection — the API enforces both rules itself (BR-15, BR-16).
 */
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { state, reload } = useAuth()
  const { pathname } = useLocation()

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

  if (state.status === 'unauthenticated') return <Navigate to="/login" replace />

  if (state.user.mustChangePassword && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}
