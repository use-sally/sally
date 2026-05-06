import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const appShellSource = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const teamPageSource = fs.existsSync(path.join(process.cwd(), 'app/team/page.tsx')) ? fs.readFileSync(path.join(process.cwd(), 'app/team/page.tsx'), 'utf8') : ''
const apiSource = fs.readFileSync(path.join(process.cwd(), 'lib/api.ts'), 'utf8')

test('Team navigation is visible only to platform admins', () => {
  assert.match(appShellSource, /platformRole === 'SUPERADMIN' \|\| .*platformRole === 'ADMIN'/)
  assert.match(appShellSource, /href="\/team"[\s\S]*Team/)
})

test('Team page is the central user hub for all Sally accounts', () => {
  assert.match(teamPageSource, /getTeamAccounts/)
  assert.match(teamPageSource, /Every user in this Sally instance/)
  assert.match(teamPageSource, /Platform role/)
  assert.match(teamPageSource, /Workspaces/)
  assert.match(teamPageSource, /Projects/)
})

test('Team page exposes promote demote add remove and archive controls', () => {
  assert.match(teamPageSource, /updateAccountPlatformRole/)
  assert.match(teamPageSource, /createTeamAccount/)
  assert.match(teamPageSource, /archiveTeamAccount/)
  assert.match(teamPageSource, /addTeamAccountToWorkspace/)
  assert.match(teamPageSource, /removeTeamAccountFromWorkspace/)
  assert.match(teamPageSource, /addTeamAccountToProject/)
  assert.match(teamPageSource, /removeTeamAccountFromProject/)
})

test('Web API client exposes Team hub endpoints', () => {
  assert.match(apiSource, /export function getTeamAccounts/)
  assert.match(apiSource, /export function createTeamAccount/)
  assert.match(apiSource, /export function archiveTeamAccount/)
  assert.match(apiSource, /export function addTeamAccountToWorkspace/)
  assert.match(apiSource, /export function addTeamAccountToProject/)
})
