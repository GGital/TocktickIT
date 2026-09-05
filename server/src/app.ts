import express, { type ErrorRequestHandler } from 'express'
import { sendError } from './errors.js'
import { prisma } from './prisma.js'
import { requesterContext } from './requesterContext.js'
import {
  downloadAttachment,
  listAttachments,
  removeAttachment,
  uploadAttachment,
} from './attachments.js'
import { createTicket, getTicket, listTickets } from './tickets.js'

const app = express()

app.use(express.json())

// No API response may be cached: the browser must never serve one Requester's
// data to another (api-spec §1, §5).
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TokTickIT API' })
})

// --- Public reference data (api-spec §3.2 – §3.4). No requester context. ---

app.get('/api/categories', async (_req, res) => {
  // id order preserves the Lab 1 contract (A-18); active only (BR-45).
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  res.json(categories)
})

app.get('/api/related-systems', async (_req, res) => {
  // Alphabetical: this list is longer than Categories and is scanned in a dropdown.
  const relatedSystems = await prisma.relatedSystem.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  res.json(relatedSystems)
})

app.get('/api/requesters', async (_req, res) => {
  // Active only, and isActive itself is never returned (BR-09, BR-47, api-spec §2.3).
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true, department: true },
  })
  res.json(requesters)
})

// --- Requester-scoped routes (api-spec §1.1). One middleware guards the whole
// prefix, so every route added under it inherits the check (BR-15, BR-48). ---
app.use(['/api/tickets', '/api/attachments'], requesterContext)

app.post('/api/tickets', createTicket)
app.get('/api/tickets', listTickets)
app.get('/api/tickets/:id', getTicket)

app.post('/api/tickets/:id/attachments', uploadAttachment)
app.get('/api/tickets/:id/attachments', listAttachments)
app.get('/api/attachments/:id/download', downloadAttachment)
app.delete('/api/attachments/:id', removeAttachment)

// Express 5 forwards rejected promises here, so handlers need no try/catch.
const handleUnexpectedError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('Unhandled API error', error)
  sendError(res, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
}

app.use(handleUnexpectedError)

export default app
