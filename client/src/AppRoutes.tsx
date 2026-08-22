import { Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import {
  CreateTicketScreen,
  MyTicketsScreen,
  NotFoundScreen,
  SelectRequesterScreen,
  TicketDetailScreen,
} from './screens/placeholders'

// Routes from specification.md A-11. Exported without a router so tests can mount
// them inside a MemoryRouter and drive direct-URL cases such as /tickets/:id.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tickets" replace />} />
      <Route path="/select-requester" element={<SelectRequesterScreen />} />
      <Route path="/tickets" element={<MyTicketsScreen />} />
      <Route path="/tickets/new" element={<CreateTicketScreen />} />
      <Route path="/tickets/:id" element={<TicketDetailScreen />} />
      {/* Lab 1 system check, kept reachable so its screen and tests stay valid. */}
      <Route path="/system-check" element={<App />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  )
}
