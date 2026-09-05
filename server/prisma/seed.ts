import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Order matters: these become ids 1-4 and the API returns categories in id order.
const categories = ['Account and Access', 'Hardware', 'Software', 'Network']

const relatedSystems = [
  'Email',
  'Campus Wi-Fi',
  'VPN',
  'LEB2 App',
  'Grade Submission App',
  'Printer',
  'Corporate Laptop',
]

// The inactive requester exists so the inactive path can be tested (BR-47).
const requesters = [
  { email: 'napat.s@toktickit.dev', fullName: 'Napat Siriwat', department: 'Faculty of Engineering', isActive: true },
  { email: 'pimchanok.t@toktickit.dev', fullName: 'Pimchanok Thanee', department: 'Registrar Office', isActive: true },
  { email: 'kittipong.w@toktickit.dev', fullName: 'Kittipong Wong', department: 'Library Services', isActive: true },
  { email: 'areeya.p@toktickit.dev', fullName: 'Areeya Pongsak', department: 'Finance Department', isActive: true },
  { email: 'former.staff@toktickit.dev', fullName: 'Somchai Retired', department: 'Faculty of Science', isActive: false },
]

async function main() {
  // upsert keeps the seed re-runnable: existing rows keep their id instead of being duplicated.
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } })
  }

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } })
  }

  for (const requester of requesters) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      // isActive is re-applied so a manually flipped row returns to its documented state.
      update: { isActive: requester.isActive },
      create: requester,
    })
  }

  console.log(
    `Seeded ${categories.length} categories, ${relatedSystems.length} related systems, ${requesters.length} requesters`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
