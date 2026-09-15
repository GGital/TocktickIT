import type { AuthenticatedUser } from './auth'

export type Role = AuthenticatedUser['role']

/** The role names as people read them (ui-spec §1.2). */
export const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
}

/**
 * Navigation derived from the role (ui-spec §2.2). A destination missing here is never rendered for that role —
 * not disabled, not hidden by CSS. The API refuses the operation regardless (BR-23).
 */
export const NAVIGATION: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  REQUESTER: [
    { to: '/tickets', label: 'My Tickets', end: true },
    { to: '/tickets/new', label: 'Create Ticket' },
  ],
  IT_STAFF: [{ to: '/staff/tickets', label: 'Ticket Queue' }],
  ADMINISTRATOR: [
    { to: '/staff/tickets', label: 'Ticket Queue' },
    { to: '/admin/users', label: 'User Management' },
  ],
}
