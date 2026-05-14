import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const apiSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const editionSource = fs.readFileSync(path.join(__dirname, 'edition.ts'), 'utf8')
const schemaSource = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/schema.prisma'), 'utf8')
const typesSource = fs.readFileSync(path.join(repoRoot, 'packages/types/src/edition.ts'), 'utf8')
const webApiSource = fs.readFileSync(path.join(repoRoot, 'apps/web/lib/api.ts'), 'utf8')
const appShellSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/app-shell.tsx'), 'utf8')
const licensePagePath = path.join(repoRoot, 'apps/web/app/edition-license/page.tsx')
const licenseServicePath = path.join(__dirname, 'license-management.ts')

test('database schema stores one installed Sally license certificate without raw license keys', () => {
  assert.match(schemaSource, /model InstalledLicense\s*{[\s\S]*id\s+String\s+@id[\s\S]*certificate\s+String/s)
  assert.match(schemaSource, /publicKey\s+String/)
  assert.match(schemaSource, /licenseServerUrl\s+String/)
  assert.match(schemaSource, /activationId\s+String\?/)
  assert.match(schemaSource, /lastRefreshAt\s+DateTime\?/) 
  assert.doesNotMatch(schemaSource, /rawLicenseKey|licenseKey\s+String/)
})

test('edition resolver supports installed DB certificates after env and file overrides', () => {
  assert.match(typesSource, /source: 'community' \| 'env_override' \| 'certificate' \| 'installed_certificate'/)
  assert.match(editionSource, /InstalledLicenseInput/)
  assert.match(editionSource, /getLicenseContext\([^)]*installedLicense/)
  assert.match(editionSource, /installed_certificate/)
  assert.match(apiSource, /readInstalledLicense\(/)
  assert.match(apiSource, /getEditionInfo\([^)]*installedLicense/s)
  assert.match(apiSource, /requireFeature\('security\.auditLog',[^)]*readInstalledLicense/s)
})

test('platform-admin license APIs install, refresh, and remove certificates through the license server', () => {
  assert.ok(fs.existsSync(licenseServicePath), 'license-management.ts should exist')
  const serviceSource = fs.readFileSync(licenseServicePath, 'utf8')
  assert.match(apiSource, /app\.get\('\/license'/)
  assert.match(apiSource, /app\.post\('\/license\/activate'/)
  assert.match(apiSource, /app\.post\('\/license\/refresh'/)
  assert.match(apiSource, /app\.delete\('\/license'/)
  assert.match(apiSource, /isPlatformAdmin\(request\)/)
  assert.match(serviceSource, /activateInstalledLicense/)
  assert.match(serviceSource, /refreshInstalledLicense/)
  assert.match(serviceSource, /removeInstalledLicense/)
  assert.match(serviceSource, /\/api\/licenses\/activate/)
  assert.match(serviceSource, /\/api\/licenses\/refresh/)
  assert.match(serviceSource, /SALLY_LICENSE_SERVER_URL/)
})

test('Admin mode exposes Edition\/License UI and web client functions', () => {
  assert.match(appShellSource, /href: '\/edition-license', label: 'Edition\/License'/)
  assert.match(appShellSource, /pathname\.startsWith\('\/edition-license'\)/)
  assert.ok(fs.existsSync(licensePagePath), 'Admin Edition/License page should exist')
  const pageSource = fs.readFileSync(licensePagePath, 'utf8')
  assert.match(webApiSource, /getLicense\(/)
  assert.match(webApiSource, /activateLicense\(/)
  assert.match(webApiSource, /refreshLicense\(/)
  assert.match(webApiSource, /removeLicense\(/)
  assert.match(pageSource, /AppShell title="Edition\/License"/)
  assert.match(pageSource, /Paste license key/)
  assert.match(pageSource, /Activate license/)
  assert.match(pageSource, /Refresh certificate/)
  assert.match(pageSource, /Remove license/)
  assert.doesNotMatch(pageSource, /License server URL|setLicenseServerUrl|licenseServerUrl\.trim/)
  assert.doesNotMatch(webApiSource, /licenseServerUrl\?: string/)
})

test('license activation uses the configured Sally license server, not a browser-supplied server URL', () => {
  const serviceSource = fs.readFileSync(licenseServicePath, 'utf8')
  assert.match(serviceSource, /const licenseServerUrl = getConfiguredLicenseServerUrl\(\)/)
  const activationBlock = serviceSource.slice(serviceSource.indexOf('export async function activateInstalledLicense'), serviceSource.indexOf('export async function refreshInstalledLicense'))
  assert.doesNotMatch(activationBlock, /input\.licenseServerUrl/)
  assert.doesNotMatch(apiSource, /licenseServerUrl\?: string/)
})
