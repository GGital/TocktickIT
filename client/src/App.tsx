import { useState } from 'react'

type Check = 'idle' | 'loading' | 'online' | 'offline'

type Category = {
  id: number
  name: string
}

export default function App() {
  const [check, setCheck] = useState<Check>('idle')
  const [categories, setCategories] = useState<Category[]>([])

  async function checkSystem() {
    setCheck('loading')
    try {
      const [healthRes, categoriesRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/categories'),
      ])
      if (!healthRes.ok || !categoriesRes.ok) throw new Error('TokTickIT API is not healthy')

      const health = await healthRes.json()
      if (health.status !== 'ok') throw new Error('TokTickIT API reported a problem')

      setCategories(await categoriesRes.json())
      setCheck('online')
    } catch {
      setCategories([])
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

      {check === 'online' && (
        <>
          <p className="mt-4 text-success">System Status: Online</p>

          <h2 className="h5 mt-4">Supported Request Categories</h2>
          <ol className="list-group list-group-numbered mt-2">
            {categories.map((category) => (
              <li key={category.id} className="list-group-item">
                {category.name}
              </li>
            ))}
          </ol>
        </>
      )}

      {check === 'offline' && (
        <div className="alert alert-danger mt-4" role="alert">
          <p className="mb-0">System Status: Offline</p>
          <p className="mb-0">Unable to connect to TokTickIT API</p>
        </div>
      )}
    </main>
  )
}
