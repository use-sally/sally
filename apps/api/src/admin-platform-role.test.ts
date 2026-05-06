import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const schemaSource = fs.readFileSync(path.join(__dirname, '../../../packages/db/prisma/schema.prisma'), 'utf8')
const migrationSource = fs.readFileSync(path.join(__dirname, '../../../packages/db/prisma/migrations/20260506190000_add_admin_platform_role/migration.sql'), 'utf8')

test('platform roles include editable ADMIN below SUPERADMIN', () => {
  assert.match(schemaSource, /enum PlatformRole \{[\s\S]*NONE[\s\S]*ADMIN[\s\S]*SUPERADMIN[\s\S]*\}/)
  assert.match(migrationSource, /ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'ADMIN'/)
})

test('ADMIN gets superadmin-like workspace and project permissions', () => {
  assert.match(apiIndexSource, /function isPlatformAdmin\(request: any\) \{[\s\S]*PlatformRole\.SUPERADMIN \|\| account\?\.platformRole === PlatformRole\.ADMIN[\s\S]*\}/)
  assert.match(apiIndexSource, /async function requireWorkspaceRole[\s\S]*if \(isPlatformAdmin\(request\)\) return true/)
  assert.match(apiIndexSource, /async function requireWorkspaceRoleForWorkspaceId[\s\S]*if \(isPlatformAdmin\(request\)\) return true/)
  assert.match(apiIndexSource, /async function requireProjectRole[\s\S]*if \(isPlatformAdmin\(request\)\) return true/)
  assert.match(apiIndexSource, /const workspaces = isPlatformAdmin\(request\)[\s\S]*prisma\.workspace\.findMany/)
})

test('only the configured superadmin can promote or demote platform admins, never themselves', () => {
  assert.match(apiIndexSource, /app\.patch\('\/accounts\/:accountId\/platform-role'[\s\S]*if \(!isSuperadmin\(request\)\)/)
  assert.match(apiIndexSource, /normalizePlatformRole\(body\.platformRole\)/)
  assert.match(apiIndexSource, /if \(accountId === requestAccountId\)[\s\S]*cannot change your own platform role/)
  assert.match(apiIndexSource, /if \(isConfiguredSuperadminEmail\(target\.email\) && role !== PlatformRole\.SUPERADMIN\)/)
  assert.match(apiIndexSource, /prisma\.account\.update\(\{ where: \{ id: accountId \}, data: \{ platformRole: role \} \}\)/)
})

test('ADMIN accounts can request and complete password reset through email token flow', () => {
  assert.match(apiIndexSource, /app\.post\('\/auth\/request-password-reset'[\s\S]*const account = await prisma\.account\.findFirst\(\{ where: \{ email \} \}\)[\s\S]*sendPasswordResetEmail/)
  assert.match(apiIndexSource, /app\.post\('\/auth\/reset-password'[\s\S]*prisma\.account\.update\(\{ where: \{ id: reset\.accountId \}, data: \{ passwordHash/)
  assert.doesNotMatch(apiIndexSource, /platformRole[^\n]+SUPERADMIN[^\n]+request-password-reset/)
})
