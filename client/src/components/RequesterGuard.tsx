import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useRequesterId } from '../lib/requesterContext'

/**
 * FR-05: any requester-scoped screen falls back to the selection screen when no
 * valid context exists. Subscribed to the context store, so a backend rejection
 * (403 REQUESTER_CONTEXT_INVALID) redirects immediately (BR-11, AC-07).
 */
export default function RequesterGuard({ children }: { children: ReactNode }) {
  const requesterId = useRequesterId()

  if (requesterId === null) return <Navigate to="/select-requester" replace />

  return <>{children}</>
}
