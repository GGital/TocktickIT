import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Callout from '../components/Callout'
import { DashboardTicketList, type DashboardTicketItem } from '../components/DashboardList'
import EmptyState from '../components/EmptyState'
import ForbiddenState from '../components/ForbiddenState'
import MetricCard, { MetricGroup, type Metric } from '../components/MetricCard'
import { DashboardSkeleton } from '../components/Skeleton'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import { updatedAt } from '../lib/formatBangkok'

/** GET /api/dashboard/requester (api-spec §3.13). */
type RequesterDashboardData = {
  generatedAt: string
  windows: { recentDays: number }
  metrics: Record<'waitingForMe' | 'openTickets' | 'resolvedAwaitingClosure' | 'recentlyResolved', Metric>
  recentlyUpdated: DashboardTicketItem[]
  recentlyResolved: DashboardTicketItem[]
}

type Load = { state: 'loading' } | { state: 'loaded'; data: RequesterDashboardData } | { state: 'forbidden' } | { state: 'error' }

/** Requester Dashboard (ui-spec §4): what needs my attention, and what changed. */
export default function RequesterDashboard() {
  const role = useCurrentUser()!.role
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  const fetchDashboard = useCallback(() => {
    setLoad({ state: 'loading' })
    apiFetch<RequesterDashboardData>('/dashboard/requester')
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
  const { metrics } = data ?? {}
  // No Ticket at all: every count is zero and nothing has ever been updated.
  const noTickets = data !== null && data.recentlyUpdated.length === 0 && Object.values(data.metrics).every((metric) => metric.count === 0)

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 className="mb-1">Dashboard</h1>
          <p className="zen-muted mb-0">Your tickets at a glance{data && ` · ${updatedAt(data.generatedAt)}`}</p>
        </div>
        <Link to="/tickets/new" className="btn btn-primary zen-dashboard-action">
          Create ticket
        </Link>
      </div>

      {load.state === 'error' && (
        <Callout variant="error" onRetry={fetchDashboard}>
          We could not load your dashboard.
        </Callout>
      )}
      {load.state === 'loading' && <DashboardSkeleton cards={3} lists={2} />}

      {data && metrics && (
        <>
          {noTickets && (
            <div className="mb-4">
              <EmptyState
                heading="You have not raised any tickets yet."
                body="When something is not working, raise a ticket and IT will pick it up."
                action={
                  <Link to="/tickets/new" className="btn btn-primary">
                    Create ticket
                  </Link>
                }
              />
            </div>
          )}

          {/* Attention first: what IT is waiting on you for (ui-spec §4.1). */}
          <MetricGroup id="requester-cards" title="At a glance" hidden>
            <MetricCard label="Waiting for you" definition="IT needs your reply" metric={metrics.waitingForMe} emphasis />
            <MetricCard label="Open tickets" definition="Not yet resolved" metric={metrics.openTickets} />
            <MetricCard label="Resolved — please check" definition="Resolved, not closed" metric={metrics.resolvedAwaitingClosure} />
          </MetricGroup>

          <div className="row g-3">
            <div className="col-lg-6">
              <DashboardTicketList
                id="recently-updated"
                title="Recently updated"
                items={data.recentlyUpdated}
                empty="No tickets updated in the last 7 days."
                footer={{ to: '/tickets?sortBy=updatedAt&sortOrder=desc', label: 'View all' }}
                detailPath={(id) => `/tickets/${id}`}
              />
            </div>
            <div className="col-lg-6">
              <DashboardTicketList
                id="recently-resolved"
                title={`Recently resolved (${metrics.recentlyResolved.count}, last ${data.windows.recentDays} days)`}
                items={data.recentlyResolved}
                empty={`No tickets resolved in the last ${data.windows.recentDays} days.`}
                footer={{ to: metrics.recentlyResolved.href, label: 'View all' }}
                detailPath={(id) => `/tickets/${id}`}
              />
            </div>
          </div>
        </>
      )}
    </>
  )
}
