import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const editionSource = fs.existsSync(path.join(__dirname, 'edition.ts')) ? fs.readFileSync(path.join(__dirname, 'edition.ts'), 'utf8') : ''
const typesSource = fs.existsSync(path.join(__dirname, '../../../packages/types/src/edition.ts')) ? fs.readFileSync(path.join(__dirname, '../../../packages/types/src/edition.ts'), 'utf8') : ''

test('Sally editions are centralized as Community and Enterprise only for now', () => {
  assert.match(typesSource, /export type SallyEdition = 'COMMUNITY' \| 'ENTERPRISE'/)
  assert.match(typesSource, /export type FeatureKey =/) 
  assert.match(typesSource, /security\.saml/)
  assert.match(typesSource, /security\.auditLog/)
  assert.match(typesSource, /automation\.multipleAgents/)
})

test('API resolves edition from env and exposes available features', () => {
  assert.match(editionSource, /process\.env\.SALLY_EDITION/)
  assert.match(editionSource, /function getSallyEdition\(/)
  assert.match(editionSource, /function hasFeature\(/)
  assert.match(apiIndexSource, /app\.get\('\/edition'/)
  assert.match(apiIndexSource, /availableFeatures/)
})

test('API has a reusable Enterprise feature guard with structured upgrade response', () => {
  assert.match(editionSource, /function requireFeature\(/)
  assert.match(editionSource, /reply\.code\(402\)/)
  assert.match(editionSource, /Enterprise feature/)
  assert.match(editionSource, /upgradeUrl/)
})
