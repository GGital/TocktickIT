import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import AppShell from './components/AppShell'
import RequesterGuard from './components/RequesterGuard'
import CreateTicket from './screens/CreateTicket'
import SelectRequester from './screens/SelectRequester'
import {
  MyTicketsScreen,
  NotFoundScreen,
  TicketDetailScreen,
} from './screens/placeholders'

// Routes from specification.md A-11. Exported without a router so tests can mount
// them inside a MemoryRouter and drive direct-URL cases such as /tickets/:id.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/select-requester" element={<SelectRequester />} />

      {/* Every requester-scoped screen sits behind the guard and inside the shell (FR-05). */}
      <Route
        element={
          <RequesterGuard>
            <AppShell />
          </RequesterGuard>
        }
      >
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<MyTicketsScreen />} />
        <Route path="/tickets/new" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<TicketDetailScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>

      {/* Lab 1 system check, kept reachable so its screen and tests stay valid. */}
      <Route path="/system-check" element={<App />} />
    </Routes>
  )
}
