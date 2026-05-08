import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFeature } from './edition.js'

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
  assert.match(apiIndexSource, /url\.startsWith\('\/edition'\)/)
  assert.match(apiIndexSource, /availableFeatures/)
})

test('API has a reusable Enterprise feature guard with structured upgrade response', () => {
  assert.match(editionSource, /function requireFeature\(/)
  assert.match(editionSource, /reply\.code\(402\)/)
  assert.match(editionSource, /Enterprise feature/)
  assert.match(editionSource, /upgradeUrl/)
})

test('Enterprise feature guard blocks audit log in Community and allows it in Enterprise', async () => {
  const previousEdition = process.env.SALLY_EDITION
  const handler = requireFeature('security.auditLog')
  try {
    const communityReply = {
      statusCode: 200,
      payload: null as unknown,
      code(value: number) { this.statusCode = value; return this },
      send(value: unknown) { this.payload = value; return value },
    }
    delete process.env.SALLY_EDITION
    await handler({} as never, communityReply as never)
    assert.equal(communityReply.statusCode, 402)
    assert.deepEqual(communityReply.payload, {
      ok: false,
      error: 'Enterprise feature',
      feature: 'security.auditLog',
      upgradeUrl: 'https://usesally.app/enterprise',
    })

    const enterpriseReply = {
      statusCode: 200,
      payload: null as unknown,
      code(value: number) { this.statusCode = value; return this },
      send(value: unknown) { this.payload = value; return value },
    }
    process.env.SALLY_EDITION = 'enterprise'
    await handler({} as never, enterpriseReply as never)
    assert.equal(enterpriseReply.statusCode, 200)
    assert.equal(enterpriseReply.payload, null)
  } finally {
    if (previousEdition === undefined) delete process.env.SALLY_EDITION
    else process.env.SALLY_EDITION = previousEdition
  }
})
