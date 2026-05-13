import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appShellSource = fs.readFileSync(path.join(root, 'components/app-shell.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'lib/api.ts'), 'utf8')
const auditLogPageSource = fs.existsSync(path.join(root, 'app/audit-log/page.tsx')) ? fs.readFileSync(path.join(root, 'app/audit-log/page.tsx'), 'utf8') : ''

test('Admin mode includes Audit Log as a first-class governance section', () => {
  assert.match(appShellSource, /\{ href: '\/audit-log', label: 'Audit Log' \}/)
  assert.match(appShellSource, /pathname\.startsWith\('\/audit-log'\)/)
})

test('web API client exposes audit log listing helper', () => {
  assert.match(apiSource, /export function getAuditLog\(filters\?: \{ action\?: string; targetType\?: string; limit\?: number \}\)/)
  assert.match(apiSource, /getJson<AuditLogEvent\[\]>\(`\/audit-log/)
})

test('Audit Log page lists events with actor action target and timestamp', () => {
  assert.match(auditLogPageSource, /getAuditLog/)
  assert.match(auditLogPageSource, /getEdition/)
  assert.match(auditLogPageSource, /hasFeature\(info, 'security\.auditLog'\)/)
  assert.match(auditLogPageSource, /EnterpriseLockedCard/)
  assert.match(auditLogPageSource, /Audit Log/)
  assert.match(auditLogPageSource, /event\.actor\?\.email/)
  assert.match(auditLogPageSource, /event\.action/)
  assert.match(auditLogPageSource, /event\.targetType/)
  assert.match(auditLogPageSource, /event\.createdAt/)
})
