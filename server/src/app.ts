import express from 'express'
import { PrismaClient } from '@prisma/client'

const app = express()
const prisma = new PrismaClient()

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TokTickIT API' })
})

app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    res.json(categories)
  } catch (error) {
    // A database outage must surface as a clean 500 so the UI can show its error state.
    console.error('Failed to load categories', error)
    res.status(500).json({ error: 'Unable to load categories' })
  }
})

export default app
