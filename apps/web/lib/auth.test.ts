import test from 'node:test'
import assert from 'node:assert/strict'
import { pickPreferredWorkspaceId, type Membership } from './auth'

const memberships: Membership[] = [
  { id: 'm1', workspaceId: 'w-test', workspaceSlug: 'test', workspaceName: 'test', role: 'OWNER' },
  { id: 'm2', workspaceId: 'w-sally', workspaceSlug: 'sally', workspaceName: 'sally_', role: 'OWNER' },
]

test('pickPreferredWorkspaceId prefers an explicit requested workspace id', () => {
  assert.equal(pickPreferredWorkspaceId(memberships, { requestedWorkspaceId: 'w-test', configuredWorkspaceSlug: 'sally', storedWorkspaceId: 'w-sally' }), 'w-test')
})

test('pickPreferredWorkspaceId prefers configured workspace slug over stored workspace id', () => {
  assert.equal(pickPreferredWorkspaceId(memberships, { configuredWorkspaceSlug: 'sally', storedWorkspaceId: 'w-test' }), 'w-sally')
})

test('pickPreferredWorkspaceId falls back to stored workspace id when valid and no configured match exists', () => {
  assert.equal(pickPreferredWorkspaceId(memberships, { storedWorkspaceId: 'w-test' }), 'w-test')
})

test('pickPreferredWorkspaceId falls back to first membership when no preference matches', () => {
  assert.equal(pickPreferredWorkspaceId(memberships, { configuredWorkspaceSlug: 'missing' }), 'w-test')
})
