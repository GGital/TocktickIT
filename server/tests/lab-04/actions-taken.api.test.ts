import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/prisma.js'

const DOMAIN = '@actions-taken-api.toktickit.test'
const RUN = Date.now().toString(36).toUpperCase()

let ticketId: number
let staffId: number
let counter = 0

beforeAll(async () => {
  const [requester, staff] = await Promise.all(
    (['REQUESTER', 'IT_STAFF'] as const).map((role) =>
      prisma.user.create({
        data: { email: `${role.toLowerCase()}${DOMAIN}`, fullName: `Actions ${role}`, role, passwordHash: 'unusable-fixture', mustChangePassword: false },
      }),
    ),
  )
  staffId = staff.id
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-ACT-${RUN}`,
      requesterId: requester.id,
      categoryId: (await prisma.category.findFirstOrThrow()).id,
      relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow()).id,
      summary: 'Actions Taken constraint fixture',
      description: 'Holds rows inserted by direct SQL.',
      requestedPriority: 'LOW',
      itPriority: 'LOW',
      status: 'IN_PROGRESS',
      assigneeId: staff.id,
    },
  })
  ticketId = ticket.id
})

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requester: { email: { endsWith: DOMAIN } } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  await prisma.$disconnect()
})

describe('API-24 ActionTaken CHECK constraints reject invalid rows inserted by direct SQL (spec §7.1)', () => {
  type Row = {
    followUpRequired: boolean
    followUpNote?: string | null
    followUpCompletedAt?: Date | null
    voidedAt?: Date | null
    voidedById?: number | null
    voidReason?: string | null
  }

  // Bypasses Prisma's typed client on purpose: the constraint must hold for any code path.
  const insert = (row: Row) => {
    counter += 1
    return prisma.$executeRaw`
      INSERT INTO "ActionTaken" ("ticketId", "clientRequestId", "actionAt", "description", "result",
        "followUpRequired", "followUpNote", "followUpCompletedAt", "performedById",
        "voidedAt", "voidedById", "voidReason", "updatedAt")
      VALUES (${ticketId}, gen_random_uuid(), now(), ${`Direct SQL row ${counter}`}, 'Result',
        ${row.followUpRequired}, ${row.followUpNote ?? null}, ${row.followUpCompletedAt ?? null}, ${staffId},
        ${row.voidedAt ?? null}, ${row.voidedById === undefined ? null : row.voidedById}, ${row.voidReason ?? null}, now())
    `
  }

  const rejected = (row: Row, constraint: string) =>
    expect(insert(row)).rejects.toThrow(new RegExp(`violates check constraint \\\\?"${constraint}\\\\?"`))

  it('accepts valid rows: no follow-up, an outstanding one, a completed one, and a voided action', async () => {
    const now = new Date()
    await expect(insert({ followUpRequired: false })).resolves.toBe(1)
    await expect(insert({ followUpRequired: true, followUpNote: 'Check tomorrow' })).resolves.toBe(1)
    await expect(insert({ followUpRequired: true, followUpNote: 'Checked', followUpCompletedAt: now })).resolves.toBe(1)
    await expect(insert({ followUpRequired: false, voidedAt: now, voidedById: staffId, voidReason: 'Wrong ticket' })).resolves.toBe(1)
  })

  it('rejects a follow-up note without a required follow-up, and a required follow-up without a note (BR-10)', async () => {
    await rejected({ followUpRequired: false, followUpNote: 'Orphan note' }, 'ActionTaken_followUp_pairing_check')
    await rejected({ followUpRequired: true, followUpNote: null }, 'ActionTaken_followUp_pairing_check')
  })

  it('rejects a completed follow-up that was never required (BR-16)', async () => {
    await rejected({ followUpRequired: false, followUpCompletedAt: new Date() }, 'ActionTaken_followUp_completion_check')
  })

  it('rejects partially voided rows: voidedAt, voidedById, and voidReason are all-or-nothing (BR-20)', async () => {
    const now = new Date()
    await rejected({ followUpRequired: false, voidedAt: now }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidedAt: now, voidedById: staffId }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidedById: staffId, voidReason: 'No time' }, 'ActionTaken_void_fields_check')
    await rejected({ followUpRequired: false, voidReason: 'Reason only' }, 'ActionTaken_void_fields_check')
  })
})
