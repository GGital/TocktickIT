// Route placeholders for screens owned by a later issue. They exist so the routes, the role
// navigation, and the role guard that point at them are real and navigable now.
function Placeholder({ title }: { title: string }) {
  return (
    <div className="zen-card">
      <h1>{title}</h1>
      <p className="zen-muted">This screen is not implemented yet.</p>
    </div>
  )
}

export const NotFoundScreen = () => <Placeholder title="Page not found" />
export const UserManagementScreen = () => <Placeholder title="User Management" />
