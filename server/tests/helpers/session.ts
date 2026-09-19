import { randomBytes } from 'node:crypto'
import { prisma } from '../../src/prisma.js'

/**
 * Test-only sign-in: writes a Session row directly and returns the matching Cookie header value.
 * Suites that test *authorization* use it so they do not also depend on passwords; the login flow
 * itself is proven by tests/lab-03/auth.api.test.ts.
 */
const cookies = new Map<number, string>()
const created: string[] = []

export async function signIn(userId: number) {
  const id = randomBytes(32).toString('base64url')
  await prisma.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } })
  created.push(id)
  cookies.set(userId, `toktickit.sid=${id}`)
  return cookies.get(userId)!
}

/** The cookie from the last signIn(userId) in this test file. */
export function asUser(userId: number) {
  const cookie = cookies.get(userId)
  if (!cookie) throw new Error(`signIn(${userId}) must run before asUser(${userId})`)
  return cookie
}

/** Deletes the sessions this file created — for suites that sign in as seeded users they do not delete. */
export const signOutAll = () => prisma.session.deleteMany({ where: { id: { in: created } } })

/** Signs in as any seeded active user already past the password gate — for suites that need identity, not a role. */
export async function signInSeededUser() {
  const user = await prisma.user.findFirstOrThrow({
    where: { isActive: true, mustChangePassword: false, email: { endsWith: '@toktickit.dev' } },
  })
  return signIn(user.id)
}
