import type { ReactNode } from 'react'
import ForbiddenState from './ForbiddenState'
import { useCurrentUser } from '../lib/auth'
import type { Role } from '../lib/roles'

/**
 * Renders the forbidden state instead of a screen the signed-in role may not open (FR-13, AC-21). Feedback only:
 * the API refuses the same operations with 403 whatever this renders (BR-23). Used inside AuthGuard.
 */
export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const user = useCurrentUser()
  if (!user || !roles.includes(user.role)) return user ? <ForbiddenState role={user.role} /> : null
  return <>{children}</>
}
