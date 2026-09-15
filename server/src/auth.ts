import { randomBytes } from 'node:crypto'
import type { CookieOptions, NextFunction, Request, Response } from 'express'
import type { User, UserRole } from '@prisma/client'
import { sendError, type FieldError } from './errors.js'
import { hashPassword, validateNewPassword, verifyPassword } from './password.js'
import { prisma } from './prisma.js'

declare global {
  namespace Express {
    interface Request {
      user?: User
      sessionId?: string
    }
  }
}

export const SESSION_COOKIE = 'toktickit.sid'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
// 32 random bytes in base64url is always 43 characters; anything else never reaches the database.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INVALID_CREDENTIALS = 'Email or password is incorrect, or the account is not active.'

// Secure is read per request so the flag follows NODE_ENV rather than whatever it was at import (BR-03).
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
})

/** The AuthenticatedUser shape (api-spec §2.1): no hash, no isActive, no session field. */
const toAuthenticatedUser = ({ id, fullName, email, role, mustChangePassword }: User) => ({
  id,
  fullName,
  email,
  role,
  mustChangePassword,
})

// A hash of nothing anyone knows: an unknown email is verified against it so it costs the same as a real one (BR-10).
const dummyHash = hashPassword(randomBytes(32).toString('base64'))

// --- Login throttle (BR-08, A-07) ---
// ponytail: in-process Map, resets on restart and is not shared between instances; move to the database or a
// shared cache if the API ever runs as more than one process (tests.md L-01).
const THROTTLE_LIMIT = 5
const THROTTLE_WINDOW_MS = 15 * 60 * 1000
const failures = new Map<string, { count: number; windowStart: number }>()

const openWindow = (key: string) => {
  const entry = failures.get(key)
  return entry && Date.now() - entry.windowStart < THROTTLE_WINDOW_MS ? entry : undefined
}

function recordFailure(key: string) {
  const entry = openWindow(key)
  if (entry) {
    entry.count += 1
    return
  }
  // Expired entries are only swept when a new window opens, so a spray of addresses cannot grow the map forever.
  for (const [staleKey, stale] of failures) {
    if (Date.now() - stale.windowStart >= THROTTLE_WINDOW_MS) failures.delete(staleKey)
  }
  failures.set(key, { count: 1, windowStart: Date.now() })
}

/** POST /api/auth/login (api-spec §3.1). */
export async function login(req: Request, res: Response) {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>
  const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  const fields: FieldError[] = []
  if (!EMAIL_PATTERN.test(normalisedEmail)) fields.push({ field: 'email', message: 'Enter a valid email address.' })
  if (typeof password !== 'string' || password.trim() === '') {
    fields.push({ field: 'password', message: 'Enter your password.' })
  }
  if (fields.length > 0) {
    return sendError(res, 'VALIDATION_FAILED', 'Enter your email address and password.', fields)
  }

  const throttleKey = `${normalisedEmail}|${req.ip}`
  if ((openWindow(throttleKey)?.count ?? 0) >= THROTTLE_LIMIT) {
    return sendError(res, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait a few minutes and try again.')
  }

  // Every failure path does the same work and returns the same body: unknown, wrong, and inactive are one case (BR-01).
  const user = await prisma.user.findUnique({ where: { email: normalisedEmail } })
  const verified = await verifyPassword(password as string, user?.passwordHash ?? (await dummyHash))

  if (!user || !verified || !user.isActive) {
    recordFailure(throttleKey)
    return sendError(res, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS)
  }

  failures.delete(throttleKey)
  const session = await prisma.session.create({
    data: {
      id: randomBytes(32).toString('base64url'),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })

  res.cookie(SESSION_COOKIE, session.id, { ...cookieOptions(), maxAge: SESSION_TTL_MS })
  res.json(toAuthenticatedUser(user))
}

// --- The protected middleware stack (api-spec §1.4), mounted on prefixes so a route added later inherits it. ---

/**
 * Attaches the session's User when the cookie names a live session of an active user (BR-04), and nothing
 * otherwise — rejecting is requireAuth's job. The role is re-read from the database on every request, never
 * trusted from the cookie. An expired row is deleted when it is encountered.
 */
export async function resolveSession(req: Request, _res: Response, next: NextFunction) {
  const id = req.headers.cookie
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)

  // Malformed ids never reach the database.
  if (!id || !SESSION_ID_PATTERN.test(id)) return next()

  const session = await prisma.session.findUnique({ where: { id }, include: { user: true } })
  if (session && session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id } })
  } else if (session?.user.isActive) {
    req.user = session.user
    req.sessionId = session.id
  }
  next()
}

