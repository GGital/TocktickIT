import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyPassword } from '../../src/password.js'

// Test fixture, not a secret: the local-development initial password documented in README.md (BR-56).
const LOCAL_DEV_PASSWORD = 'TokTick-Local-Dev-1'

const LAB3_MIGRATIONS = ['rename_requester_user_to_user', 'add_session_and_ticket_workflow', 'add_ticket_message']
const TICKET_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_REQUESTER',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
]

const prisma = new PrismaClient()

// The real CLI, not an import: migrate deploy and db seed are the documented commands under test.
const prismaCli = (args: string[], options: { url?: string; input?: string } = {}) =>
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    input: options.input,
    stdio: 'pipe',
    env: { ...process.env, ...(options.url ? { DATABASE_URL: options.url } : {}) },
  })

const databaseUrl = (name: string) => {
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

// DROP DATABASE refuses to run inside a multi-statement script, so each statement is its own call.
const recreateDatabase = (name: string) => {
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], {
    input: `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  })
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], { input: `CREATE DATABASE "${name}"` })
}

const dropDatabase = (name: string) =>
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], {
    input: `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  })

/** Exits non-zero when the database differs from schema.prisma, so a hand-written migration cannot drift. */
const assertNoDrift = (url: string) =>
  prismaCli(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'])

const migrationDirectories = () =>
  readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

describe('Lab 3 migrations (BR-55, BR-56)', () => {
  const emptyDb = 'toktickit_lab3_migrate_empty'
  const lab2Db = 'toktickit_lab3_migrate_lab2'
  let lab2Client: PrismaClient
  let lab2Only: string

  beforeAll(() => {
    recreateDatabase(emptyDb)
    recreateDatabase(lab2Db)
    lab2Client = new PrismaClient({ datasourceUrl: databaseUrl(lab2Db) })
  }, 60_000)

  afterAll(async () => {
    await lab2Client.$disconnect()
    if (lab2Only) rmSync(lab2Only, { recursive: true, force: true })
    dropDatabase(emptyDb)
    dropDatabase(lab2Db)
  }, 60_000)

  it('ships the three Lab 3 migrations last, in the documented order', () => {
    const lab3 = migrationDirectories().slice(-3)
    expect(lab3.map((name) => name.replace(/^\d+_/, ''))).toEqual(LAB3_MIGRATIONS)
  })

  it('applies to an empty database and matches schema.prisma exactly', () => {
    prismaCli(['migrate', 'deploy'], { url: databaseUrl(emptyDb) })
    assertNoDrift(databaseUrl(emptyDb))
  }, 120_000)

  describe('against a database holding Lab 2 data', () => {
    beforeAll(async () => {
      // Stage the Lab 2 state with the Lab 2 migrations alone, exactly as a Lab 2 deployment has it.
      lab2Only = mkdtempSync(path.join(tmpdir(), 'toktickit-lab2-'))
      cpSync('prisma/schema.prisma', path.join(lab2Only, 'schema.prisma'))
      for (const name of migrationDirectories().filter((dir) => !LAB3_MIGRATIONS.some((m) => dir.endsWith(m)))) {
        cpSync(path.join('prisma/migrations', name), path.join(lab2Only, 'migrations', name), { recursive: true })
      }
      cpSync('prisma/migrations/migration_lock.toml', path.join(lab2Only, 'migrations', 'migration_lock.toml'))
      prismaCli(['migrate', 'deploy', '--schema', path.join(lab2Only, 'schema.prisma')], { url: databaseUrl(lab2Db) })

      // Deliberately non-sequential ids, so any renumbering is visible.
      prismaCli(['db', 'execute', '--url', databaseUrl(lab2Db), '--stdin'], {
        input: `
          INSERT INTO "Category" ("id", "name") VALUES (3, 'Hardware'), (8, 'Network');
          INSERT INTO "RelatedSystem" ("id", "name") VALUES (4, 'VPN');
          INSERT INTO "RequesterUser" ("id", "fullName", "email", "department", "isActive", "updatedAt") VALUES
            (7, 'Lab Two Active', 'active@lab2.test', 'Registrar Office', true, now()),
            (9, 'Lab Two Inactive', 'inactive@lab2.test', 'Library Services', false, now());
          INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary",
                                "description", "requestedPriority", "updatedAt") VALUES
            (41, 'TKT-2026-000041', 7, 3, 4, 'VPN drops', 'It drops.', 'HIGH', now()),
            (42, 'TKT-2026-000042', 9, 8, 4, 'Cable loose', 'It is loose.', 'LOW', now());
          INSERT INTO "Attachment" ("id", "ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes",
                                    "uploadedById", "removedAt", "removalReason", "removedById") VALUES
            (5, 41, 'log.pdf', 'stored-log.pdf', 'application/pdf', 10, 7, NULL, NULL, NULL),
            (6, 41, 'wrong.png', 'stored-wrong.png', 'image/png', 20, 7, now(), 'Wrong file', 7);
        `,
      })

      prismaCli(['migrate', 'deploy'], { url: databaseUrl(lab2Db) })
    }, 120_000)

    it('matches schema.prisma exactly after the upgrade', () => {
      assertNoDrift(databaseUrl(lab2Db))
    }, 60_000)

    it('API-33 keeps every Ticket, Attachment, Category, and Related System with its id and requester link', async () => {
      expect(await lab2Client.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })).toEqual([
        { id: 3, name: 'Hardware' },
        { id: 8, name: 'Network' },
      ])
      expect(await lab2Client.relatedSystem.findMany({ select: { id: true, name: true } })).toEqual([
        { id: 4, name: 'VPN' },
      ])
      expect(
        await lab2Client.ticket.findMany({
          select: { id: true, ticketNumber: true, requesterId: true, categoryId: true, relatedSystemId: true },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([
        { id: 41, ticketNumber: 'TKT-2026-000041', requesterId: 7, categoryId: 3, relatedSystemId: 4 },
        { id: 42, ticketNumber: 'TKT-2026-000042', requesterId: 9, categoryId: 8, relatedSystemId: 4 },
      ])
      expect(
        await lab2Client.attachment.findMany({
          select: { id: true, ticketId: true, uploadedById: true, removedById: true, removalReason: true },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([
        { id: 5, ticketId: 41, uploadedById: 7, removedById: null, removalReason: null },
        { id: 6, ticketId: 41, uploadedById: 7, removedById: 7, removalReason: 'Wrong file' },
      ])
    })

    it('API-34 turns each Lab 2 Requester into a REQUESTER who must change the documented initial password', async () => {
      const users = await lab2Client.user.findMany({ orderBy: { id: 'asc' } })

      expect(users.map(({ id, email, department, isActive, role, mustChangePassword }) => ({
        id, email, department, isActive, role, mustChangePassword,
      }))).toEqual([
        { id: 7, email: 'active@lab2.test', department: 'Registrar Office', isActive: true, role: 'REQUESTER', mustChangePassword: true },
        { id: 9, email: 'inactive@lab2.test', department: 'Library Services', isActive: false, role: 'REQUESTER', mustChangePassword: true },
      ])
      for (const user of users) {
        expect(user.passwordHash).toMatch(/^scrypt\$/)
        expect(await verifyPassword(LOCAL_DEV_PASSWORD, user.passwordHash)).toBe(true)
      }
    })

    it('API-35 initialises IT Priority from Requested Priority and leaves status and owner untouched', async () => {
      expect(
        await lab2Client.ticket.findMany({
          select: { id: true, requestedPriority: true, itPriority: true, status: true, assigneeId: true, requesterResolvedFlaggedAt: true },
          orderBy: { id: 'asc' },
        }),
      ).toEqual([
        { id: 41, requestedPriority: 'HIGH', itPriority: 'HIGH', status: 'NEW', assigneeId: null, requesterResolvedFlaggedAt: null },
        { id: 42, requestedPriority: 'LOW', itPriority: 'LOW', status: 'NEW', assigneeId: null, requesterResolvedFlaggedAt: null },
      ])
    })
  })
})

describe('API-42 idempotent seed (BR-56, DoD)', () => {
  const runSeed = () => execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], { stdio: 'pipe' })

  const snapshot = async () => ({
    categories: await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
    relatedSystems: await prisma.relatedSystem.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
    users: await prisma.user.findMany({
      select: { id: true, email: true, role: true, isActive: true, mustChangePassword: true },
      orderBy: { id: 'asc' },
    }),
    tickets: await prisma.ticket.findMany({
      select: { id: true, ticketNumber: true, requesterId: true, status: true, itPriority: true, assigneeId: true },
      orderBy: { id: 'asc' },
    }),
    messages: await prisma.ticketMessage.findMany({
      select: { id: true, ticketId: true, authorId: true, visibility: true, isSystem: true },
      orderBy: { id: 'asc' },
    }),
  })

  const seededUsers = () => prisma.user.findMany({ where: { email: { endsWith: '@toktickit.dev' } } })
  const count = (users: { role: string; isActive: boolean }[], role: string, isActive: boolean) =>
    users.filter((user) => user.role === role && user.isActive === isActive).length

  afterAll(() => prisma.$disconnect())

  it('seeds the documented role mix, each account usable with the documented local password', async () => {
    runSeed()
    const users = await seededUsers()

    expect(count(users, 'REQUESTER', true)).toBeGreaterThanOrEqual(4)
    expect(count(users, 'REQUESTER', false)).toBeGreaterThanOrEqual(1)
    expect(count(users, 'IT_STAFF', true)).toBeGreaterThanOrEqual(3)
    expect(count(users, 'IT_STAFF', false)).toBeGreaterThanOrEqual(1)
    expect(count(users, 'ADMINISTRATOR', true)).toBeGreaterThanOrEqual(1)

    // E2E sign-in accounts skip the change; one active Requester keeps it for the first-login path (A-19).
    for (const role of ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']) {
      expect(users.some((user) => user.role === role && user.isActive && !user.mustChangePassword)).toBe(true)
    }
    expect(users.some((user) => user.role === 'REQUESTER' && user.isActive && user.mustChangePassword)).toBe(true)

    const readme = readFileSync('../README.md', 'utf8')
    for (const user of users) {
      expect(user.email).toBe(user.email.trim().toLowerCase())
      expect(readme, `README documents ${user.email}`).toContain(user.email)
      expect(await verifyPassword(LOCAL_DEV_PASSWORD, user.passwordHash)).toBe(true)
    }
    expect(readme).toContain(LOCAL_DEV_PASSWORD)
  }, 120_000)

  it('seeds Tickets across all eight statuses, every IT Priority, both ownership states, a flag, and both message kinds', async () => {
    const tickets = await prisma.ticket.findMany({
      where: { requester: { email: { endsWith: '@toktickit.dev' } } },
      include: { assignee: true, messages: true },
    })

    expect(new Set(tickets.map((ticket) => ticket.status))).toEqual(new Set(TICKET_STATUSES))
    expect(new Set(tickets.map((ticket) => ticket.itPriority))).toEqual(new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']))
    expect(tickets.some((ticket) => ticket.assigneeId === null)).toBe(true)
    expect(tickets.some((ticket) => ticket.assigneeId !== null)).toBe(true)
    expect(tickets.some((ticket) => ticket.requesterResolvedFlaggedAt !== null)).toBe(true)

    for (const ticket of tickets) {
      // Seed data obeys the rules the API will enforce: owners are active staff (BR-27), work has an owner (BR-30).
      if (ticket.assignee) {
        expect(['IT_STAFF', 'ADMINISTRATOR']).toContain(ticket.assignee.role)
        expect(ticket.assignee.isActive).toBe(true)
      }
      if (!['NEW', 'CANCELLED'].includes(ticket.status)) expect(ticket.assignee).not.toBeNull()
      if (ticket.status === 'NEW') expect(ticket.assignee).toBeNull()
    }

    const messages = tickets.flatMap((ticket) => ticket.messages)
    expect(messages.some((message) => message.visibility === 'PUBLIC' && !message.isSystem)).toBe(true)
    expect(messages.some((message) => message.visibility === 'INTERNAL')).toBe(true)
    // The flagged Ticket carries its system-authored Public Comment (BR-46).
    const flagged = tickets.find((ticket) => ticket.requesterResolvedFlaggedAt !== null)!
    expect(flagged.messages.some((message) => message.isSystem && message.visibility === 'PUBLIC')).toBe(true)
  })

  it('creates no duplicates and no id churn when run a second time', async () => {
    const before = await snapshot()
    runSeed()
    const after = await snapshot()

    expect(after).toEqual(before)
  }, 120_000)
})
