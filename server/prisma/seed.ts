import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Order matters: these become ids 1-4 and the API returns categories in id order.
const categories = ['Account and Access', 'Hardware', 'Software', 'Network']

async function main() {
  for (const name of categories) {
    // upsert keeps the seed re-runnable: existing rows keep their id instead of being duplicated.
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  console.log(`Seeded ${categories.length} categories`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
