import type { Request, Response } from 'express'
import { Prisma, type UserRole } from '@prisma/client'
import { sendError } from './errors.js'
import { hashPassword, validateNewPassword } from './password.js'
import { prisma } from './prisma.js'
import { parseId } from './tickets.js'
import { QueryParameterError, readEnum, readSingle } from './ticketQuery.js'
import { ROLES, readUserFields, type UserFields } from './userInput.js'

/** UserSummary (api-spec §2.2). `passwordHash` is never selected, so it cannot leak into a response (BR-12). */
const userSummary = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const

// ponytail: one advisory lock serialises every user update, so two requests can never both see a second active
// Administrator (BR-52). Admin edits are rare; move to row locks on active Administrators if that ever changes.
const USER_SAFETY_LOCK = 4_805_205

const invalidId = (res: Response) => sendError(res, 'INVALID_PATH_PARAMETER', 'The user id must be a positive integer.')
const userNotFound = (res: Response) => sendError(res, 'USER_NOT_FOUND', 'User not found.')
const emailTaken = (res: Response) =>
  sendError(res, 'EMAIL_ALREADY_EXISTS', 'Another account already uses this email address.', [
    { field: 'email', message: 'Another account already uses this email address.' },
  ])

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/** `GET /api/admin/users` — search over name and email, one optional role, a plain array by name (api-spec §3.17). */
export async function listUsers(req: Request, res: Response) {
  let search: string | undefined
  let role: UserRole | undefined
  try {
    search = readSingle(req.query as Record<string, unknown>, 'search')?.trim() || undefined
    role = readEnum(req.query as Record<string, unknown>, 'role', ROLES)
  } catch (error) {
    if (error instanceof QueryParameterError) return sendError(res, 'INVALID_QUERY_PARAMETER', error.message)
    throw error
  }

  res.json(
    await prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(search
          ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: userSummary,
    }),
  )
}

/** `POST /api/admin/users` — always `mustChangePassword`; the password is echoed in this response only (BR-13, BR-47). */
export async function createUser(req: Request, res: Response) {
  const { data, errors } = readUserFields(req.body, 'create')
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The user was not created.', errors)

  const { initialPassword, ...fields } = data as Required<UserFields>
  if (await prisma.user.findUnique({ where: { email: fields.email }, select: { id: true } })) return emailTaken(res)

  try {
    const user = await prisma.user.create({
      data: { ...fields, passwordHash: await hashPassword(initialPassword), mustChangePassword: true },
      select: userSummary,
    })
    res.status(201).json({ user, initialPassword })
  } catch (error) {
    // A simultaneous create with the same address loses at the unique index rather than failing with a 500.
    if (isUniqueViolation(error)) return emailTaken(res)
    throw error
  }
}

type UpdateResult =
  | { outcome: 'updated'; user: Prisma.UserGetPayload<{ select: typeof userSummary }> }
  | { outcome: 'not-found' | 'self' | 'last-administrator' | 'email-taken' }

/**
 * The edit itself (api-spec §3.19 steps 3–6), in one transaction under the safety lock. Exported so the
 * last-Administrator rule can be exercised directly: over HTTP the caller is always another active Administrator.
 */
export async function applyUserUpdate(actorId: number, targetId: number, changes: UserFields): Promise<UpdateResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${USER_SAFETY_LOCK})`

      const target = await tx.user.findUnique({ where: { id: targetId } })
      if (!target) return { outcome: 'not-found' }

      const deactivating = target.isActive && changes.isActive === false
      const roleChanging = changes.role !== undefined && changes.role !== target.role

      // BR-51: an Administrator keeps their own access; their name and email stay editable.
      if (targetId === actorId && (deactivating || roleChanging)) return { outcome: 'self' }

      // BR-52: counted inside the lock, so a concurrent change cannot slip between the count and the write.
      if (target.role === 'ADMINISTRATOR' && target.isActive && (deactivating || roleChanging)) {
        const others = await tx.user.count({ where: { role: 'ADMINISTRATOR', isActive: true, id: { not: targetId } } })
        if (others === 0) return { outcome: 'last-administrator' }
      }

      if (changes.email && changes.email !== target.email) {
        if (await tx.user.findUnique({ where: { email: changes.email }, select: { id: true } })) return { outcome: 'email-taken' }
      }

      const user = await tx.user.update({ where: { id: targetId }, data: changes, select: userSummary })
      // BR-07: losing access, or a different role, ends every session in the same transaction.
      if (deactivating || roleChanging) await tx.session.deleteMany({ where: { userId: targetId } })
      return { outcome: 'updated', user }
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: 'email-taken' }
    throw error
  }
}

/** `PATCH /api/admin/users/:id` — only the four editable fields (BR-48); no deletion route exists (BR-53). */
export async function updateUser(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const { data, errors } = readUserFields(req.body, 'update')
  if (errors.length > 0) return sendError(res, 'VALIDATION_FAILED', 'The user was not changed.', errors)

  const result = await applyUserUpdate(req.user!.id, id, data)
  switch (result.outcome) {
    case 'updated':
      return res.json(result.user)
    case 'not-found':
      return userNotFound(res)
    case 'self':
      return sendError(res, 'SELF_DEACTIVATION_FORBIDDEN', 'You cannot deactivate your own account or change your own role.')
    case 'last-administrator':
      return sendError(res, 'LAST_ACTIVE_ADMINISTRATOR', 'At least one active Administrator must remain.')
    case 'email-taken':
      return emailTaken(res)
  }
}

/** `POST /api/admin/users/:id/initial-password` — rehash, require a change, end every session, echo once (BR-54). */
export async function setInitialPassword(req: Request, res: Response) {
  const id = parseId(req.params.id)
  if (id === null) return invalidId(res)

  const password = (req.body as Record<string, unknown> | undefined)?.initialPassword
  const fail = (message: string) =>
    sendError(res, 'VALIDATION_FAILED', 'The password was not changed.', [{ field: 'initialPassword', message }])
  if (typeof password !== 'string') return fail('Enter an initial password of at least 10 characters.')

  const target = await prisma.user.findUnique({ where: { id }, select: { email: true } })
  if (!target) return userNotFound(res)

  const rule = validateNewPassword(password, { currentPassword: '', email: target.email })
  if (rule) return fail(rule)

  const passwordHash = await hashPassword(password)
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true }, select: userSummary }),
    // Includes the caller's own session when an Administrator resets their own password — documented, not accidental.
    prisma.session.deleteMany({ where: { userId: id } }),
  ])

  res.json({ user, initialPassword: password })
}
