import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

const prisma = new PrismaClient()

// The seed is the real subject here, so run the documented command rather than importing main().
const runSeed = () =>
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], { stdio: 'pipe' })

const snapshot = async () => ({
  categories: await prisma.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
  relatedSystems: await prisma.relatedSystem.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
  requesters: await prisma.requesterUser.findMany({
    select: { id: true, email: true, isActive: true },
    orderBy: { id: 'asc' },
  }),
})

afterAll(() => prisma.$disconnect())

describe('API-04 idempotent seed (BR-46, BR-47)', () => {
  it('seeds the required reference data and requesters', async () => {
    runSeed()
    const after = await snapshot()

    expect(after.categories.map((category) => category.name)).toEqual([
      'Account and Access',
      'Hardware',
      'Software',
      'Network',
    ])
    expect(after.relatedSystems.length).toBeGreaterThanOrEqual(7)
    expect(after.requesters.filter((requester) => requester.isActive).length).toBeGreaterThanOrEqual(4)
    expect(after.requesters.filter((requester) => !requester.isActive).length).toBeGreaterThanOrEqual(1)
  }, 60_000)

  it('creates no duplicates and no id churn when run a second time', async () => {
    const before = await snapshot()
    runSeed()
    const after = await snapshot()

    expect(after).toEqual(before)
  }, 60_000)
})
