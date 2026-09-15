import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import { AuthProvider } from './lib/auth'
import ChangePassword from './screens/ChangePassword'
import CreateTicket from './screens/CreateTicket'
import Login from './screens/Login'
import MyTickets from './screens/MyTickets'
import TicketDetail from './screens/TicketDetail'
import { NotFoundScreen } from './screens/placeholders'

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

        {/* Every application screen requires a session and sits inside the shell (FR-05). */}
        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/tickets/new" element={<CreateTicket />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
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
