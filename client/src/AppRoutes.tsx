import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import { AuthProvider } from './lib/auth'
import CreateTicket from './screens/CreateTicket'
import MyTickets from './screens/MyTickets'
import TicketDetail from './screens/TicketDetail'
import { LoginScreen, NotFoundScreen } from './screens/placeholders'

// Exported without a router so tests can mount the routes inside a MemoryRouter and
// drive direct-URL cases such as /tickets/:id.
export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />

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
