import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL')

export const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) })
