import { loadEnvFile } from 'node:process'
import { defineConfig } from 'prisma/config'

try {
  loadEnvFile('.env')
} catch {
  // Production normally provides DATABASE_URL through the environment.
}

const databaseUrl = process.env.DATABASE_URL || 'postgresql://sally:sally@localhost:5432/sally'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prisma 7 resolves datasource URLs while loading config, including during
    // `prisma generate`. CI generation does not need a live database, so use a
    // non-secret local placeholder when DATABASE_URL is intentionally absent.
    url: databaseUrl,
  },
})
