import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), '../..')
const schemaSource = fs.readFileSync(path.join(root, 'packages/db/prisma/schema.prisma'), 'utf8')
const apiIndexSource = fs.readFileSync(path.join(root, 'apps/api/src/index.ts'), 'utf8')
const personalKeysSource = fs.readFileSync(path.join(root, 'apps/web/components/personal-api-keys-panel.tsx'), 'utf8')
const apiClientSource = fs.readFileSync(path.join(root, 'apps/web/lib/api.ts'), 'utf8')

test('Enterprise key policy stores explicit scopes and optional expiry for API and MCP keys', () => {
  assert.match(schemaSource, /model AccountApiKey \{[\s\S]*scopes\s+String\[\]\s+@default\(\["read", "write"\]\)[\s\S]*expiresAt\s+DateTime\?/) 
  assert.match(schemaSource, /model AccountMcpKey \{[\s\S]*scopes\s+String\[\]\s+@default\(\["read", "write", "mcp"\]\)[\s\S]*expiresAt\s+DateTime\?/) 
  assert.match(schemaSource, /@@index\(\[expiresAt\]\)/)
})

test('API enforces key expiry and write scopes without leaking key material into audit metadata', () => {
  assert.match(apiIndexSource, /function parseOptionalExpiry\(/)
  assert.match(apiIndexSource, /function keyIsExpired\(/)
  assert.match(apiIndexSource, /API_KEY_EXPIRED/)
  assert.match(apiIndexSource, /MCP_KEY_EXPIRED/)
  assert.match(apiIndexSource, /KEY_SCOPE_DENIED/)
  assert.match(apiIndexSource, /metadata: \{ prefix: created\.prefix, scopes, expiresAt:/)
  assert.doesNotMatch(apiIndexSource, /metadata: \{[^}]*token/)
})

test('personal key UI exposes expiry and scope controls for API and hosted MCP keys', () => {
  assert.match(personalKeysSource, /const \[apiKeyExpiresAt, setApiKeyExpiresAt\]/)
  assert.match(personalKeysSource, /const \[mcpKeyExpiresAt, setMcpKeyExpiresAt\]/)
  assert.match(personalKeysSource, /\['read', 'write', 'admin'\]\.map/)
  assert.match(personalKeysSource, /\['read', 'write', 'mcp'\]\.map/)
  assert.match(personalKeysSource, /createApiKey\(\{ label: apiKeyLabel\.trim\(\), scopes: apiKeyScopes, expiresAt:/)
  assert.match(personalKeysSource, /createMcpKey\(\{ label: mcpKeyLabel\.trim\(\), workspaceId: mcpWorkspaceId \|\| null, scopes: mcpKeyScopes, expiresAt:/)
})

test('web API client carries key policy fields', () => {
  assert.match(apiClientSource, /scopes: string\[\]; expiresAt: string \| null/)
  assert.match(apiClientSource, /createApiKey\(payload: \{ label: string; scopes\?: string\[\]; expiresAt\?: string \| null \}/)
  assert.match(apiClientSource, /createMcpKey\(payload: \{ label: string; workspaceId\?: string \| null; scopes\?: string\[\]; expiresAt\?: string \| null \}/)
})
