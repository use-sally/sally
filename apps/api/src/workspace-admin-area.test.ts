import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const schemaSource = fs.readFileSync(path.join(process.cwd(), '../../packages/db/prisma/schema.prisma'), 'utf8')

test('workspace model supports soft archival', () => {
  assert.match(schemaSource, /model Workspace \{[\s\S]*archivedAt\s+DateTime\?/) 
  assert.match(schemaSource, /@@index\(\[archivedAt\]\)/)
})

test('workspace admin API lists archived state and supports archive restore and delete', () => {
  assert.match(apiIndexSource, /app\.get\('\/workspaces'[\s\S]*archivedAt: workspace\.archivedAt\?\.toISOString\(\) \?\? null/)
  assert.match(apiIndexSource, /app\.post\('\/workspaces\/:workspaceId\/archive'[\s\S]*isPlatformAdmin\(request\)[\s\S]*archivedAt: archived \? new Date\(\) : null/)
  assert.match(apiIndexSource, /app\.delete\('\/workspaces\/:workspaceId'[\s\S]*isPlatformAdmin\(request\)[\s\S]*prisma\.workspace\.delete/)
})
