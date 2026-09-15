// Route placeholders for screens owned by a later issue. They exist so the routes and
// the redirects that point at them are real and navigable now.
function Placeholder({ title }: { title: string }) {
  return (
    <div className="zen-card">
      <h1>{title}</h1>
      <p className="zen-muted">This screen is not implemented yet.</p>
    </div>
  )
}

export const NotFoundScreen = () => <Placeholder title="Page not found" />

// The unauthenticated redirect target (FR-05); the Login form itself arrives with its own issue.
export const LoginScreen = () => (
  <main id="main" className="container py-5">
    <Placeholder title="Sign in" />
  </main>
)
