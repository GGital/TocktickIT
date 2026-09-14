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

type AuthContextValue = { state: AuthState; reload: () => void }

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Holds the authenticated user for the whole client, populated once by GET /api/auth/me on start-up and
 * dropped the moment any request reports the session is gone (A-18, FR-03, FR-05).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<AuthenticatedUser>('/auth/me')
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((error) =>
        setState(error instanceof ApiError && error.status === 401 ? { status: 'unauthenticated' } : { status: 'error' }),
      )
  }, [])

  useEffect(reload, [reload])
  useEffect(() => onUnauthenticated(() => setState({ status: 'unauthenticated' })), [])

  return <AuthContext.Provider value={{ state, reload }}>{children}</AuthContext.Provider>
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
