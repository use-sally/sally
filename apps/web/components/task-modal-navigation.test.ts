import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const taskBoardSource = fs.readFileSync(path.join(__dirname, 'task-board.tsx'), 'utf8')
const taskTableSource = fs.readFileSync(path.join(__dirname, 'project-tasks-table.tsx'), 'utf8')
const editableTaskRowSource = fs.readFileSync(path.join(__dirname, 'editable-task-row.tsx'), 'utf8')
const taskModalSource = fs.readFileSync(path.join(__dirname, 'task-modal.tsx'), 'utf8')
const taskModalBodySource = fs.readFileSync(path.join(__dirname, 'task-modal-body.tsx'), 'utf8')
const taskModalHeaderPath = path.join(__dirname, 'task-modal-header.tsx')
const taskModalHeaderSource = fs.existsSync(taskModalHeaderPath) ? fs.readFileSync(taskModalHeaderPath, 'utf8') : ''
const projectPageSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'projects', '[projectId]', 'page.tsx'), 'utf8')

describe('project task modal navigation', () => {
  it('board task links preserve the board island while opening task overlay state', () => {
    assert.match(taskBoardSource, /href=\{`\$\{taskBaseHref\}\?view=board&task=\$\{card\.id\}`\}/)
    assert.doesNotMatch(taskBoardSource, /href=\{`\$\{taskBaseHref\}\?task=\$\{card\.id\}`\}/)
  })

  it('project page renders the task overlay for any island with a selected task', () => {
    assert.match(projectPageSource, /\{taskId && projectId \? <TaskModal/)
    assert.doesNotMatch(projectPageSource, /currentView === 'board' && taskId/)
  })

  it('task detail opens as a centered modal, not a bottom sheet drawer', () => {
    assert.match(taskModalSource, /role="dialog"/)
    assert.match(taskModalSource, /aria-modal="true"/)
    assert.match(taskModalSource, /data-preserve-task-open="true"/)
    assert.match(taskModalSource, /alignItems:\s*'center'/)
    assert.match(taskModalSource, /TASK_MODAL_MAX_WIDTH\s*=\s*1200/)
    assert.match(taskModalSource, /boxSizing:\s*'border-box'/)
    assert.match(taskModalSource, /overflowX:\s*'hidden'/)
    assert.doesNotMatch(taskModalSource, /alignItems:\s*'flex-end'/)
    assert.doesNotMatch(taskModalSource, /borderTopLeftRadius/)
  })

  it('tasks island uses the shared modal instead of rendering an inline task panel or jumping the background list', () => {
    assert.match(taskTableSource, /const router = useRouter\(\)/)
    assert.match(taskTableSource, /router\.replace\(next \? `\$\{pathname\}\?\$\{next\}` : pathname, \{ scroll: false \}\)/)
    assert.doesNotMatch(taskTableSource, /<TaskModalBody taskId=\{task\.id\}/)
    assert.doesNotMatch(taskTableSource, /import \{ TaskModalBody \}/)
    assert.doesNotMatch(taskTableSource, /window\.scrollTo\(/)
    assert.doesNotMatch(taskTableSource, /requestAnimationFrame\(\)/)
  })

  it('task rows only use row-level modal activation, with no inline editing or nested people menu', () => {
    assert.match(taskTableSource, /<EditableTaskRow[\s\S]*onActivate=\{\(\) => setExpandedTaskParam\(task\.id\)\}/)
    assert.match(editableTaskRowSource, /onClick=\{onActivate\}/)
    assert.match(editableTaskRowSource, /<TaskPeopleAvatarStack/)
    assert.doesNotMatch(editableTaskRowSource, /TaskPeopleField/)
    assert.doesNotMatch(editableTaskRowSource, /setActiveField/)
    assert.doesNotMatch(editableTaskRowSource, /handleFieldClick/)
    assert.doesNotMatch(editableTaskRowSource, /if \(!expanded\) \{?\s*onActivate\(\)/)
  })

  it('board task cards only expose the modal-opening card link, with no nested people menu', () => {
    assert.match(taskBoardSource, /<Link href=\{`\$\{taskBaseHref\}\?view=board&task=\$\{card\.id\}`\}[\s\S]*>\s*<div style=\{\{ \.\.\.boardCardStyle/)
    assert.match(taskBoardSource, /<TaskPeopleAvatarStack/)
    assert.doesNotMatch(taskBoardSource, /TaskPeopleField/)
  })

  it('board columns keep fixed kanban width inside a horizontal scroll area', () => {
    assert.match(taskBoardSource, /const BOARD_COLUMN_WIDTH\s*=\s*320/)
    assert.match(taskBoardSource, /data-board-scroll="true"[\s\S]*overflowX:\s*'auto'/)
    assert.match(taskBoardSource, /data-board-columns="true"[\s\S]*display:\s*'flex'[\s\S]*width:\s*'max-content'/)
    assert.match(taskBoardSource, /flex:\s*`0 0 \$\{BOARD_COLUMN_WIDTH\}px`/)
    assert.match(taskBoardSource, /width:\s*BOARD_COLUMN_WIDTH/)
    assert.doesNotMatch(taskBoardSource, /gridTemplateColumns:\s*`repeat\(\$\{Math\.max\(board\.length \+ \(canManageStatuses \? 1 : 0\), 1\)\}, minmax\(0, 1fr\)\)`/)
  })

  it('board status color name is removed and status editing autosaves on blur', () => {
    assert.doesNotMatch(taskBoardSource, /boardColorTrigger/)
    assert.doesNotMatch(taskBoardSource, /colorPair\?\.id \?\? 'default'/)
    assert.match(taskBoardSource, /data-board-status-editor=\{isEditing \? column\.id : undefined\}/)
    assert.match(taskBoardSource, /onBlur=\{\(event\) => \{[\s\S]*if \(!event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)\) void saveStatusEdit\(column\)[\s\S]*\}\}/)
    assert.doesNotMatch(taskBoardSource, />\{saving \? 'Saving…' : 'Save'\}<\/button>/)
    assert.doesNotMatch(taskBoardSource, />Cancel<\/button>/)
  })

  it('tasks status group editing autosaves on blur and no longer shows save/cancel buttons', () => {
    assert.match(taskTableSource, /data-task-status-editor=\{editing \? status\.id : undefined\}/)
    assert.match(taskTableSource, /onBlur=\{\(event\) => \{[\s\S]*if \(!event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)\) onSaveEdit\(\)[\s\S]*\}\}/)
    assert.doesNotMatch(taskTableSource, />\{saving \? 'Saving…' : 'Save'\}<\/button>/)
    assert.doesNotMatch(taskTableSource, />Cancel<\/button>/)
  })

  it('task modal content is bounded to the modal width', () => {
    assert.match(taskModalSource, /width:\s*`min\(calc\(100vw - 32px\), \$\{TASK_MODAL_MAX_WIDTH\}px\)`/)
    assert.match(taskModalSource, /maxWidth:\s*'calc\(100vw - 32px\)'/)
    assert.match(taskModalSource, /boxSizing:\s*'border-box'/)
    assert.match(taskModalSource, /overflowX:\s*'hidden'/)
    assert.match(taskModalSource, /data-task-modal-scroll-body="true"[\s\S]*style=\{\{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden', overflowY: 'auto'/)
  })

  it('task modal people section uses the same compact people display as board and task rows', () => {
    assert.match(taskBoardSource, /<TaskPeopleAvatarStack/)
    assert.match(editableTaskRowSource, /<TaskPeopleAvatarStack/)
    assert.match(taskModalHeaderSource, /<TaskPeopleField[\s\S]*compact[\s\S]*\/>/)
    assert.doesNotMatch(taskModalBodySource, /<TaskPeopleField/)
    assert.doesNotMatch(taskModalBodySource, /Click to add more people/)
  })

  it('task modal header remains the only editable task metadata surface', () => {
    assert.match(taskModalSource, /<TaskModalHeader/)
    assert.match(taskModalHeaderSource, /TaskPeopleField/)
    assert.match(taskModalHeaderSource, /saveTask\(\{ title: next \}\)/)
    assert.match(taskModalHeaderSource, /saveTask\(\{ priority: value \}\)/)
    assert.match(taskModalHeaderSource, /saveTask\(\{ dueDate: dueDate \|\| null \}\)/)
    assert.match(taskModalHeaderSource, /updateTaskLabels\(task\.id, labels\)/)
    assert.match(taskModalHeaderSource, /type tag and press Enter/)
    assert.match(taskModalHeaderSource, />tags<\/button>/)
    assert.match(taskModalHeaderSource, />due date<\/span>/)
  })

  it('task modal header is non-scrollable and its people menu overlays the detail body', () => {
    assert.match(taskModalSource, /overflow:\s*'hidden'/)
    assert.match(taskModalSource, /data-task-modal-scroll-body="true"/)
    assert.match(taskModalSource, /overflowY:\s*'auto'/)
    assert.match(taskModalSource, /<TaskModalHeader[\s\S]*<div data-task-modal-scroll-body="true"/)
    assert.match(taskModalHeaderSource, /data-task-modal-header="true"[\s\S]*position:\s*'relative'[\s\S]*zIndex:\s*20[\s\S]*overflow:\s*'visible'/)
    assert.match(taskModalHeaderSource, /<div data-task-modal-header-people="true"[\s\S]*position:\s*'relative'[\s\S]*zIndex:\s*30[\s\S]*overflow:\s*'visible'/)
  })
})
