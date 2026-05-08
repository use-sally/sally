import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { getEditionInfo, requireFeature } from './edition.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const editionSource = fs.existsSync(path.join(__dirname, 'edition.ts')) ? fs.readFileSync(path.join(__dirname, 'edition.ts'), 'utf8') : ''
const typesSource = fs.existsSync(path.join(__dirname, '../../../packages/types/src/edition.ts')) ? fs.readFileSync(path.join(__dirname, '../../../packages/types/src/edition.ts'), 'utf8') : ''

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test('Sally editions are centralized as Community and Enterprise only for now', () => {
  assert.match(typesSource, /export type SallyEdition = 'COMMUNITY' \| 'ENTERPRISE'/)
  assert.match(typesSource, /export type FeatureKey =/) 
  assert.match(typesSource, /security\.saml/)
  assert.match(typesSource, /security\.auditLog/)
  assert.match(typesSource, /automation\.multipleAgents/)
  assert.match(typesSource, /export type LicenseCertificate =/)
  assert.match(typesSource, /export type LicenseInfo =/)
})

test('API resolves edition from env or signed license and exposes available features', () => {
  assert.match(editionSource, /process\.env\.SALLY_EDITION/)
  assert.match(editionSource, /function getSallyEdition\(/)
  assert.match(editionSource, /function getLicenseContext\(/)
  assert.match(editionSource, /SALLY_LICENSE_CERTIFICATE/)
  assert.match(editionSource, /SALLY_LICENSE_SIGNATURE/)
  assert.match(editionSource, /SALLY_LICENSE_PUBLIC_KEY/)
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
  const previous = { SALLY_EDITION: process.env.SALLY_EDITION }
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
    restoreEnv(previous)
  }
})

test('signed Enterprise license certificate enables Enterprise features without Stripe secrets in the app', () => {
  const previous = {
    SALLY_EDITION: process.env.SALLY_EDITION,
    SALLY_LICENSE_CERTIFICATE: process.env.SALLY_LICENSE_CERTIFICATE,
    SALLY_LICENSE_SIGNATURE: process.env.SALLY_LICENSE_SIGNATURE,
    SALLY_LICENSE_PUBLIC_KEY: process.env.SALLY_LICENSE_PUBLIC_KEY,
  }
  try {
    delete process.env.SALLY_EDITION
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const certificate = JSON.stringify({
      licenseId: 'lic_test_123',
      edition: 'ENTERPRISE',
      features: ['security.auditLog'],
      status: 'active',
      customer: { email: 'buyer@example.com', companyName: 'Example GmbH' },
      instanceId: 'inst_test_123',
      issuedAt: '2026-05-08T00:00:00.000Z',
      validUntil: '2099-01-01T00:00:00.000Z',
      graceUntil: '2099-01-08T00:00:00.000Z',
    })
    process.env.SALLY_LICENSE_CERTIFICATE = Buffer.from(certificate, 'utf8').toString('base64url')
    process.env.SALLY_LICENSE_SIGNATURE = crypto.sign(null, Buffer.from(certificate, 'utf8'), privateKey).toString('base64url')
    process.env.SALLY_LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    const edition = getEditionInfo()
    assert.equal(edition.edition, 'ENTERPRISE')
    assert.ok(edition.availableFeatures.includes('security.auditLog'))
    assert.deepEqual(edition.license, {
      source: 'certificate',
      status: 'active',
      licenseId: 'lic_test_123',
      customerEmail: 'buyer@example.com',
      companyName: 'Example GmbH',
      instanceId: 'inst_test_123',
      validUntil: '2099-01-01T00:00:00.000Z',
      graceUntil: '2099-01-08T00:00:00.000Z',
    })
  } finally {
    restoreEnv(previous)
  }
})

test('invalid or expired license certificates fall back to Community', () => {
  const previous = {
    SALLY_EDITION: process.env.SALLY_EDITION,
    SALLY_LICENSE_CERTIFICATE: process.env.SALLY_LICENSE_CERTIFICATE,
    SALLY_LICENSE_SIGNATURE: process.env.SALLY_LICENSE_SIGNATURE,
    SALLY_LICENSE_PUBLIC_KEY: process.env.SALLY_LICENSE_PUBLIC_KEY,
  }
  try {
    delete process.env.SALLY_EDITION
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const certificate = JSON.stringify({
      licenseId: 'lic_expired_123',
      edition: 'ENTERPRISE',
      features: ['security.auditLog'],
      status: 'active',
      issuedAt: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-01-02T00:00:00.000Z',
      graceUntil: '2026-01-03T00:00:00.000Z',
    })
    process.env.SALLY_LICENSE_CERTIFICATE = certificate
    process.env.SALLY_LICENSE_SIGNATURE = crypto.sign(null, Buffer.from(certificate, 'utf8'), privateKey).toString('base64url')
    process.env.SALLY_LICENSE_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    const edition = getEditionInfo()
    assert.equal(edition.edition, 'COMMUNITY')
    assert.equal(edition.license?.status, 'invalid')
    assert.match(edition.license?.error || '', /expired|canceled|disabled/)
  } finally {
    restoreEnv(previous)
  }
})
