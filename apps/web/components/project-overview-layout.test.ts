import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appShellSource = fs.readFileSync(path.join(__dirname, 'app-shell.tsx'), 'utf8')
const markdownEditorSource = fs.readFileSync(path.join(__dirname, 'markdown-description-editor.tsx'), 'utf8')
const projectOverviewSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'projects', '[projectId]', 'page.tsx'), 'utf8')

test('app shell main content column can shrink instead of creating horizontal page scroll', () => {
  assert.match(appShellSource, /gridTemplateColumns:\s*'280px minmax\(0, 1fr\)'/)
  assert.match(appShellSource, /<section style=\{\{[^}]*minWidth:\s*0/s)
})

test('project overview summary and activity grids use wrapping columns instead of fixed overflow widths', () => {
  assert.doesNotMatch(projectOverviewSource, /gridTemplateColumns:\s*'minmax\(280px, 1\.4fr\) minmax\(180px, 0\.7fr\) minmax\(240px, 1fr\)'/)
  assert.doesNotMatch(projectOverviewSource, /gridTemplateColumns:\s*'170px minmax\(220px, 320px\) 1fr'/)
  assert.match(projectOverviewSource, /repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/)
})

test('project header uses a simple stacked client members and danger layout', () => {
  assert.match(projectOverviewSource, /data-project-meta-stack="true"[\s\S]*data-project-client-section="true"[\s\S]*data-project-members-section="true"[\s\S]*data-project-danger-actions="true"/)
  assert.match(projectOverviewSource, /data-project-meta-stack="true" style=\{\{[\s\S]*justifyItems:\s*'end'/)
  assert.match(projectOverviewSource, /data-project-client-section="true" style=\{\{[\s\S]*justifyItems:\s*'end'[\s\S]*textAlign:\s*'right'/)
  assert.match(projectOverviewSource, /data-project-members-section="true" style=\{\{[\s\S]*justifyItems:\s*'end'[\s\S]*textAlign:\s*'right'/)
  assert.match(projectOverviewSource, /data-project-members-list="true" style=\{\{[\s\S]*justifyContent:\s*'flex-end'/)
  assert.match(projectOverviewSource, /data-project-danger-actions="true" style=\{\{[\s\S]*justifyContent:\s*'flex-end'/)
  assert.doesNotMatch(projectOverviewSource, /<div style=\{\{ \.\.\.panel, \.\.\.headerMetaCard[\s\S]*Client/)
  assert.doesNotMatch(projectOverviewSource, /<div style=\{\{ \.\.\.panel, \.\.\.headerMetaCard[\s\S]*Project members/)
  assert.match(projectOverviewSource, /data-project-member-person="true"/)
  assert.match(projectOverviewSource, /<AssigneeAvatar name=\{member\.name \|\| member\.email\} avatarUrl=\{member\.avatarUrl\} size=\{28\}/)
  assert.match(projectOverviewSource, /data-project-island-toolbar="true"[\s\S]*<ProjectTabs/)
  assert.doesNotMatch(projectOverviewSource, /data-project-island-toolbar="true"[\s\S]*handleArchiveProject/)
  assert.doesNotMatch(projectOverviewSource, /data-project-island-toolbar="true"[\s\S]*handleDeleteProject/)
})

test('project client uses a minimal avatar-only single-select picker like people selectors', () => {
  assert.match(projectOverviewSource, /data-project-client-picker="true"/)
  assert.match(projectOverviewSource, /data-project-client-person="true"/)
  assert.match(projectOverviewSource, /data-project-client-avatar-trigger="true"/)
  assert.match(projectOverviewSource, /style=\{clientAvatarButton\}/)
  assert.match(projectOverviewSource, /style=\{clientInitialAvatar\}/)
  assert.match(projectOverviewSource, /clientPickerOpen && clientChangeDecision\.allowed/)
  assert.match(projectOverviewSource, /clients\.map\(\(client\) => \(\s*<button[\s\S]*onClick=\{\(\) => void handleClientChange\(client\.id\)\}/)
  assert.match(projectOverviewSource, /onClick=\{\(\) => void handleClientChange\(''\)\}/)
  const clientTrigger = projectOverviewSource.match(/data-project-client-avatar-trigger="true"[\s\S]*?<\/button>/)?.[0] || ''
  assert.doesNotMatch(clientTrigger, /Single client|<span style=\{\{ display: 'grid'|<span style=\{\{ color: project\.client/)
  assert.doesNotMatch(projectOverviewSource, /clientPersonButton|clientInitialBadge/)
  assert.doesNotMatch(projectOverviewSource, /data-project-client-section="true"[\s\S]*<select[\s\S]*data-project-members-section="true"/)
  assert.doesNotMatch(projectOverviewSource, /data-project-client-picker="true"[\s\S]*(type="checkbox"|multiple)/)
})

test('project header gives metadata a narrow column and switches description preview directly into full-height editing', () => {
  assert.match(projectOverviewSource, /gridTemplateColumns:\s*'minmax\(0, 1fr\) minmax\(220px, 280px\)'/)
  assert.match(projectOverviewSource, /data-project-description-preview="true"/)
  assert.match(projectOverviewSource, /onClick=\{\(\) => \{\s*setProjectDescriptionDraft\(project\.description \|\| ''\)\s*setEditingProjectDescription\(true\)\s*\}\}/)
  assert.match(projectOverviewSource, /<MarkdownDescriptionEditor[\s\S]*onCommit=\{\(nextValue\) => \{[\s\S]*setEditingProjectDescription\(false\)[\s\S]*void saveProjectDescription\(nextValue\)/)
  assert.match(projectOverviewSource, /maxHeight:\s*88/)
  assert.match(projectOverviewSource, /overflow:\s*'hidden'/)
  assert.match(projectOverviewSource, /<MarkdownDescriptionEditor[\s\S]*autoFocus=\{true\}/)
  assert.match(projectOverviewSource, /<MarkdownDescriptionEditor[\s\S]*commitOnOutsideClick=\{true\}/)
  assert.match(markdownEditorSource, /commitOnOutsideClick[\s\S]*editor\.commands\.blur\(\)[\s\S]*document\.addEventListener\('mousedown', onPointerDown\)/)
  assert.doesNotMatch(projectOverviewSource, /cursor:\s*'zoom-in'/)
  assert.doesNotMatch(projectOverviewSource, /projectDescriptionExpanded/)
  assert.doesNotMatch(projectOverviewSource, /projectHeaderDescriptionExpandedButton/)
  assert.doesNotMatch(projectOverviewSource, /Click again to edit description|Click to expand description/)
})

test('project description uses task-style markdown rendering and editor', () => {
  assert.match(projectOverviewSource, /import \{ MarkdownDescriptionEditor \} from '..\/..\/..\/components\/markdown-description-editor'/)
  assert.match(projectOverviewSource, /import \{ TaskDescriptionRender \} from '..\/..\/..\/components\/task-description-render'/)
  assert.match(projectOverviewSource, /uploadProjectDescriptionImage/)
  assert.match(projectOverviewSource, /<MarkdownDescriptionEditor[\s\S]*value=\{projectDescriptionDraft\}/)
  assert.match(projectOverviewSource, /<TaskDescriptionRender description=\{project\.description \|\| ''\} \/>/)
  assert.doesNotMatch(projectOverviewSource, /<textarea[\s\S]*value=\{projectDescriptionDraft\}/)
})

test('project members show avatar-only flags and plus opens invite email input directly', () => {
  assert.match(projectOverviewSource, /data-project-member-avatar-trigger="true"/)
  assert.match(projectOverviewSource, /aria-label=\{`Open project member details for \$\{member\.name \|\| member\.email\}`\}/)
  assert.match(projectOverviewSource, /<AssigneeAvatar name=\{member\.name \|\| member\.email\} avatarUrl=\{member\.avatarUrl\} size=\{28\} \/>/)
  const avatarTrigger = projectOverviewSource.match(/data-project-member-avatar-trigger="true"[\s\S]*?<\/button>/)?.[0] || ''
  assert.doesNotMatch(avatarTrigger, /<span/)
  assert.match(projectOverviewSource, /data-project-member-add-trigger="true"[\s\S]*>\+<\/button>/)
  assert.match(projectOverviewSource, /onClick=\{\(\) => setMemberInviteMode\(true\)\}/)
  assert.match(projectOverviewSource, /placeholder="add email address to invite"/)
  assert.doesNotMatch(projectOverviewSource, />Add member<|>Invite by email</)
  assert.doesNotMatch(projectOverviewSource, /memberPickerOpen|memberAddMenu|handleAddExistingMember/)
})
