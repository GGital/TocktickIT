import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import RequireRole from './components/RequireRole'
import { AuthProvider, homeFor, useCurrentUser } from './lib/auth'
import ChangePassword from './screens/ChangePassword'
import CreateTicket from './screens/CreateTicket'
import Login from './screens/Login'
import MyTickets from './screens/MyTickets'
import StaffTicketDetail from './screens/StaffTicketDetail'
import TicketDetail from './screens/TicketDetail'
import TicketQueue from './screens/TicketQueue'
import { NotFoundScreen } from './screens/placeholders'
import UserManagement from './screens/UserManagement'

/** The root sends each role to its own home route (ui-spec §4.3). */
function HomeRedirect() {
  return <Navigate to={homeFor(useCurrentUser()!.role)} replace />
}

// Exported without a router so tests can mount the routes inside a MemoryRouter and
// drive direct-URL cases such as /tickets/:id.
export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        {/* Login and Change Password render without the shell (ui-spec §3). */}
        <Route path="/login" element={<Login />} />
        <Route
          path="/change-password"
          element={
            <AuthGuard>
              <ChangePassword />
            </AuthGuard>
          }
        />

        {/* Every application screen requires a session and sits inside the shell (FR-05). RequireRole is
            feedback for a direct URL; the API refuses the same operations itself (BR-23). */}
        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route path="/" element={<HomeRedirect />} />

          {/* Own Tickets are readable by every role (matrix); creating one is a Requester operation. */}
          <Route path="/tickets" element={<MyTickets />} />
          <Route
            path="/tickets/new"
            element={
              <RequireRole roles={['REQUESTER']}>
                <CreateTicket />
              </RequireRole>
            }
          />
          <Route path="/tickets/:id" element={<TicketDetail />} />

          <Route
            path="/staff/tickets"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <TicketQueue />
              </RequireRole>
            }
          />
          <Route
            path="/staff/tickets/:id"
            element={
              <RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']}>
                <StaffTicketDetail />
              </RequireRole>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireRole roles={['ADMINISTRATOR']}>
                <UserManagement />
              </RequireRole>
            }
          />

          <Route path="*" element={<NotFoundScreen />} />
        </Route>

        {/* Lab 1 system check, kept reachable; its reference-data call now needs a session. */}
        <Route
          path="/system-check"
          element={
            <AuthGuard>
              <App />
            </AuthGuard>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
