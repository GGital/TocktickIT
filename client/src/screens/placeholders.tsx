// Route placeholders for the Lab 2 screens. Each is replaced by its own issue;
// they exist so the route skeleton and its links are real and navigable now.
function Placeholder({ title }: { title: string }) {
  return (
    <div className="zen-card">
      <h1>{title}</h1>
      <p className="zen-muted">This screen is not implemented yet.</p>
    </div>
  )
}

export const MyTicketsScreen = () => <Placeholder title="My Tickets" />
export const TicketDetailScreen = () => <Placeholder title="Ticket Detail" />
export const NotFoundScreen = () => <Placeholder title="Page not found" />
