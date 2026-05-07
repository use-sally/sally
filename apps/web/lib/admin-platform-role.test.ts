import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { canChangeWorkspaceMemberRole, canInviteWorkspaceMembers, canRemoveWorkspaceMember } from './workspace-permissions'
import { platformRoleLabel } from './roles'

test('ADMIN has the same workspace member controls as SUPERADMIN in the UI', () => {
  const adminViewer = { accountId: 'admin-account', platformRole: 'ADMIN', workspaceRole: null }
  const target = { accountId: 'member-account', role: 'OWNER' }

  assert.equal(canInviteWorkspaceMembers(adminViewer).allowed, true)
  assert.equal(canChangeWorkspaceMemberRole(adminViewer, target, 'OWNER').allowed, true)
  assert.equal(canRemoveWorkspaceMember(adminViewer, target).allowed, true)
})

test('platform roles render admin distinctly from superadmin and regular users', () => {
  assert.equal(platformRoleLabel('SUPERADMIN'), 'Superadmin')
  assert.equal(platformRoleLabel('ADMIN'), 'Admin')
  assert.equal(platformRoleLabel('NONE'), 'User')
})

test('superadmin cannot edit their own platform role from workspace member controls', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'components/workspace-overview-panels.tsx'), 'utf8')
  assert.match(source, /canEditPlatformRole=\{session\?\.account\?\.platformRole === 'SUPERADMIN' && !member\.invited && member\.accountId !== session\?\.account\?\.id\}/)
  assert.match(source, /updateAccountPlatformRole\(accountId, \{ platformRole \}\)/)
})
