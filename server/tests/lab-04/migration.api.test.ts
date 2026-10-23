import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '../../src/app.js'
import { prisma as appPrisma } from '../../src/prisma.js'
import { asUser, signIn } from '../helpers/session.js'

const LAB4_MIGRATION = '20261020100000_add_actions_taken_and_workflow_fields'
const LAB4_DIR = path.join('prisma/migrations', LAB4_MIGRATION)
const LAB3_FIXTURE = 'tests/lab-04/fixtures/lab3-snapshot.sql'
const ACTIVE_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED']
const DAY_MS = 24 * 60 * 60 * 1000

// The real CLI, not an import: migrate deploy, db execute, and migrate resolve are the documented commands.
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

const dropDatabase = (name: string) =>
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], {
    input: `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  })

// DROP DATABASE refuses to run inside a multi-statement script, so each statement is its own call.
const recreateDatabase = (name: string) => {
  dropDatabase(name)
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], { input: `CREATE DATABASE "${name}"` })
}

const executeFile = (name: string, file: string) => prismaCli(['db', 'execute', '--url', databaseUrl(name), '--file', file])

const migrationDirectories = () =>
  readdirSync('prisma/migrations', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

/** A schema directory holding every migration before Lab 4 — exactly what a Lab 3 deployment has. */
const stageLab3Migrations = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'toktickit-lab3-'))
  cpSync('prisma/schema.prisma', path.join(dir, 'schema.prisma'))
  for (const name of migrationDirectories().filter((name) => name < LAB4_MIGRATION)) {
    cpSync(path.join('prisma/migrations', name), path.join(dir, 'migrations', name), { recursive: true })
  }
  cpSync('prisma/migrations/migration_lock.toml', path.join(dir, 'migrations', 'migration_lock.toml'))
  return dir
}

/** Exits non-zero when the two databases differ (tables, columns, indexes, foreign keys). */
const assertSameSchema = (from: string, to: string) =>
  prismaCli(['migrate', 'diff', '--from-url', databaseUrl(from), '--to-url', databaseUrl(to), '--exit-code'])

const assertNoDrift = (name: string) =>
  prismaCli(['migrate', 'diff', '--from-url', databaseUrl(name), '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'])

const columnNames = async (client: PrismaClient, table: string) =>
  (
    await client.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}
    `
  ).map((row) => row.column_name)

/** Ids of every Lab 3 table, read with raw SQL so the same query works before and after the migration. */
const lab3Ids = async (client: PrismaClient) => ({
  users: await client.$queryRaw`SELECT "id", "email", "role" FROM "User" ORDER BY "id"`,
  sessions: await client.$queryRaw`SELECT "id", "userId" FROM "Session" ORDER BY "id"`,
  tickets: await client.$queryRaw`
    SELECT "id", "ticketNumber", "requesterId", "assigneeId", "status", "itPriority", "createdAt", "updatedAt"
    FROM "Ticket" ORDER BY "id"`,
  attachments: await client.$queryRaw`SELECT "id", "ticketId", "uploadedById", "removedById" FROM "Attachment" ORDER BY "id"`,
  messages: await client.$queryRaw`SELECT "id", "ticketId", "authorId", "visibility" FROM "TicketMessage" ORDER BY "id"`,
})

