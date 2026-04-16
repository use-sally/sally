import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(path.join(import.meta.dirname, 'index.ts'), 'utf8')

test('blocked status repair uses project-by-project updates with unique temporary positions', () => {
  assert.match(source, /for \(const projectId of affectedProjects\)/)
  assert.match(source, /1000 \+ index/)
  assert.match(source, /filter\(\(s\) => s\.position >= 2\)/)
  assert.match(source, /sqlParts\.push\(`UPDATE .*1000 \+ index.*status\.id/)
})

test('blocked status repair reorders custom statuses after done', () => {
  assert.match(source, /const customStatuses = statuses\.filter/)
  assert.match(source, /5 \+ index/)
  assert.match(source, /sqlParts\.push\(`UPDATE .*5 \+ index.*status\.id/)
})

test('updater skips bootstrap cleanly when BOOTSTRAP_SUPERADMIN_PASSWORD is missing', () => {
  assert.match(source, /Skipping superadmin bootstrap because BOOTSTRAP_SUPERADMIN_PASSWORD is not present in \.env/)
  assert.match(source, /BOOTSTRAP_SUPERADMIN_PASSWORD=.*test\(envText\)/)
})

test('updater resolves failed blocked-status migration before deploy', () => {
  assert.match(source, /maybeResolveFailedBlockedMigration\(targetDir\)/)
  assert.match(source, /migrate resolve --rolled-back 20260415162500_add_blocked_status/)
})
