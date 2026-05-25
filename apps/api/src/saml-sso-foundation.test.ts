import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const schemaSource = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/schema.prisma'), 'utf8')
const apiSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const securityPageSource = fs.readFileSync(path.join(repoRoot, 'apps/web/app/security/page.tsx'), 'utf8')
const samlPanelSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/saml-sso-panel.tsx'), 'utf8')
const webApiSource = fs.readFileSync(path.join(repoRoot, 'apps/web/lib/api.ts'), 'utf8')

test('database stores one SAML identity provider configuration', () => {
  assert.match(schemaSource, /model SamlIdentityProvider \{[\s\S]*id\s+String\s+@id\s+@default\("default"\)/)
  assert.match(schemaSource, /entityId\s+String/)
  assert.match(schemaSource, /ssoUrl\s+String/)
  assert.match(schemaSource, /certificate\s+String/)
  assert.match(schemaSource, /enabled\s+Boolean\s+@default\(false\)/)
  assert.match(schemaSource, /enforceSso\s+Boolean\s+@default\(false\)/)
})

test('API exposes Enterprise-gated SAML configuration endpoints with audit events', () => {
  assert.match(apiSource, /app\.get\('\/security\/saml-idp'/)
  assert.match(apiSource, /app\.put\('\/security\/saml-idp'/)
  assert.match(apiSource, /app\.delete\('\/security\/saml-idp'/)
  assert.match(apiSource, /security\.saml/)
  assert.match(apiSource, /audit\.saml\.created/)
  assert.match(apiSource, /audit\.saml\.updated/)
  assert.match(apiSource, /audit\.saml\.enabled/)
  assert.match(apiSource, /audit\.saml\.disabled/)
  assert.match(apiSource, /audit\.saml\.enforceSsoChanged/)
})

test('Security UI shows SAML as visible locked Community card and editable Enterprise form', () => {
  assert.match(securityPageSource, /SamlSsoPanel/)
  assert.match(samlPanelSource, /hasFeature\(info, 'security\.saml'\)/)
  assert.match(samlPanelSource, /EnterpriseLockedCard title="SAML \/ SSO"/)
  assert.match(samlPanelSource, /Visible in Community; editable in Enterprise\./)
  assert.match(samlPanelSource, /Save SAML configuration/)
  assert.match(samlPanelSource, /Enable SAML SSO/)
  assert.match(samlPanelSource, /Enforce SSO for non-superadmin users/)
})

test('web API client exposes SAML configuration helpers', () => {
  assert.match(webApiSource, /getSamlIdentityProvider/)
  assert.match(webApiSource, /saveSamlIdentityProvider/)
  assert.match(webApiSource, /deleteSamlIdentityProvider/)
})
