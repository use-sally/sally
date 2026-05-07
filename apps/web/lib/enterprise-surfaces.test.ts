import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appShellSource = fs.readFileSync(path.join(root, 'components/app-shell.tsx'), 'utf8')
const securityPageSource = fs.existsSync(path.join(root, 'app/security/page.tsx')) ? fs.readFileSync(path.join(root, 'app/security/page.tsx'), 'utf8') : ''
const systemPageSource = fs.existsSync(path.join(root, 'app/system/page.tsx')) ? fs.readFileSync(path.join(root, 'app/system/page.tsx'), 'utf8') : ''
const lockedCardSource = fs.existsSync(path.join(root, 'components/enterprise-locked-card.tsx')) ? fs.readFileSync(path.join(root, 'components/enterprise-locked-card.tsx'), 'utf8') : ''
const editionClientSource = fs.existsSync(path.join(root, 'lib/edition.ts')) ? fs.readFileSync(path.join(root, 'lib/edition.ts'), 'utf8') : ''

test('platform admin nav uses a dedicated Admin mode instead of cramming admin links into app nav', () => {
  assert.match(appShellSource, /const isAdminArea =/)
  assert.match(appShellSource, /href="\/team"[^]*>Admin</)
  assert.match(appShellSource, /Back to app/)
  assert.match(appShellSource, /const adminNavItems =/)
  assert.match(appShellSource, /Team/)
  assert.match(appShellSource, /Security/)
  assert.match(appShellSource, /System/)
  const appNavBlock = appShellSource.slice(appShellSource.indexOf("const appNavItems"), appShellSource.indexOf("const adminNavItems"))
  assert.doesNotMatch(appNavBlock, /Security|System|Team/)
})

test('web has reusable Enterprise locked card and edition client', () => {
  assert.match(lockedCardSource, /EnterpriseLockedCard/)
  assert.match(lockedCardSource, /Enterprise feature/)
  assert.match(lockedCardSource, /upgrade/i)
  assert.match(editionClientSource, /getEdition/)
  assert.match(editionClientSource, /availableFeatures/)
})

test('Security page separates policy areas and locks enterprise governance features', () => {
  assert.match(securityPageSource, /Authentication policy/)
  assert.match(securityPageSource, /SAML \/ SSO/)
  assert.match(securityPageSource, /2FA enforcement/)
  assert.match(securityPageSource, /Sessions/)
  assert.match(securityPageSource, /API & MCP key policy/)
  assert.match(securityPageSource, /Audit log/)
  assert.match(securityPageSource, /EnterpriseLockedCard/)
})

test('System page separates runtime health from Security policy', () => {
  assert.match(systemPageSource, /Version/)
  assert.match(systemPageSource, /Email\/SMTP status/)
  assert.match(systemPageSource, /Storage status/)
  assert.match(systemPageSource, /Migration status/)
  assert.match(systemPageSource, /Background jobs/)
  assert.match(systemPageSource, /Backups\/restore/)
  assert.match(systemPageSource, /redacted/i)
  assert.doesNotMatch(systemPageSource, /SAML \/ SSO/)
})
