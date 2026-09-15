import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, apiFetch, onUnauthenticated } from './apiClient'

/** api-spec §2.1. No hash, no session id, and no isActive: a signed-in user is active by definition. */
export type AuthenticatedUser = {
  id: number
  fullName: string
  email: string
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR'
  mustChangePassword: boolean
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'unauthenticated' }
  // The session could not be checked at all (network or 500): not the same as being signed out.
  | { status: 'error' }

type AuthContextValue = {
  state: AuthState
  /** Shows the loading state and checks the session again — the start-up check and its retry. */
  reload: () => void
  /** Re-reads the user from GET /api/auth/me without a loading flash; the server is the only source (ui-spec §5.4). */
  refresh: () => Promise<AuthState>
  /** Ends the session on the server, then locally. */
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** The route each role lands on after signing in (ui-spec §4.3). */
export const homeFor = (role: AuthenticatedUser['role']) => (role === 'REQUESTER' ? '/tickets' : '/staff/tickets')

/**
 * Holds the authenticated user for the whole client, populated by GET /api/auth/me on start-up and dropped the
 * moment any request reports the session is gone (A-18, FR-03, FR-05).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const refresh = useCallback(async () => {
    let next: AuthState
    try {
      next = { status: 'authenticated', user: await apiFetch<AuthenticatedUser>('/auth/me') }
    } catch (error) {
      next = error instanceof ApiError && error.status === 401 ? { status: 'unauthenticated' } : { status: 'error' }
    }
    setState(next)
    return next
  }, [])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    void refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch (error) {
      // An already-ended session is the outcome we wanted; anything else is a real failure.
      if (!(error instanceof ApiError && error.status === 401)) throw error
    }
    setState({ status: 'unauthenticated' })
  }, [])

  useEffect(reload, [reload])
  useEffect(() => onUnauthenticated(() => setState({ status: 'unauthenticated' })), [])

  return (
    <AuthContext.Provider value={{ state, reload, refresh, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** The signed-in user, or null while the session is loading or absent. */
export function useCurrentUser(): AuthenticatedUser | null {
  const { state } = useAuth()
  return state.status === 'authenticated' ? state.user : null
}
