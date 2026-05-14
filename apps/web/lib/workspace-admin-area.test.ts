import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appShellSource = fs.readFileSync(path.join(root, 'components/app-shell.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'lib/api.ts'), 'utf8')
const workspaceAdminPageSource = fs.existsSync(path.join(root, 'app/workspaces/page.tsx')) ? fs.readFileSync(path.join(root, 'app/workspaces/page.tsx'), 'utf8') : ''

test('Admin mode includes a Workspaces section beside Team Security and System', () => {
  assert.match(appShellSource, /const adminNavItems = \[/)
  assert.match(appShellSource, /\{ href: '\/workspaces', label: 'Workspaces' \}/)
  assert.match(appShellSource, /pathname\.startsWith\('\/workspaces'\)/)
})

test('workspace admin page can create archive restore and delete workspaces', () => {
  assert.match(workspaceAdminPageSource, /getWorkspaces\(\{ archived: true \}\)/)
  assert.match(workspaceAdminPageSource, /createWorkspace/)
  assert.match(workspaceAdminPageSource, /archiveWorkspace/)
  assert.match(workspaceAdminPageSource, /deleteWorkspace/)
  assert.match(workspaceAdminPageSource, /Archive/)
  assert.match(workspaceAdminPageSource, /Restore/)
  assert.match(workspaceAdminPageSource, /Delete/)
  assert.match(workspaceAdminPageSource, /import \{ archiveTextAction, deleteTextAction, restoreTextAction \} from '..\/..\/lib\/theme'/)
  assert.match(workspaceAdminPageSource, /style=\{\{ \.\.\.archiveTextAction, opacity: saving === `archive:\$\{workspace\.id\}` \? 0\.5 : 1 \}\}>Archive/)
  assert.match(workspaceAdminPageSource, /style=\{\{ \.\.\.restoreTextAction, opacity: saving === `archive:\$\{workspace\.id\}` \? 0\.5 : 1 \}\}>Restore/)
  assert.match(workspaceAdminPageSource, /style=\{\{ \.\.\.deleteTextAction, opacity: saving === `delete:\$\{workspace\.id\}` \? 0\.5 : 1 \}\}>Delete/)
  assert.doesNotMatch(workspaceAdminPageSource, /border: '1px solid rgba\(250, 204, 21, 0\.35\)'/)
  assert.doesNotMatch(workspaceAdminPageSource, /border: '1px solid rgba\(248, 113, 113, 0\.35\)'/)
})

test('web API client exposes workspace archive delete and archived listing helpers', () => {
  assert.match(apiSource, /getWorkspaces\(filters\?: \{ archived\?: boolean \}\)/)
  assert.match(apiSource, /export function archiveWorkspace/)
  assert.match(apiSource, /export function deleteWorkspace/)
})

test('workspace dropdown refreshes active memberships so archived workspaces disappear after archive', () => {
  assert.match(appShellSource, /const refreshSessionMemberships = useCallback\(async \(\) =>/)
  assert.match(appShellSource, /setWorkspaceOptions\(options\)/)
  assert.match(appShellSource, /pickPreferredWorkspaceId\(workspaceMemberships/)
  assert.match(appShellSource, /void refreshSessionMemberships\(\)/)
})

test('workspace overview does not expose inline editing for archived workspaces', () => {
  const overviewSource = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8')
  assert.match(overviewSource, /const activeWorkspaceArchived = Boolean/)
  assert.match(overviewSource, /disabled=\{workspaceNameSaving \|\| activeWorkspaceArchived\}/)
  assert.doesNotMatch(overviewSource, /onClick=\{\(\) => setEditingWorkspaceName\(true\)\}/)
})