describe('Lab 4 migration (BR-73 – BR-76, AC-41)', () => {
  const emptyDb = 'toktickit_lab4_migrate_empty'
  const lab3Db = 'toktickit_lab4_migrate_lab3'
  const lab3RefDb = 'toktickit_lab4_lab3_reference'
  let lab3Client: PrismaClient
  let lab3Only: string
  let before: Awaited<ReturnType<typeof lab3Ids>>

  beforeAll(async () => {
    recreateDatabase(emptyDb)
    recreateDatabase(lab3Db)
    recreateDatabase(lab3RefDb)

    // Stage the Lab 3 state with the Lab 3 migrations alone, then load Lab 3 data into it.
    lab3Only = stageLab3Migrations()
    for (const name of [lab3Db, lab3RefDb]) {
      prismaCli(['migrate', 'deploy', '--schema', path.join(lab3Only, 'schema.prisma')], { url: databaseUrl(name) })
    }
    executeFile(lab3Db, LAB3_FIXTURE)

    lab3Client = new PrismaClient({ datasourceUrl: databaseUrl(lab3Db) })
    before = await lab3Ids(lab3Client)

    prismaCli(['migrate', 'deploy'], { url: databaseUrl(lab3Db) })
  }, 180_000)

  afterAll(async () => {
    await lab3Client?.$disconnect()
    if (lab3Only) rmSync(lab3Only, { recursive: true, force: true })
    dropDatabase(emptyDb)
    dropDatabase(lab3Db)
    dropDatabase(lab3RefDb)
  }, 60_000)

  it('ships one additive migration last, with a reviewed down.sql beside it', () => {
    expect(migrationDirectories().at(-1)).toBe(LAB4_MIGRATION)
    expect(existsSync(path.join(LAB4_DIR, 'down.sql'))).toBe(true)

    // Additive only (BR-73): nothing existing is dropped or renamed.
    const up = readFileSync(path.join(LAB4_DIR, 'migration.sql'), 'utf8')
    expect(up).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX|TYPE)\b/i)
    expect(up).not.toMatch(/\bRENAME\b/i)
  })

  it('applies to an empty database and matches schema.prisma exactly', () => {
    prismaCli(['migrate', 'deploy'], { url: databaseUrl(emptyDb) })
    assertNoDrift(emptyDb)
  }, 120_000)

  it('matches schema.prisma exactly after upgrading a Lab 3 database', () => {
    assertNoDrift(lab3Db)
  }, 60_000)

  it('API-69 keeps every User, Session, Ticket, Attachment, and TicketMessage with its id (AC-41, BR-73)', async () => {
    expect((before.tickets as unknown[]).length).toBe(5)
    expect(await lab3Ids(lab3Client)).toEqual(before)
  })

  it('API-70 backfills version, resolvedAt, and publicActivityAt as documented (BR-74)', async () => {
    const tickets = await lab3Client.ticket.findMany({
      select: { id: true, version: true, resolvedAt: true, publicActivityAt: true },
      orderBy: { id: 'asc' },
    })

    expect(tickets).toEqual([
      // No public activity: createdAt.
      { id: 51, version: 1, resolvedAt: null, publicActivityAt: new Date('2026-09-01T00:00:00Z') },
      // Public Comment 09-05; the 09-10 Internal Note is ignored.
      { id: 52, version: 1, resolvedAt: null, publicActivityAt: new Date('2026-09-05T00:00:00Z') },
      // RESOLVED: resolvedAt = updatedAt; attachment removal 09-08 beats the 09-07 comment and 09-06 upload.
      { id: 53, version: 1, resolvedAt: new Date('2026-09-20T00:00:00Z'), publicActivityAt: new Date('2026-09-08T00:00:00Z') },
      // CLOSED: resolvedAt = updatedAt; attachment upload 09-09.
      { id: 54, version: 1, resolvedAt: new Date('2026-09-25T00:00:00Z'), publicActivityAt: new Date('2026-09-09T00:00:00Z') },
      { id: 55, version: 1, resolvedAt: null, publicActivityAt: new Date('2026-09-05T00:00:00Z') },
    ])
    // Legacy Tickets have zero Actions Taken (BR-75).
    expect(await lab3Client.actionTaken.count()).toBe(0)
  })

  it('makes publicActivityAt NOT NULL with a now() default once backfilled', async () => {
    const [column] = await lab3Client.$queryRaw<{ is_nullable: string; column_default: string | null }[]>`
      SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'Ticket' AND column_name = 'publicActivityAt'
    `
    expect(column.is_nullable).toBe('NO')
    expect(column.column_default).toMatch(/CURRENT_TIMESTAMP|now\(\)/i)
  })

  it('API-72 down.sql restores the exact Lab 3 schema, and the migration re-applies with data intact (BR-76)', async () => {
    executeFile(lab3Db, path.join(LAB4_DIR, 'down.sql'))

    assertSameSchema(lab3Db, lab3RefDb)
    expect(await columnNames(lab3Client, 'ActionTaken')).toEqual([])
    expect(await lab3Ids(lab3Client)).toEqual(before)
    // down.sql also forgets the migration, so the history matches Lab 3 too. `migrate resolve --rolled-back`
    // cannot do this: Prisma refuses it for a migration that succeeded (P3012).
    expect(
      await lab3Client.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ${LAB4_MIGRATION}`,
    ).toEqual([])

    prismaCli(['migrate', 'deploy'], { url: databaseUrl(lab3Db) })

    assertNoDrift(lab3Db)
    expect(await lab3Ids(lab3Client)).toEqual(before)
    expect(
      (await lab3Client.ticket.findMany({ select: { resolvedAt: true }, orderBy: { id: 'asc' } })).map((t) => t.resolvedAt),
    ).toEqual([null, null, new Date('2026-09-20T00:00:00Z'), new Date('2026-09-25T00:00:00Z'), null])
  }, 180_000)

  it('README documents the pg_dump backup and the down.sql recovery', () => {
    const readme = readFileSync('../README.md', 'utf8')
    expect(readme).toContain('pg_dump')
    expect(readme).toContain(`${LAB4_MIGRATION}/down.sql`)
    expect(readme).toMatch(/pg_restore|psql .*< /)
  })
})

describe('API-71 legacy Tickets after the migration (BR-75)', () => {
  const DOMAIN = '@lab4-legacy-api.toktickit.test'
  const RUN = Date.now().toString(36).toUpperCase()
  let staffId: number
  let closedId: number
  let activeId: number

  beforeAll(async () => {
    const [requester, staff] = await Promise.all(
      (['REQUESTER', 'IT_STAFF'] as const).map((role) =>
        appPrisma.user.create({
          data: { email: `${role.toLowerCase()}${DOMAIN}`, fullName: `Legacy ${role}`, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
        }),
      ),
    )
    staffId = staff.id
    await signIn(staffId)
    const categoryId = (await appPrisma.category.findFirstOrThrow()).id
    const relatedSystemId = (await appPrisma.relatedSystem.findFirstOrThrow()).id
    // Shaped exactly as the migration leaves a Lab 3 Ticket: version 1, zero actions.
    const legacy = (key: string, status: 'CLOSED' | 'OPEN') =>
      appPrisma.ticket.create({
        data: {
          ticketNumber: `TKT-TEST-LEGACY-${RUN}-${key}`,
          requesterId: requester.id,
          categoryId,
          relatedSystemId,
          summary: `Legacy ${status} Ticket`,
          description: 'Created before Lab 4.',
          requestedPriority: 'LOW',
          itPriority: 'LOW',
          status,
          assigneeId: staffId,
          resolvedAt: status === 'CLOSED' ? new Date() : null,
        },
      })
    closedId = (await legacy('C', 'CLOSED')).id
    activeId = (await legacy('A', 'OPEN')).id
  })

  afterAll(async () => {
    await appPrisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
    await appPrisma.session.deleteMany({ where: { user: { email: { endsWith: DOMAIN } } } })
    await appPrisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it('keeps a legacy CLOSED Ticket with zero actions readable', async () => {
    const res = await request(app).get(`/api/staff/tickets/${closedId}`).set('Cookie', asUser(staffId))

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('CLOSED')
  })

  // ponytail: enabled by #82, which adds the resolution gate to PATCH …/status.
  it.skip('refuses to resolve a legacy active Ticket until an action is recorded', async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${activeId}/status`)
      .set('Cookie', asUser(staffId))
      .send({ status: 'RESOLVED', expectedVersion: 1 })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('RESOLUTION_BLOCKED')
    expect(res.body.error.blockers).toEqual(['NO_ACTIONS'])
  })
})

