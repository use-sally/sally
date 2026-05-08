import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const schemaSource = fs.readFileSync(path.join(__dirname, '../../../packages/db/prisma/schema.prisma'), 'utf8')

test('team hub has account archival state for central user lifecycle management', () => {
  assert.match(schemaSource, /model Account \{[\s\S]*archivedAt\s+DateTime\?[\s\S]*\}/)
})

test('team hub list is visible to platform admins and includes every account with workspace and project memberships', () => {
  assert.match(apiIndexSource, /app\.get\('\/team\/accounts'[\s\S]*if \(!isPlatformAdmin\(request\)\)/)
  assert.match(apiIndexSource, /prisma\.account\.findMany\(\{[\s\S]*include: \{[\s\S]*memberships:[\s\S]*projectMemberships:/)
  assert.match(apiIndexSource, /workspaceMemberships:[\s\S]*projectMemberships:/)
})

test('team hub can create users and add or remove them from workspaces and projects', () => {
  assert.match(apiIndexSource, /app\.post\('\/team\/accounts'[\s\S]*if \(!isPlatformAdmin\(request\)\)/)
  assert.match(apiIndexSource, /app\.post\('\/team\/accounts\/:accountId\/workspaces'[\s\S]*prisma\.workspaceMembership\.upsert/)
  assert.match(apiIndexSource, /app\.delete\('\/team\/accounts\/:accountId\/workspaces\/:membershipId'[\s\S]*prisma\.workspaceMembership\.delete/)
  assert.match(apiIndexSource, /app\.post\('\/team\/accounts\/:accountId\/projects'[\s\S]*prisma\.projectMembership\.upsert/)
  assert.match(apiIndexSource, /app\.delete\('\/team\/accounts\/:accountId\/projects\/:membershipId'[\s\S]*prisma\.projectMembership\.delete/)
})

test('team hub can archive users without deleting the configured superadmin', () => {
  assert.match(apiIndexSource, /app\.post\('\/team\/accounts\/:accountId\/archive'[\s\S]*if \(!isPlatformAdmin\(request\)\)/)
  assert.match(apiIndexSource, /if \(isConfiguredSuperadminEmail\(target\.email\) && archived\)/)
  assert.match(apiIndexSource, /data: \{ archivedAt: archived \? new Date\(\) : null \}/)
})

test('team hub lets platform admins upload and save avatars for any team account', () => {
  assert.match(apiIndexSource, /app\.post\('\/team\/accounts\/:accountId\/avatar'[\s\S]*if \(!isPlatformAdmin\(request\)\)/)
  assert.match(apiIndexSource, /saveProfileImage\(accountId, \{ fileName: body\.fileName, mimeType: body\.mimeType, base64: body\.base64 \}\)/)
  assert.match(apiIndexSource, /prisma\.account\.update\(\{ where: \{ id: accountId \}, data: \{ avatarUrl: saved\.url \} \}\)/)
})

test('team hub hides archived workspace clutter while preserving stored memberships', () => {
  assert.match(apiIndexSource, /prisma\.workspace\.findMany\(\{ where: \{ archivedAt: null \}, orderBy: \{ name: 'asc' \} \}\)/)
  assert.match(apiIndexSource, /memberships: account\.memberships\.filter\(\(membership\) => !membership\.workspace\.archivedAt\)\.map/)
  assert.match(apiIndexSource, /projectMemberships: account\.projectMemberships\.filter\(\(membership\) => !membership\.project\.workspace\.archivedAt\)\.map/)
  assert.match(apiIndexSource, /if \(workspace\.archivedAt\) return reply\.code\(409\)\.send\(\{ ok: false, error: 'Workspace archived' \}\)/)
})
