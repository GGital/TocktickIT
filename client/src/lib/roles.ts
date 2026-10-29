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
type NavItem = { to: string; label: string; active: (pathname: string) => boolean }

const exactly = (to: string) => (pathname: string) => pathname === to
const within = (to: string) => (pathname: string) => pathname === to || pathname.startsWith(`${to}/`)

const DASHBOARD = { to: '/dashboard', label: 'Dashboard', active: exactly('/dashboard') }
const STAFF_DASHBOARD = { to: '/staff/dashboard', label: 'Dashboard', active: exactly('/staff/dashboard') }
// /staff/dashboard sits under /staff but is not the Queue, so the Queue owns /staff/tickets and its details only.
const QUEUE = { to: '/staff/tickets', label: 'Ticket Queue', active: within('/staff/tickets') }

/**
 * Dashboard first for every role (FR-24). A detail route highlights its parent: /tickets/:id is My Tickets, while
 * /tickets/new is Create Ticket (FR-25).
 */
export const NAVIGATION: Record<Role, NavItem[]> = {
  REQUESTER: [
    DASHBOARD,
    { to: '/tickets', label: 'My Tickets', active: (pathname) => within('/tickets')(pathname) && pathname !== '/tickets/new' },
    { to: '/tickets/new', label: 'Create Ticket', active: exactly('/tickets/new') },
  ],
  IT_STAFF: [STAFF_DASHBOARD, QUEUE],
  ADMINISTRATOR: [STAFF_DASHBOARD, QUEUE, { to: '/admin/users', label: 'User Management', active: within('/admin/users') }],
}
