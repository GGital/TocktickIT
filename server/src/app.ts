import express, { type ErrorRequestHandler } from 'express'
import {
  changePassword,
  currentUser,
  login,
  logout,
  requireAuth,
  requirePasswordChangeComplete,
  requireRole,
  resolveSession,
} from './auth.js'
import { sendError } from './errors.js'
import { prisma } from './prisma.js'
import {
  downloadAttachment,
  listAttachments,
  removeAttachment,
  uploadAttachment,
} from './attachments.js'
import {
  flagAppearsResolved,
  listComments,
  listInternalNotes,
  postComment,
  postInternalNote,
} from './messages.js'
import {
  getStaffTicket,
  listAssignees,
  listQueue,
  updateAssignment,
  updatePriority,
  updateStatus,
} from './staffTickets.js'
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

// Login is the only route reachable without a session (api-spec §3.1).
app.post('/api/auth/login', login)

// --- The protected stack (api-spec §1.4). Mounted on prefixes, never per route, so every route registered
// below — including ones added later — inherits authentication, the password-change gate, and its role guard
// (BR-16, A-16). ---
app.use('/api', resolveSession, requireAuth, requirePasswordChangeComplete)
app.use('/api/staff', requireRole('IT_STAFF', 'ADMINISTRATOR'))
app.use('/api/admin', requireRole('ADMINISTRATOR'))

app.post('/api/auth/logout', logout)
app.get('/api/auth/me', currentUser)
app.post('/api/auth/change-password', changePassword)

// --- Reference data: any authenticated role (api-spec §3.5). ---

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

// --- Requester-scoped routes: any authenticated role, always scoped to the caller's own Tickets (BR-21).
// Handlers take identity from req.user alone; a requesterId in a body, query, or header is never read (BR-18). ---
// Creating a Ticket and flagging it resolved are Requester operations (matrix, BR-46).
app.post('/api/tickets', requireRole('REQUESTER'), createTicket)
app.post('/api/tickets/:id/appears-resolved', requireRole('REQUESTER'), flagAppearsResolved)
app.get('/api/tickets', listTickets)
app.get('/api/tickets/:id', getTicket)

// Public Comments: the owning Requester, IT Staff, and Administrators (api-spec §3.6, §3.7). Append-only — no
// edit or delete route exists for any message (BR-42).
app.get('/api/tickets/:id/comments', listComments)
app.post('/api/tickets/:id/comments', postComment)

// --- Staff routes: the /api/staff role guard above has already refused a Requester (BR-23, A-16). ---
app.get('/api/staff/tickets', listQueue)
app.get('/api/staff/tickets/:id', getStaffTicket)
app.patch('/api/staff/tickets/:id/assignment', updateAssignment)
app.patch('/api/staff/tickets/:id/priority', updatePriority)
app.patch('/api/staff/tickets/:id/status', updateStatus)
app.get('/api/staff/assignees', listAssignees)
app.get('/api/staff/tickets/:id/internal-notes', listInternalNotes)
app.post('/api/staff/tickets/:id/internal-notes', postInternalNote)

app.post('/api/tickets/:id/attachments', uploadAttachment)
app.get('/api/tickets/:id/attachments', listAttachments)
app.get('/api/attachments/:id/download', downloadAttachment)
app.delete('/api/attachments/:id', removeAttachment)

// Express 5 forwards rejected promises here, so handlers need no try/catch.
const handleUnexpectedError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Malformed JSON is the client's error, and the parser's error object carries the raw body — which can be a
  // password — so it is answered 400 and never logged (BR-12, BR-65).
  if (error?.type === 'entity.parse.failed') {
    return sendError(res, 'VALIDATION_FAILED', 'The request body is not valid JSON.')
  }
  console.error('Unhandled API error', error)
  sendError(res, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
}

app.use(handleUnexpectedError)

export default app
