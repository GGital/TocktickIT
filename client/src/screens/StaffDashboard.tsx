import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Callout from '../components/Callout'
import { DashboardActionList, DashboardTicketList, type DashboardActionItem, type DashboardTicketItem } from '../components/DashboardList'
import ForbiddenState from '../components/ForbiddenState'
import MetricBreakdown from '../components/MetricBreakdown'
import MetricCard, { MetricGroup, type Metric } from '../components/MetricCard'
import PriorityBadge, { type Priority } from '../components/PriorityBadge'
import { DashboardSkeleton } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import { updatedAt } from '../lib/formatBangkok'
import type { Role } from '../lib/roles'
import { TICKET_STATUSES, type TicketStatus } from '../lib/ticketLabels'

type MetricKey = 'unassigned' | 'myOpen' | 'urgentActive' | 'requesterFlagged' | 'myOutstandingFollowUps' | 'newToday'

/** GET /api/staff/dashboard (api-spec §3.14). `administration` is present only for an Administrator (BR-70). */
type StaffDashboardData = {
  generatedAt: string
  metrics: Record<MetricKey, Metric>
  byStatus: Record<TicketStatus, Metric>
  byItPriority: Record<Priority, Metric>
  recentlyUpdated: DashboardTicketItem[]
  myRecentActions: DashboardActionItem[]
  administration?: {
    users: { activeByRole: Record<Role, Metric>; inactive: Metric; mustChangePassword: Metric }
  }
}

type Load = { state: 'loading' } | { state: 'loaded'; data: StaffDashboardData } | { state: 'forbidden' } | { state: 'error' }

/** Severity order, most urgent first (ui-spec §2.2). */
const SEVERITY: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

/** The six cards in the documented order; `emphasis` marks the two that need someone now (ui-spec §2.1, §5.1). */
const CARDS: { key: MetricKey; label: string; definition: string; emphasis?: boolean }[] = [
  { key: 'unassigned', label: 'Unassigned tickets', definition: 'Active, no owner', emphasis: true },
  { key: 'myOpen', label: 'Assigned to me', definition: 'Active, owner: you' },
  { key: 'urgentActive', label: 'Urgent and active', definition: 'IT priority Urgent', emphasis: true },
  { key: 'requesterFlagged', label: 'Requester says resolved', definition: 'Review and resolve' },
  { key: 'myOutstandingFollowUps', label: 'My follow-ups', definition: 'Tickets with your open follow-ups' },
  { key: 'newToday', label: 'New today', definition: 'Since 00:00 Bangkok' },
]

const ROLE_CARDS: { role: Role; label: string }[] = [
  { role: 'REQUESTER', label: 'Active Requesters' },
  { role: 'IT_STAFF', label: 'Active IT Staff' },
  { role: 'ADMINISTRATOR', label: 'Active Administrators' },
]

/** The Administrator's Accounts group (ui-spec §5.2). */
function Accounts({ users }: { users: NonNullable<StaffDashboardData['administration']>['users'] }) {
  const { inactive, mustChangePassword } = users
  return (
    <MetricGroup id="accounts-heading" title="Accounts">
      {ROLE_CARDS.map(({ role, label }) => (
        <MetricCard key={role} label={label} definition="Can sign in now" metric={users.activeByRole[role]} />
      ))}
      <MetricCard
        label={`Inactive: ${inactive.count} · Must change password: ${mustChangePassword.count}`}
        name={`Inactive: ${inactive.count}, must change password: ${mustChangePassword.count}. View list`}
        definition="Accounts that need an Administrator"
        metric={inactive}
      />
    </MetricGroup>
  )
}

/** IT Staff Dashboard (ui-spec §5): what is unowned, what is mine, what is urgent. */
export default function StaffDashboard() {
  const role = useCurrentUser()!.role
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  const fetchDashboard = useCallback(() => {
    setLoad({ state: 'loading' })
    apiFetch<StaffDashboardData>('/staff/dashboard')
      .then((data) => {
        // An unexpected body is a failure to show, not a screen to crash (as the Queue does, ui-spec §7.5).
        if (!Array.isArray(data?.recentlyUpdated) || !data.metrics) throw new Error('Unexpected dashboard response')
        setLoad({ state: 'loaded', data })
      })
      .catch((error) => setLoad({ state: error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error' }))
  }, [])

  useEffect(fetchDashboard, [fetchDashboard])

  if (load.state === 'forbidden') return <ForbiddenState role={role} />
  const data = load.state === 'loaded' ? load.data : null

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="mb-1">Dashboard</h1>
          <p className="zen-muted mb-0">Service desk overview{data && ` · ${updatedAt(data.generatedAt)}`}</p>
        </div>
        <Link to="/staff/tickets" className="btn btn-primary zen-dashboard-action">
          Open queue
        </Link>
      </div>

      {load.state === 'error' && (
        <Callout variant="error" onRetry={fetchDashboard}>
          We could not load the dashboard.
        </Callout>
      )}
      {load.state === 'loading' && <DashboardSkeleton cards={6} lists={3} />}

      {data && (
        <>
          <MetricGroup id="staff-cards" title="At a glance" hidden>
            {CARDS.map(({ key, label, definition, emphasis }) => (
              <MetricCard key={key} label={label} definition={definition} metric={data.metrics[key]} emphasis={emphasis} />
            ))}
          </MetricGroup>

          {/* Mobile reads top to bottom: my actions, then what changed, then the breakdowns (ui-spec §5.3). */}
          <div className="row g-3 mb-4">
            <div className="col-12 order-1 order-lg-4">
              <DashboardActionList items={data.myRecentActions} />
            </div>
            <div className="col-lg-4 order-2 order-lg-3">
              <DashboardTicketList
                id="staff-recently-updated"
                title="Recently updated"
                items={data.recentlyUpdated}
                empty="No tickets have been updated yet."
                footer={{ to: '/staff/tickets?sortBy=updatedAt&sortOrder=desc', label: 'View queue' }}
                detailPath={(id) => `/staff/tickets/${id}`}
              />
            </div>
            <div className="col-md-6 col-lg-4 order-3 order-lg-1">
              <MetricBreakdown id="by-status" title="By status" keys={TICKET_STATUSES} metrics={data.byStatus} badge={(status) => <StatusBadge value={status} />} />
            </div>
            <div className="col-md-6 col-lg-4 order-4 order-lg-2">
              <MetricBreakdown
                id="by-priority"
                title="Active by IT priority"
                keys={SEVERITY}
                metrics={data.byItPriority}
                badge={(priority) => <PriorityBadge kind="it" value={priority} />}
              />
            </div>
          </div>

          {data.administration && <Accounts users={data.administration.users} />}
        </>
      )}
    </>
  )
}
