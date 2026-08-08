import { useState } from 'react'

type Check = 'idle' | 'loading' | 'online' | 'offline'

export default function App() {
  const [check, setCheck] = useState<Check>('idle')

  async function checkSystem() {
    setCheck('loading')
    try {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error(`Health check failed with ${res.status}`)
      const health = await res.json()
      setCheck(health.status === 'ok' ? 'online' : 'offline')
    } catch {
      setCheck('offline')
    }
  }

  return (
    <main className="container py-5">
      <h1 className="mb-4">TokTickIT IT Service Desk</h1>

      <button
        type="button"
        className="btn btn-primary"
        onClick={checkSystem}
        disabled={check === 'loading'}
      >
        Check System
      </button>

      {check === 'loading' && (
        <p className="mt-4" role="status">
          ⏳ Loading...
        </p>
      )}

      {check === 'online' && <p className="mt-4 text-success">System Status: Online</p>}

      {check === 'offline' && (
        <div className="alert alert-danger mt-4" role="alert">
          <p className="mb-0">System Status: Offline</p>
          <p className="mb-0">Unable to connect to TokTickIT API</p>
        </div>
      )}
    </main>
  )
}