/** No resolved user is 401 UNAUTHENTICATED (BR-04, AC-04). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return sendError(res, 'UNAUTHENTICATED', 'Sign in to continue.')
  next()
}

// Method and path together: the gate opens exactly these three operations and nothing that merely resembles them.
const PASSWORD_CHANGE_EXEMPT = new Set(['GET /api/auth/me', 'POST /api/auth/change-password', 'POST /api/auth/logout'])

/**
 * The mandatory-change gate (BR-15, BR-16): one middleware in front of the whole protected surface, never a
 * per-route check. It runs before any role guard, so a gated user learns nothing about their permissions.
 */
export function requirePasswordChangeComplete(req: Request, res: Response, next: NextFunction) {
  const operation = `${req.method} ${req.originalUrl.split('?')[0]}`
  if (req.user!.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.has(operation)) {
    return sendError(res, 'PASSWORD_CHANGE_REQUIRED', 'Change your password to continue.')
  }
  next()
}

/**
 * Role guard (BR-23). A forbidden *route* is 403 with one fixed message and no payload — no record, identifier,
 * or count (BR-24). A forbidden *resource* on a permitted route stays the handler's 404 (BR-19).
 */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user!.role)) {
      return sendError(res, 'FORBIDDEN', 'You do not have permission to do this.')
    }
    next()
  }

/** POST /api/auth/logout (api-spec §3.2). */
export async function logout(req: Request, res: Response) {
  // deleteMany, not delete: a concurrent logout of the same session is not an error.
  await prisma.session.deleteMany({ where: { id: req.sessionId } })
  res.clearCookie(SESSION_COOKIE, cookieOptions())
  res.status(204).end()
}

/** GET /api/auth/me (api-spec §3.3). */
export function currentUser(req: Request, res: Response) {
  res.json(toAuthenticatedUser(req.user!))
}

/** POST /api/auth/change-password (api-spec §3.4). */
export async function changePassword(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const fail = (fields: FieldError[]) =>
    sendError(res, 'VALIDATION_FAILED', 'Your password was not changed.', fields)

  // 1. Body shape.
  const missing = (['currentPassword', 'newPassword', 'confirmPassword'] as const)
    .filter((field) => typeof body[field] !== 'string' || body[field] === '')
    .map((field) => ({ field, message: 'This field is required.' }))
  if (missing.length > 0) return fail(missing)

  const { currentPassword, newPassword, confirmPassword } = body as Record<string, string>
  const user = req.user!

  // 2. New-password rules and confirmation, before the expensive and more sensitive current-password check.
  const rules: FieldError[] = []
  const ruleMessage = validateNewPassword(newPassword, { currentPassword, email: user.email })
  if (ruleMessage) rules.push({ field: 'newPassword', message: ruleMessage })
  if (confirmPassword !== newPassword) rules.push({ field: 'confirmPassword', message: 'The two passwords do not match.' })
  if (rules.length > 0) return fail(rules)

  // 3. Current password last; 400 not 401, because the session itself is valid.
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return fail([{ field: 'currentPassword', message: 'Your current password is incorrect.' }])
  }

  // The calling session survives; every other session for this user is revoked (BR-06, BR-14).
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    }),
    prisma.session.deleteMany({ where: { userId: user.id, id: { not: req.sessionId } } }),
  ])

  res.json(toAuthenticatedUser(updated))
}
