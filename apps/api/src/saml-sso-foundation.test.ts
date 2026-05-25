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
const authGateSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/auth-gate.tsx'), 'utf8')
const samlCallbackSource = fs.readFileSync(path.join(repoRoot, 'apps/web/app/saml/callback/page.tsx'), 'utf8')
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

test('API exposes bounded SAML metadata login and ACS flow', () => {
  assert.match(apiSource, /app\.get\('\/auth\/saml\/status'/)
  assert.match(apiSource, /app\.get\('\/auth\/saml\/metadata'/)
  assert.match(apiSource, /app\.get\('\/auth\/saml\/login'/)
  assert.match(apiSource, /app\.post\('\/auth\/saml\/acs'/)
  assert.match(apiSource, /SAMLRequest/)
  assert.match(apiSource, /SAMLResponse/)
  assert.match(apiSource, /extractSamlEmail/)
  assert.match(apiSource, /verifySamlSignature/)
  assert.match(apiSource, /SignedXml/)
  assert.match(apiSource, /SAML response signature is invalid/)
  assert.match(apiSource, /audit\.saml\.loginStarted/)
  assert.match(apiSource, /audit\.saml\.loginSucceeded/)
  assert.match(apiSource, /audit\.saml\.loginFailed/)
  assert.match(apiSource, /samlSessionRedirectHtml/)
  assert.match(apiSource, /\/saml\/callback/)
})

test('enforced SAML blocks local password login except superadmin break-glass', () => {
  assert.match(apiSource, /samlIdentityProvider\.findUnique\(\{ where: \{ id: 'default' \} \}\)/)
  assert.match(apiSource, /samlConfig\?\.enabled && samlConfig\.enforceSso && account\.platformRole !== PlatformRole\.SUPERADMIN/)
  assert.match(apiSource, /SAML SSO is enforced for this instance/)
  assert.match(apiSource, /reason: 'saml_enforced'/)
})

test('Security UI shows SAML as visible locked Community card and editable Enterprise form', () => {
  assert.match(securityPageSource, /SamlSsoPanel/)
  assert.match(samlPanelSource, /hasFeature\(info, 'security\.saml'\)/)
  assert.match(samlPanelSource, /EnterpriseLockedCard title="SAML \/ SSO"/)
  assert.match(samlPanelSource, /Visible in Community; editable in Enterprise\./)
  assert.match(samlPanelSource, /Save SAML configuration/)
  assert.match(samlPanelSource, /samlMetadataUrl\(\)/)
  assert.match(samlPanelSource, /samlLoginUrl\(\)/)
  assert.match(samlPanelSource, /Enable SAML SSO/)
  assert.match(samlPanelSource, /Enforce SSO for non-superadmin users/)
})

test('web has browser SAML completion and SSO login entrypoint', () => {
  assert.match(authGateSource, /getSamlStatus/)
  assert.match(authGateSource, /Continue with SSO/)
  assert.match(authGateSource, /samlLoginUrl\(\)/)
  assert.match(authGateSource, /pathname === '\/saml\/callback'/)
  assert.match(samlCallbackSource, /Completing SAML sign-in/)
  assert.match(samlCallbackSource, /saveSession/)
  assert.match(samlCallbackSource, /window\.location\.replace\('\/'\)/)
})

test('web API client exposes SAML configuration helpers', () => {
  assert.match(webApiSource, /getSamlIdentityProvider/)
  assert.match(webApiSource, /saveSamlIdentityProvider/)
  assert.match(webApiSource, /deleteSamlIdentityProvider/)
  assert.match(webApiSource, /samlMetadataUrl/)
  assert.match(webApiSource, /samlLoginUrl/)
  assert.match(webApiSource, /getSamlStatus/)
})
