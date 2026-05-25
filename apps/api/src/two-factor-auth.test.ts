import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const schemaSource = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/schema.prisma'), 'utf8')
const migrationSource = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/migrations/20260525172000_two_factor_credentials/migration.sql'), 'utf8')
const apiSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const webApiSource = fs.readFileSync(path.join(repoRoot, 'apps/web/lib/api.ts'), 'utf8')
const authGateSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/auth-gate.tsx'), 'utf8')
const profileSource = fs.readFileSync(path.join(repoRoot, 'apps/web/app/profile/page.tsx'), 'utf8')
const accountPanelSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/two-factor-account-panel.tsx'), 'utf8')
const policyPanelSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/two-factor-policy-panel.tsx'), 'utf8')
const doctorSource = fs.readFileSync(path.join(repoRoot, 'apps/create-sally/src/index.ts'), 'utf8')

test('database stores TOTP credentials and short-lived login challenges', () => {
  assert.match(schemaSource, /model AccountTwoFactorCredential \{[\s\S]*accountId\s+String\s+@unique/)
  assert.match(schemaSource, /model AccountTwoFactorCredential \{[\s\S]*secret\s+String/)
  assert.match(schemaSource, /model AccountTwoFactorCredential \{[\s\S]*enabled\s+Boolean\s+@default\(false\)/)
  assert.match(schemaSource, /model AccountTwoFactorCredential \{[\s\S]*confirmedAt\s+DateTime\?/)
  assert.match(schemaSource, /model AccountTwoFactorChallenge \{[\s\S]*token\s+String\s+@unique/)
  assert.match(schemaSource, /model AccountTwoFactorChallenge \{[\s\S]*expiresAt\s+DateTime/)
  assert.match(schemaSource, /model AccountTwoFactorChallenge \{[\s\S]*usedAt\s+DateTime\?/)
  assert.match(schemaSource, /@@index\(\[expiresAt\]\)/)
})

test('2FA migration creates credential and challenge tables with cascade account links', () => {
  assert.match(migrationSource, /CREATE TABLE "AccountTwoFactorCredential"/)
  assert.match(migrationSource, /CREATE TABLE "AccountTwoFactorChallenge"/)
  assert.match(migrationSource, /CREATE UNIQUE INDEX "AccountTwoFactorCredential_accountId_key"/)
  assert.match(migrationSource, /CREATE UNIQUE INDEX "AccountTwoFactorChallenge_token_key"/)
  assert.match(migrationSource, /REFERENCES "Account"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/)
})

test('API implements dependency-free TOTP setup, confirmation, and disable lifecycle', () => {
  assert.match(apiSource, /function base32Encode/)
  assert.match(apiSource, /function base32Decode/)
  assert.match(apiSource, /crypto\.createHmac\('sha1'/)
  assert.match(apiSource, /function verifyTotp/)
  assert.match(apiSource, /\[-1, 0, 1\]\.some/)
  assert.match(apiSource, /crypto\.timingSafeEqual/)
  assert.match(apiSource, /otpauth:\/\/totp/)
  assert.match(apiSource, /app\.get\('\/auth\/2fa\/status'/)
  assert.match(apiSource, /app\.post\('\/auth\/2fa\/setup'/)
  assert.match(apiSource, /accountTwoFactorCredential\.upsert/)
  assert.match(apiSource, /app\.post\('\/auth\/2fa\/confirm'/)
  assert.match(apiSource, /enabled: true, confirmedAt: new Date\(\)/)
  assert.match(apiSource, /app\.post\('\/auth\/2fa\/disable'/)
  assert.match(apiSource, /enabled: false, confirmedAt: null/)
})

test('API login uses challenge handoff for enabled or policy-required 2FA', () => {
  assert.match(apiSource, /const twoFactorRequiredForAccount = async/)
  assert.match(apiSource, /policy\.enforcementTarget === 'ALL'/)
  assert.match(apiSource, /policy\.enforcementTarget === 'ADMINS'/)
  assert.match(apiSource, /accountTwoFactorCredential\.findUnique\(\{ where: \{ accountId: account\.id \} \}\)/)
  assert.match(apiSource, /requiresTwoFactor/)
  assert.match(apiSource, /accountTwoFactorChallenge\.create/)
  assert.match(apiSource, /getTwoFactorChallengeExpiry\(\)/)
  assert.match(apiSource, /2FA is required for this account but is not set up yet/)
  assert.match(apiSource, /app\.post\('\/auth\/login\/2fa'/)
  assert.match(apiSource, /usedAt: null, expiresAt: \{ gt: new Date\(\) \}/)
  assert.match(apiSource, /2FA challenge expired or invalid/)
  assert.match(apiSource, /Invalid 2FA code/)
  assert.match(apiSource, /accountTwoFactorChallenge\.update\(\{ where: \{ id: challenge\.id \}, data: \{ usedAt: new Date\(\) \} \}\)/)
  assert.match(apiSource, /accountSession\.create\(\{ data: \{ accountId: challenge\.accountId/)
})

test('Enterprise 2FA policy is enforcement-ready and exposes admin recovery reset', () => {
  assert.match(apiSource, /security\.enforced2fa/)
  assert.match(apiSource, /enforcementReady: true/)
  assert.match(apiSource, /app\.post\('\/accounts\/:accountId\/2fa\/reset'/)
  assert.match(apiSource, /allowRecoveryResetByAdmins/)
  assert.match(apiSource, /Admin 2FA recovery reset is disabled by policy/)
  assert.match(apiSource, /accountTwoFactorChallenge\.deleteMany\(\{ where: \{ accountId \} \}\)/)
  assert.match(apiSource, /accountTwoFactorCredential\.deleteMany\(\{ where: \{ accountId \} \}\)/)
  assert.match(apiSource, /audit\.twoFactor\.recoveryReset/)
})

test('web client and login UI support the 2FA challenge flow', () => {
  assert.match(webApiSource, /export type LoginResponse = LoginSuccess \| \{ ok: boolean; requiresTwoFactor: true; challengeToken: string; expiresAt: string \}/)
  assert.match(webApiSource, /completeTwoFactorLogin/)
  assert.match(webApiSource, /getTwoFactorStatus/)
  assert.match(webApiSource, /startTwoFactorSetup/)
  assert.match(webApiSource, /confirmTwoFactorSetup/)
  assert.match(webApiSource, /disableTwoFactor/)
  assert.match(authGateSource, /twoFactorChallengeToken/)
  assert.match(authGateSource, /handleTwoFactorSubmit/)
  assert.match(authGateSource, /completeTwoFactorLogin/)
  assert.match(authGateSource, /Enter your 2FA code to finish signing in/)
  assert.match(authGateSource, /auth \/ 2fa/)
})

test('profile UI exposes authenticator enrollment and disable controls', () => {
  assert.match(profileSource, /TwoFactorAccountPanel/)
  assert.match(accountPanelSource, /startTwoFactorSetup/)
  assert.match(accountPanelSource, /confirmTwoFactorSetup/)
  assert.match(accountPanelSource, /disableTwoFactor/)
  assert.match(accountPanelSource, /Set up authenticator app/)
  assert.match(accountPanelSource, /Confirm and enable 2FA/)
  assert.match(accountPanelSource, /Disable 2FA/)
  assert.match(accountPanelSource, /Open authenticator app/)
})

test('2FA policy UI no longer describes enforcement as a scaffold', () => {
  assert.match(policyPanelSource, /Require TOTP authenticator-app 2FA by role/)
  assert.doesNotMatch(policyPanelSource, /scaffold/)
  assert.doesNotMatch(policyPanelSource, /Enforcement will activate when user 2FA enrollment is available/)
})

test('doctor checks include Enterprise 2FA credential schema', () => {
  assert.match(doctorSource, /missingAccountTwoFactorCredentialTable/)
  assert.match(doctorSource, /missingAccountTwoFactorChallengeTable/)
  assert.match(doctorSource, /AccountTwoFactorCredential table missing/)
  assert.match(doctorSource, /AccountTwoFactorChallenge table missing/)
})
