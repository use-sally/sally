import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), '../..')
const schemaSource = fs.readFileSync(path.join(root, 'packages/db/prisma/schema.prisma'), 'utf8')
const apiIndexSource = fs.readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8')
const typesSource = fs.readFileSync(path.join(root, 'packages/types/src/index.ts'), 'utf8')

test('audit log has a durable Prisma model linked to actor workspace project task and agent records', () => {
  assert.match(schemaSource, /model AuditLogEvent \{[\s\S]*workspaceId\s+String\?[\s\S]*actorAccountId\s+String\?[\s\S]*action\s+String[\s\S]*targetType\s+String\?[\s\S]*metadata\s+Json\?/) 
  assert.match(schemaSource, /model Workspace \{[\s\S]*auditLogEvents\s+AuditLogEvent\[\]/)
  assert.match(schemaSource, /model Account \{[\s\S]*auditLogEvents\s+AuditLogEvent\[\]/)
  assert.match(schemaSource, /@@index\(\[workspaceId, createdAt\]\)/)
  assert.match(schemaSource, /@@index\(\[action, createdAt\]\)/)
})

test('API writes audit events for sensitive admin and automation actions and exposes admin listing', () => {
  assert.match(apiIndexSource, /async function writeAuditLog\(/)
  assert.match(apiIndexSource, /prisma\.auditLogEvent\.create/)
  assert.match(apiIndexSource, /app\.get\('\/audit-log', \{ preHandler: requireFeature\('security\.auditLog'(?:, [^)]*readInstalledLicense[\s\S]*?)?\) \}/)
  assert.match(apiIndexSource, /app\.get\('\/audit-log'[\s\S]*if \(!isPlatformAdmin\(request\)\)/)
  assert.match(apiIndexSource, /audit\.platformRole\.updated/)
  assert.match(apiIndexSource, /audit\.workspace\.archived/)
  assert.match(apiIndexSource, /audit\.workspace\.deleted/)
  assert.match(apiIndexSource, /audit\.agentJob\.created/)
  assert.match(apiIndexSource, /audit\.agentRun\.created/)
  assert.match(apiIndexSource, /audit\.auth\.loginSucceeded/)
  assert.match(apiIndexSource, /audit\.auth\.loginFailed/)
  assert.match(apiIndexSource, /audit\.auth\.logout/)
  assert.match(apiIndexSource, /audit\.apiKey\.created/)
  assert.match(apiIndexSource, /audit\.apiKey\.revoked/)
  assert.match(apiIndexSource, /audit\.mcpKey\.created/)
  assert.match(apiIndexSource, /audit\.mcpKey\.revoked/)
  assert.match(apiIndexSource, /audit\.license\.activated/)
  assert.match(apiIndexSource, /audit\.license\.refreshed/)
  assert.match(apiIndexSource, /audit\.license\.removed/)
})

test('audit log endpoint supports enterprise filters and CSV export', () => {
  assert.match(apiIndexSource, /actorAccountId\?: string; workspaceId\?: string; from\?: string; to\?: string; limit\?: string; export\?: string/)
  assert.match(apiIndexSource, /query\.actorAccountId\?\.trim\(\) \? \{ actorAccountId: query\.actorAccountId\.trim\(\) \}/)
  assert.match(apiIndexSource, /query\.workspaceId\?\.trim\(\) \? \{ workspaceId: query\.workspaceId\.trim\(\) \}/)
  assert.match(apiIndexSource, /query\.export === 'csv'/)
  assert.match(apiIndexSource, /Content-Disposition', 'attachment; filename="sally-audit-log\.csv"/)
})

test('shared types expose audit log event DTOs for web and external clients', () => {
  assert.match(typesSource, /export type AuditLogEvent = \{/)
  assert.match(typesSource, /action: string/)
  assert.match(typesSource, /actor: \{ id: string; email: string; name: string \| null \} \| null/)
  assert.match(typesSource, /metadata: unknown/)
})
