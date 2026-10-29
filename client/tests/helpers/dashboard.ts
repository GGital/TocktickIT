/** Dashboard API fixtures (api-spec §3.13, §3.14) for the Lab 4 dashboard, shell, and style suites. */

export const ACTIVE_QUERY = 'status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED'
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED']
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

const metric = (count: number, href: string) => ({ count, href })

export const staffItem = {
  id: 41,
  ticketNumber: 'TKT-2026-000041',
  summary: 'VPN disconnects every few minutes',
  status: 'IN_PROGRESS',
  itPriority: 'URGENT',
  at: '2026-10-20T03:55:00.000Z',
}

export const recentAction = {
  id: 214,
  ticketId: 41,
  ticketNumber: 'TKT-2026-000041',
  actionAt: '2026-10-19T03:15:00.000Z',
  description: 'Replaced the VPN client profile and cleared cached…',
  followUpOutstanding: true,
  createdAt: '2026-10-19T03:20:41.000Z',
}

/** The staff dashboard; `zero` gives the all-zero account (AC-31). */
export function staffDashboard({ zero = false, admin = false } = {}) {
  const n = (count: number) => (zero ? 0 : count)
  return {
    generatedAt: '2026-10-20T04:00:00.000Z',
    timeZone: 'Asia/Bangkok',
    windows: { todayStartsAt: '2026-10-19T17:00:00.000Z' },
    metrics: {
      unassigned: metric(n(3), `/staff/tickets?assignee=unassigned&${ACTIVE_QUERY}`),
      myOpen: metric(n(5), `/staff/tickets?assignee=me&${ACTIVE_QUERY}`),
      urgentActive: metric(n(2), `/staff/tickets?itPriority=URGENT&${ACTIVE_QUERY}`),
      requesterFlagged: metric(n(1), `/staff/tickets?flaggedResolved=true&${ACTIVE_QUERY}`),
      myOutstandingFollowUps: metric(n(1), '/staff/tickets?followUp=mine'),
      newToday: metric(n(4), '/staff/tickets?sortBy=createdAt&sortOrder=desc'),
    },
    byStatus: Object.fromEntries(STATUSES.map((status, i) => [status, metric(n(i + 1), `/staff/tickets?status=${status}`)])),
    byItPriority: Object.fromEntries(PRIORITIES.map((p, i) => [p, metric(n(i + 2), `/staff/tickets?itPriority=${p}&${ACTIVE_QUERY}`)])),
    recentlyUpdated: zero ? [] : [staffItem],
    myRecentActions: zero ? [] : [recentAction],
    ...(admin
      ? {
          administration: {
            users: {
              activeByRole: {
                REQUESTER: metric(5, '/admin/users?role=REQUESTER'),
                IT_STAFF: metric(4, '/admin/users?role=IT_STAFF'),
                ADMINISTRATOR: metric(1, '/admin/users?role=ADMINISTRATOR'),
              },
              inactive: metric(2, '/admin/users'),
              mustChangePassword: metric(4, '/admin/users'),
            },
          },
        }
      : {}),
  }
}

const requesterItem = (id: number, status: string, at: string) => ({
  id,
  ticketNumber: `TKT-2026-0000${id}`,
  summary: `Requester ticket ${id}`,
  status,
  at,
})

/** The Requester dashboard; `zero` is an account with no Tickets at all. */
export function requesterDashboard({ zero = false, resolved = true } = {}) {
  const n = (count: number) => (zero ? 0 : count)
  return {
    generatedAt: '2026-10-20T04:00:00.000Z',
    timeZone: 'Asia/Bangkok',
    windows: { recentDays: 7 },
    metrics: {
      waitingForMe: metric(n(1), '/tickets?status=WAITING_FOR_REQUESTER'),
      openTickets: metric(n(3), `/tickets?${ACTIVE_QUERY}`),
      resolvedAwaitingClosure: metric(n(1), '/tickets?status=RESOLVED'),
      recentlyResolved: metric(zero || !resolved ? 0 : 2, '/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc'),
    },
    recentlyUpdated: zero ? [] : [requesterItem(41, 'WAITING_FOR_REQUESTER', '2026-10-20T02:00:00.000Z')],
    recentlyResolved: zero || !resolved ? [] : [requesterItem(38, 'RESOLVED', '2026-10-19T09:02:00.000Z'), requesterItem(36, 'CLOSED', '2026-10-15T09:02:00.000Z')],
  }
}