// A fresh database, so the checks see exactly what the seed wrote and not rows other suites left behind.
describe('Lab 4 seed (BR-77, AC-42, spec §7.6)', () => {
  const seedDb = 'toktickit_lab4_seed'
  let prisma: PrismaClient

  const runSeed = () =>
    execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl(seedDb) },
    })

  beforeAll(() => {
    recreateDatabase(seedDb)
    prismaCli(['migrate', 'deploy'], { url: databaseUrl(seedDb) })
    prisma = new PrismaClient({ datasourceUrl: databaseUrl(seedDb) })
  }, 120_000)

  afterAll(async () => {
    await prisma?.$disconnect()
    dropDatabase(seedDb)
  }, 60_000)

  const snapshot = async () => ({
    users: await prisma.user.findMany({ select: { id: true, email: true }, orderBy: { id: 'asc' } }),
    tickets: await prisma.ticket.findMany({ select: { id: true, ticketNumber: true }, orderBy: { id: 'asc' } }),
    actions: await prisma.actionTaken.findMany({
      select: { id: true, ticketId: true, clientRequestId: true, performedById: true, actionAt: true, createdAt: true },
      orderBy: { id: 'asc' },
    }),
  })

  const seededTickets = () => prisma.ticket.findMany({ include: { actions: true } })

  const outstanding = (action: { followUpRequired: boolean; followUpCompletedAt: Date | null; voidedAt: Date | null }) =>
    action.followUpRequired && action.followUpCompletedAt === null && action.voidedAt === null

  const passesGate = (ticket: Awaited<ReturnType<typeof seededTickets>>[number]) =>
    ticket.assigneeId !== null && ticket.actions.some((a) => a.voidedAt === null) && !ticket.actions.some(outstanding)

  it('API-73 run twice changes no Action, Ticket, or User count or id (AC-42, BR-77)', async () => {
    runSeed()
    const first = await snapshot()
    runSeed()

    expect(await snapshot()).toEqual(first)
  }, 120_000)

  it('API-74 seeds Tickets with zero, one, and four or more actions, and a non-owner performer', async () => {
    const tickets = await seededTickets()
    const counts = tickets.map((ticket) => ticket.actions.length)

    expect(counts).toContain(0)
    expect(counts).toContain(1)
    expect(counts.some((count) => count >= 4)).toBe(true)
    expect(tickets.some((ticket) => ticket.actions.some((a) => a.performedById !== ticket.assigneeId))).toBe(true)
  })

  it('API-74 seeds an outstanding, a completed, and a voided action, plus ready and blocked active Tickets', async () => {
    const tickets = await seededTickets()
    const actions = tickets.flatMap((ticket) => ticket.actions)

    expect(actions.some(outstanding)).toBe(true)
    expect(actions.some((a) => a.followUpCompletedAt !== null && a.followUpCompletedById !== null)).toBe(true)
    expect(actions.some((a) => a.voidedAt !== null && a.voidedById !== null && a.voidReason)).toBe(true)

    const active = tickets.filter((ticket) => ACTIVE_STATUSES.includes(ticket.status) && ticket.assigneeId !== null)
    expect(active.some(passesGate)).toBe(true)
    expect(active.some((ticket) => ticket.actions.some(outstanding))).toBe(true)
  })

  it('API-74 seed data obeys the rules the API enforces', async () => {
    const now = Date.now()
    for (const ticket of await seededTickets()) {
      // Every resolution the seed shows was earned through the gate (BR-35); resolvedAt follows BR-38.
      if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
        expect(passesGate(ticket), ticket.summary).toBe(true)
        expect(ticket.resolvedAt, ticket.summary).not.toBeNull()
      } else {
        expect(ticket.resolvedAt, ticket.summary).toBeNull()
      }
      expect(ticket.publicActivityAt.getTime()).toBeGreaterThanOrEqual(ticket.createdAt.getTime())
      for (const action of ticket.actions) {
        // BR-06: not before the Ticket, not in the future.
        expect(action.actionAt.getTime()).toBeGreaterThanOrEqual(ticket.createdAt.getTime())
        expect(action.actionAt.getTime()).toBeLessThanOrEqual(now)
      }
    }
  })

  it('API-74 seeds resolutions inside and outside the 7-day window and a Ticket created today in Bangkok', async () => {
    const tickets = await seededTickets()
    const now = Date.now()
    const resolved = tickets.filter((ticket) => ['RESOLVED', 'CLOSED'].includes(ticket.status))

    expect(resolved.some((ticket) => ticket.resolvedAt!.getTime() >= now - 7 * DAY_MS)).toBe(true)
    expect(resolved.some((ticket) => ticket.resolvedAt!.getTime() < now - 7 * DAY_MS)).toBe(true)

    // Bangkok is UTC+07:00 with no daylight saving (BR-49).
    const bangkokToday = new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const todayStart = new Date(`${bangkokToday}T00:00:00+07:00`).getTime()
    expect(tickets.some((ticket) => ticket.createdAt.getTime() >= todayStart)).toBe(true)
  })

  it('API-74 seeds the all-zero accounts for the empty dashboard states', async () => {
    const empty = await prisma.user.findUniqueOrThrow({
      where: { email: 'empty.requester@toktickit.dev' },
      include: { tickets: true },
    })
    const quiet = await prisma.user.findUniqueOrThrow({
      where: { email: 'quiet.it@toktickit.dev' },
      include: { assignedTickets: true, performedActions: true },
    })

    expect(empty).toMatchObject({ role: 'REQUESTER', isActive: true, mustChangePassword: false, tickets: [] })
    expect(quiet).toMatchObject({
      role: 'IT_STAFF',
      isActive: true,
      mustChangePassword: false,
      assignedTickets: [],
      performedActions: [],
    })
  })
})
