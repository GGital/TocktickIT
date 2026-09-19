import { useCallback, useEffect, useState } from 'react'
import Button from '../components/Button'
import Callout from '../components/Callout'
import EmptyState from '../components/EmptyState'
import ForbiddenState from '../components/ForbiddenState'
import RoleBadge, { AccountBadge } from '../components/RoleBadge'
import SelectField from '../components/SelectField'
import { SkeletonRows } from '../components/Skeleton'
import TextField from '../components/TextField'
import UserFormDialog, { type ManagedUser } from '../components/UserFormDialog'
import { ApiError, apiFetch } from '../lib/apiClient'
import { useCurrentUser } from '../lib/auth'
import { ROLE_LABELS, type Role } from '../lib/roles'

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({ value, label: ROLE_LABELS[value] }))

/**
 * Administrator User Management (ui-spec §9). One screen, one dialog. Search and a single role filter, no
 * pagination and no sort control (X-12), and no deletion anywhere: deactivation is the only removal (BR-53).
 */
export default function UserManagement() {
  const me = useCurrentUser()!
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<'forbidden' | 'error' | null>(null)
  const [dialog, setDialog] = useState<{ user: ManagedUser | null } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // The search reaches the API 300 ms after typing stops, like the Queue.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (query) params.set('search', query)
    if (role) params.set('role', role)
    setLoading(true)
    setFailure(null)
    apiFetch<ManagedUser[]>(`/admin/users${params.size ? `?${params}` : ''}`)
      .then(setUsers)
      .catch((error) => setFailure(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error'))
      .finally(() => setLoading(false))
  }, [query, role])

  useEffect(load, [load])

  if (failure === 'forbidden') return <ForbiddenState role={me.role} />

  const filtered = Boolean(query || role)
  const clear = () => {
    setSearch('')
    setQuery('')
    setRole('')
  }

  let body
  if (failure === 'error') {
    body = (
      <Callout variant="error" onRetry={load}>
        Unable to load users.
      </Callout>
    )
  } else if (users === null) {
    body = (
      <div className="zen-card">
        <SkeletonRows rows={4} label="Loading users…" />
      </div>
    )
  } else if (users.length === 0) {
    body = filtered ? (
      <EmptyState heading="No users match this search." body="Try another name or email, or a different role." action={<Button onClick={clear}>Clear</Button>} />
    ) : (
      <EmptyState heading="No users found." body="Create the first user to give someone access." />
    )
  } else {
    body = (
      // Refetching dims the current list in place rather than blanking it.
      <div aria-busy={loading || undefined} className={loading ? 'zen-dimmed' : undefined}>
        <div className="zen-card p-0 d-none d-md-block">
          <table className="table mb-0 zen-users">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="zen-users-name">{user.fullName}</td>
                  <td>
                    <span className="d-block text-truncate zen-users-email" title={user.email}>
                      {user.email}
                    </span>
                  </td>
                  <td className="text-nowrap">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="text-nowrap">
                    <AccountBadge isActive={user.isActive} />
                  </td>
                  <td className="text-end">
                    <Button variant="secondary" aria-label={`Edit ${user.fullName}`} onClick={() => setDialog({ user })}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="list-unstyled d-md-none mb-0" aria-label="Users">
          {users.map((user) => (
            <li key={user.id} className="zen-card mb-3">
              <p className="fw-semibold mb-1">{user.fullName}</p>
              <p className="zen-help text-truncate mt-0" title={user.email}>
                {user.email}
              </p>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <RoleBadge role={user.role} />
                <AccountBadge isActive={user.isActive} />
              </div>
              <Button variant="secondary" className="w-100" aria-label={`Edit ${user.fullName}`} onClick={() => setDialog({ user })}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <h1 className="mb-0">User Management</h1>
        <Button onClick={() => setDialog({ user: null })}>
          <span aria-hidden="true">+ </span>Create user
        </Button>
      </div>

      {announcement && (
        <div className="mb-3">
          <Callout variant="success">{announcement}</Callout>
        </div>
      )}

      <div className="row g-3 align-items-end">
        <div className="col-md-7 col-lg-5">
          <TextField id="userSearch" label="Search name or email" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="col-md-5 col-lg-3">
          <SelectField id="userRoleFilter" label="Role" placeholder="Any role" options={ROLE_OPTIONS} value={role} onChange={(event) => setRole(event.target.value as Role | '')} />
        </div>
      </div>

      {body}

      {dialog && (
        <UserFormDialog
          user={dialog.user}
          selfId={me.id}
          onSaved={(message) => {
            if (message) setAnnouncement(message)
            load()
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
