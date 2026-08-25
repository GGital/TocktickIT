import { PrismaClient } from '@prisma/client'

// One client for the whole process: routes and the requester-context middleware share it.
export const prisma = new PrismaClient()
