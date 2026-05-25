import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const appShellSource = fs.readFileSync(path.join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const teamPageSource = fs.existsSync(path.join(process.cwd(), 'app/team/page.tsx')) ? fs.readFileSync(path.join(process.cwd(), 'app/team/page.tsx'), 'utf8') : ''
const apiSource = fs.readFileSync(path.join(process.cwd(), 'lib/api.ts'), 'utf8')

test('Team navigation lives behind the platform-admin Admin mode', () => {
  assert.match(appShellSource, /platformRole === 'SUPERADMIN' \|\| .*platformRole === 'ADMIN'/)
  assert.match(appShellSource, /href="\/team"[\s\S]*>Admin</)
  assert.match(appShellSource, /const adminNavItems = \[/)
  assert.match(appShellSource, /\{ href: '\/team', label: 'Team' \}/)
})

test('Team page is the central user hub for all Sally accounts', () => {
  assert.match(teamPageSource, /getTeamAccounts/)
  assert.match(teamPageSource, /Every user in this Sally instance/)
  assert.match(teamPageSource, /Platform role/)
  assert.match(teamPageSource, /Workspaces & projects/)
  assert.match(teamPageSource, /Add workspace/)
})

test('Team page exposes promote demote add remove archive and delete controls', () => {
  assert.match(teamPageSource, /updateAccountPlatformRole/)
  assert.match(teamPageSource, /createTeamAccount/)
  assert.match(teamPageSource, /archiveTeamAccount/)
  assert.match(teamPageSource, /deleteTeamAccount/)
  assert.match(teamPageSource, /deleteTextAction/)
  assert.match(teamPageSource, /archiveTextAction/)
  assert.match(teamPageSource, /restoreTextAction/)
  assert.match(teamPageSource, /const isSuperadminAccount = account\.platformRole === 'SUPERADMIN'/)
  assert.match(teamPageSource, /isSuperadminAccount \? \(/)
  assert.match(teamPageSource, /isSuperadminAccount \? null : archived \? \(/)
  assert.match(teamPageSource, /!isSuperadminAccount && archived \? \(/)
  assert.match(teamPageSource, /Show archived users/)
  assert.match(teamPageSource, /showArchived \|\| !account\.archivedAt/)
  assert.match(teamPageSource, /Delete user/)
  assert.match(teamPageSource, /uploadTeamAccountAvatar/)
  assert.match(teamPageSource, /Click to upload or replace team member avatar/)
  assert.match(teamPageSource, /addTeamAccountToWorkspace/)
  assert.match(teamPageSource, /removeTeamAccountFromWorkspace/)
  assert.match(teamPageSource, /addTeamAccountToProject/)
  assert.match(teamPageSource, /removeTeamAccountFromProject/)
})

test('Team page shows 2FA status and admin recovery reset action', () => {
  assert.match(apiSource, /twoFactorEnabled: boolean/)
  assert.match(apiSource, /twoFactorConfirmedAt: string \| null/)
  assert.match(apiSource, /passkeyCount: number/)
  assert.match(apiSource, /export function resetTeamAccountTwoFactor/)
  assert.match(apiSource, /`\/accounts\/\$\{accountId\}\/2fa\/reset`/)
  assert.match(teamPageSource, /resetTeamAccountTwoFactor/)
  assert.match(teamPageSource, /2FA \{account\.twoFactorEnabled \? 'enabled' : 'not enabled'\}/)
  assert.match(teamPageSource, /account\.passkeyCount/)
  assert.match(teamPageSource, /passkey\$\{account\.passkeyCount === 1 \? '' : 's'\}/)
  assert.match(teamPageSource, /Reset 2FA/)
  assert.match(teamPageSource, /removes their authenticator and passkeys/)
  assert.match(teamPageSource, /Reset your own 2FA from Profile/)
})

test('Team page does not allow a superadmin to promote or demote themselves', () => {
  assert.match(teamPageSource, /const isCurrentAccount = account\.id === currentAccountId/)
  assert.match(teamPageSource, /disabled=\{!isSuperadmin \|\| isCurrentAccount \|\| saving === `role:\$\{account\.id\}`\}/)
})

test('Web API client exposes Team hub endpoints', () => {
  assert.match(apiSource, /export function getTeamAccounts/)
  assert.match(apiSource, /export function createTeamAccount/)
  assert.match(apiSource, /export function archiveTeamAccount/)
  assert.match(apiSource, /export function deleteTeamAccount/)
  assert.match(apiSource, /export function uploadTeamAccountAvatar/)
  assert.match(apiSource, /`\/team\/accounts\/\$\{accountId\}\/avatar`/)
  assert.match(apiSource, /export function addTeamAccountToWorkspace/)
  assert.match(apiSource, /export function addTeamAccountToProject/)
})

test('Team page nests projects inside collapsible workspace rows', () => {
  assert.match(teamPageSource, /expandedWorkspaceId/)
  assert.match(teamPageSource, /setExpandedWorkspaceId\(expanded \? null : membership\.workspaceId\)/)
  assert.match(teamPageSource, /projectsInWorkspace = visibleProjectMemberships\.filter\(\(project\) => project\.workspaceId === membership\.workspaceId\)/)
  assert.match(teamPageSource, /Add project in \{membership\.workspaceName\}/)
  assert.match(teamPageSource, /addableProjects = availableProjects\.filter\(\(project\) => project\.workspaceId === membership\.workspaceId/)
  assert.match(teamPageSource, /Remove workspace/)
  assert.match(teamPageSource, /No active projects in this workspace/)
})

test('Team page treats archived workspace memberships as hidden server state', () => {
  assert.match(apiSource, /workspaceArchivedAt\?: string \| null/)
  assert.match(apiSource, /projectWorkspaceArchivedAt\?: string \| null/)
  assert.match(teamPageSource, /availableWorkspaces = \(hub\?\.workspaceMemberships \?\? \[\]\)\.filter\(\(workspace\) => !workspace\.archivedAt/)
  assert.match(teamPageSource, /visibleWorkspaceMemberships = account\.memberships\.filter\(\(membership\) => !membership\.workspaceArchivedAt\)/)
  assert.match(teamPageSource, /visibleProjectMemberships = account\.projectMemberships\.filter\(\(membership\) => !membership\.projectWorkspaceArchivedAt\)/)
})
