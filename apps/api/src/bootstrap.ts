import { PrismaClient, PlatformRole, WorkspaceRole } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

function loadSimpleEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const envText = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadSimpleEnv(path.resolve(process.cwd(), '.env'))
loadSimpleEnv(path.resolve(process.cwd(), '../../packages/db/.env'))

const prisma = new PrismaClient()
const scryptAsync = promisify(crypto.scrypt)

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function main() {
  const superadminEmail = requireEnv('SUPERADMIN_EMAIL').toLowerCase()
  const superadminName = process.env.SUPERADMIN_NAME?.trim() || 'Admin'
  const bootstrapPassword = requireEnv('BOOTSTRAP_SUPERADMIN_PASSWORD')
  const workspaceName = process.env.SALLY_WORKSPACE_NAME?.trim() || 'sally_'
  const workspaceSlug = process.env.SALLY_WORKSPACE_SLUG?.trim() || 'sally'

  const workspace = await prisma.workspace.upsert({
    where: { slug: workspaceSlug },
    update: { name: workspaceName },
    create: { name: workspaceName, slug: workspaceSlug },
  })

  const existing = await prisma.account.findUnique({ where: { email: superadminEmail } })
  const passwordHash = await hashPassword(bootstrapPassword)
  const account = existing
    ? await prisma.account.update({
        where: { id: existing.id },
        data: {
          name: existing.name || superadminName,
          passwordHash: existing.passwordHash || passwordHash,
          platformRole: PlatformRole.SUPERADMIN,
        },
      })
    : await prisma.account.create({
        data: {
          email: superadminEmail,
          name: superadminName,
          passwordHash,
          platformRole: PlatformRole.SUPERADMIN,
        },
      })

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_accountId: { workspaceId: workspace.id, accountId: account.id } },
    update: { role: WorkspaceRole.OWNER },
    create: { workspaceId: workspace.id, accountId: account.id, role: WorkspaceRole.OWNER },
  })

  console.log(JSON.stringify({
    ok: true,
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    superadmin: { id: account.id, email: account.email, name: account.name },
  }, null, 2))
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect()
})
