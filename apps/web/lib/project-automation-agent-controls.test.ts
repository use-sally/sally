import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AGENT_RUNTIME_OPTIONS } from './agent-runtimes'
import { shouldShowAgentIdentityControls, AGENT_IDENTITY_EMPTY_STATE, buildAgentNpxConnectCommand, copyAgentConnectCommandToClipboard } from './project-automation-display'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const automationPanelSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'project-automation-panel.tsx'), 'utf8')
const projectPageSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'projects', '[projectId]', 'page.tsx'), 'utf8')
const automationControlsSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'project-automation-controls.tsx'), 'utf8')

test('project automation keeps named-agent routing hidden for the MVP', () => {
  assert.equal(shouldShowAgentIdentityControls([]), false)
  assert.equal(shouldShowAgentIdentityControls([{ id: 'agent_pm', name: 'PM', role: 'pm' }]), false)
  assert.match(AGENT_IDENTITY_EMPTY_STATE, /one connected local agent/i)
  assert.match(AGENT_IDENTITY_EMPTY_STATE, /internal workflow modes/i)
})

test('project automation builds public npx connector commands for supported agents', () => {
  const command = buildAgentNpxConnectCommand({
    runtime: 'hermes',
    pairingCode: 'ABCD-EFGH',
    apiBaseUrl: 'https://api.sally.example',
    workspaceId: 'ws_123',
    workspaceSlug: 'acme',
  })

  assert.equal(command, 'npx sally-agent-connect hermes --pairing-code ABCD-EFGH --base-url https://api.sally.example --workspace-id ws_123 --workspace-slug acme')
  assert.equal(buildAgentNpxConnectCommand({ runtime: 'hermes', pairingCode: 'ABCD-EFGH', background: true }), 'npx sally-agent-connect hermes --pairing-code ABCD-EFGH --background')
  assert.equal(buildAgentNpxConnectCommand({ runtime: 'codex', pairingCode: 'CODEX' }), 'npx sally-agent-connect codex --pairing-code CODEX')
  assert.equal(buildAgentNpxConnectCommand({ runtime: 'pi', pairingCode: 'PI' }), 'npx sally-agent-connect pi --pairing-code PI')
  assert.equal(buildAgentNpxConnectCommand({ runtime: 'openclaw', pairingCode: 'CLAW' }), 'npx sally-agent-connect openclaw --pairing-code CLAW')
  assert.equal(buildAgentNpxConnectCommand({ runtime: 'claude-code', pairingCode: 'CLAUDE' }), 'npx sally-agent-connect claude-code --pairing-code CLAUDE')
})

test('project automation panel avoids fixed-width grids that cause horizontal overflow', () => {
  assert.match(automationPanelSource, /minWidth:\s*0/)
  assert.doesNotMatch(automationPanelSource, /gridTemplateColumns:\s*'120px 1fr 160px 90px'/)
  assert.doesNotMatch(automationPanelSource, /gridTemplateColumns:\s*'120px 90px 1fr 160px'/)
  assert.match(automationPanelSource, /repeat\(auto-fit, minmax\(min\(100%, 180px\), 1fr\)\)/)
})

test('project automation panel leaves task workflow visibility to the board', () => {
  assert.match(automationPanelSource, /Sally uses one connected local agent for the MVP/i)
  assert.match(automationPanelSource, /create or update visible tasks → execute from those cards/i)
  assert.doesNotMatch(automationPanelSource, /Workflow visibility/)
  assert.doesNotMatch(automationPanelSource, /Working now/)
  assert.doesNotMatch(automationPanelSource, /Queued next/)
  assert.doesNotMatch(automationPanelSource, /No terminal\/process inspection required/)
})

test('project automation model explainer lives in the theme info flag beside the heading', () => {
  assert.match(automationPanelSource, /import \{ InfoFlag \} from '\.\/info-flag'/)
  assert.match(automationPanelSource, /const PLAN_FIRST_WORKFLOW_INFO = `Plan-first workflow model\nSally uses one connected local agent for the MVP\. Planning, building, review, and testing are internal workflow modes, not separate user-facing agents\.\nFirst step: audit project → create or update visible tasks → execute from those cards\.\nInternal modes: Planning → Building → Reviewing\/Testing → Done or Waiting for approval\/blocker\.\nLive actions approval: required · staging first: yes`/)
  assert.match(automationPanelSource, /<div style=\{automationPanelHeadingText\}>Agent automation<\/div>\s*<InfoFlag text=\{PLAN_FIRST_WORKFLOW_INFO\} align="left" \/>/)
  assert.doesNotMatch(automationPanelSource, /<div style=\{\{ border: '1px solid var\(--panel-border\)'[\s\S]*Plan-first workflow model/)
  assert.doesNotMatch(automationPanelSource, /<div>\{AGENT_IDENTITY_EMPTY_STATE\}<\/div>/)
})

test('project automation header uses text-only updated timestamp and yellow headings', () => {
  assert.match(automationPanelSource, /function formatUpdatedAt\(value: number \| null \| undefined\)/)
  assert.match(automationPanelSource, /Intl\.DateTimeFormat\('en-GB',[\s\S]*hour12:\s*false/)
  assert.match(automationPanelSource, /dataUpdatedAt \? <span style=\{automationUpdatedText\}>updated \{formatUpdatedAt\(dataUpdatedAt\)\}<\/span> : null/)
  assert.match(automationPanelSource, /const automationPanelHeadingText: CSSProperties = \{ fontWeight: 800, color: 'var\(--task-title\)' \}/)
  assert.match(automationPanelSource, /const automationSectionHeadingText: CSSProperties = \{ fontWeight: 750, color: 'var\(--task-title\)' \}/)
  assert.doesNotMatch(automationPanelSource, /One connected local agent runs a plan-first project workflow\. Sally first audits the project and creates or updates visible tasks, then works from those cards\. Auto-refreshes every 2s/)
  assert.doesNotMatch(automationPanelSource, /isFetching \? 'Syncing…' : 'Live'/)
  assert.doesNotMatch(automationPanelSource, /pill\(isFetching \? '#dbeafe'/)
})

test('project automation rows use compact state datetime role comment layout', () => {
  assert.match(automationPanelSource, /const automationRowGrid: CSSProperties = \{[\s\S]*gridTemplateColumns:\s*'max-content 170px 120px minmax\(0, 1fr\)'[\s\S]*alignItems:\s*'start'/)
  assert.match(automationPanelSource, /function automationStatusText\(color: string\): CSSProperties \{[\s\S]*fontWeight:\s*300[\s\S]*background:\s*'transparent'/)
  assert.match(automationPanelSource, /<span style=\{automationStatusText\(tone\)\}>\{job\.status\}<\/span>[\s\S]*<span style=\{automationDateText\}>\{formatTime\(job\.createdAt\)\}<\/span>[\s\S]*<span style=\{automationRoleText\}>\{workflowModeLabel\(job\.role\)\}<\/span>[\s\S]*<span style=\{automationCommentText\}>/)
  assert.match(automationPanelSource, /<span style=\{automationStatusText\(tone\)\}>\{run\.status\}<\/span>[\s\S]*<span style=\{automationDateText\}>\{formatTime\(run\.finishedAt \|\| run\.latestHeartbeatAt \|\| run\.startedAt \|\| run\.createdAt\)\}<\/span>[\s\S]*<span style=\{automationRoleText\}>\{workflowModeLabel\(run\.role\)\}<\/span>[\s\S]*<span style=\{automationCommentText\}>/)
  assert.doesNotMatch(automationPanelSource, /<span style=\{pill\(tone\[0\], tone\[1\]\)\}>\{job\.status\}<\/span>/)
  assert.doesNotMatch(automationPanelSource, /<span style=\{pill\(tone\[0\], tone\[1\]\)\}>\{run\.status\}<\/span>/)
})

test('project automation controls present one-agent workflow instead of role-agent routing', () => {
  assert.match(automationPanelSource, /one connected local agent/i)
  assert.match(automationControlsSource, /role="switch"/)
  assert.match(automationControlsSource, /AgentRuntimePicker/)
  assert.match(automationControlsSource, /Connect \$\{getAgentRuntimeOption\(selectedRuntime\)\.label\}/)
  assert.match(automationControlsSource, /getAgentRuntimeOption\(activeConnection\.runtimeType\)\.label/)
  assert.deepEqual(AGENT_RUNTIME_OPTIONS.map((runtime) => runtime.id), ['hermes', 'codex', 'pi', 'openclaw', 'claude-code'])
  assert.match(automationControlsSource, /workflowControl\.label/)
  assert.ok(automationControlsSource.indexOf('role="switch"') < automationControlsSource.indexOf('workflowControl.label'))
  assert.doesNotMatch(automationPanelSource, /Role mapping/)
  assert.doesNotMatch(automationPanelSource, /Default PM agent/)
  assert.doesNotMatch(automationPanelSource, /Start PM workflow/)
})

test('project automation controls live beside project island tabs, outside island bodies', () => {
  assert.match(projectPageSource, /data-project-island-toolbar="true"/)
  assert.match(projectPageSource, /<ProjectTabs projectId=\{projectId\} current=\{currentView\} \/>[\s\S]*data-project-workflow-toolbar="true"[\s\S]*<ProjectAutomationControls projectId=\{projectId\} canManage=\{workflowDecision\.allowed\} compact \/>/)
  assert.doesNotMatch(projectPageSource, /Project workflow/)
  assert.doesNotMatch(projectPageSource, /Project-level automation status/)
  assert.doesNotMatch(automationPanelSource, /<button type="button" role="switch"/)
  assert.doesNotMatch(automationPanelSource, /Plan & start workflow/)
  assert.match(automationControlsSource, /workflowControl\.label/)
})

test('project automation control success states use toast instead of inline messages', () => {
  assert.match(automationControlsSource, /showToast\(\{ kind: 'message', text: `Queued audit\/planning job/)
  assert.match(automationControlsSource, /showToast\(\{ kind: 'message', text: cleared > 0 \? `Agent disconnected\. Cleared \$\{cleared\} queued or running workflow item/)
  assert.match(automationControlsSource, /window\.setTimeout\(\(\) => \{\s*setToast\(null\)\s*setAgentPrerequisiteHighlight\(false\)\s*\}, 3500\)/)
  assert.match(automationControlsSource, /role="status" aria-live="polite"/)
  assert.doesNotMatch(automationControlsSource, /const \[message, setMessage\]/)
  assert.doesNotMatch(automationControlsSource, /\{message \? <div/)
})

test('disconnecting a connected agent requires an implications modal before clearing work', () => {
  assert.match(automationControlsSource, /const \[disconnectModalOpen, setDisconnectModalOpen\] = useState\(false\)/)
  assert.match(automationControlsSource, /const hasActiveWorkflowWork = hasRunningWorkflowWork\(\{ jobs, runs \}\)/)
  assert.match(automationControlsSource, /setDisconnectModalOpen\(true\)/)
  assert.match(automationControlsSource, /function AgentDisconnectModal/)
  assert.match(automationControlsSource, /data-agent-disconnect-modal="true"/)
  assert.match(automationControlsSource, /role="dialog" aria-modal="true"/)
  assert.match(automationControlsSource, /Disconnect agent and clear queue\?/)
  assert.match(automationControlsSource, /Queued workflow jobs will be cancelled/)
  assert.match(automationControlsSource, /Running workflow work will be marked cancelled/)
  assert.match(automationControlsSource, /await revokeAgentConnection\(activeConnection\.id, \{ clearQueue: true \}\)/)
  assert.match(automationControlsSource, /setDisconnectModalOpen\(false\)/)
})

test('agent connector instructions close automatically once an agent is connected', () => {
  assert.match(automationControlsSource, /useEffect\(\(\) => \{\s*if \(activeConnection && connectorModal\) \{\s*setConnectorModal\(null\)\s*setPairingCode\(null\)\s*\}\s*\}, \[activeConnection, connectorModal\]\)/)
})

test('agent connector instructions render in a focus modal instead of a toast', () => {
  assert.match(automationControlsSource, /const \[connectorModal, setConnectorModal\] = useState<AgentConnectorModalState \| null>\(null\)/)
  assert.match(automationControlsSource, /pairingCommand: command,[\s\S]*foregroundCommand,[\s\S]*copied,/)
  assert.match(automationControlsSource, /function AgentConnectorModal/)
  assert.match(automationControlsSource, /role="dialog" aria-modal="true"/)
  assert.match(automationControlsSource, /data-agent-connector-modal="true"/)
  assert.match(automationControlsSource, /\{getAgentRuntimeOption\(modal\.runtime\)\.label\} connection instructions/)
  assert.match(automationControlsSource, /<pre style=\{modalCommandBlock\}><code>\{modal\.pairingCommand\}<\/code><\/pre>/)
  assert.match(automationControlsSource, /Background runner/)
  assert.match(automationControlsSource, /Debug\/foreground mode:/)
  assert.match(automationControlsSource, /modal\.foregroundCommand/)
  assert.doesNotMatch(automationControlsSource, /kind: 'connector'/)
  assert.doesNotMatch(automationControlsSource, /connectorToastStyle/)
  assert.doesNotMatch(automationControlsSource, /toastCommandBlock/)
  assert.doesNotMatch(automationControlsSource, /connectionInstructionsOpen/)
  assert.doesNotMatch(automationControlsSource, /const connectionBox/)
  assert.doesNotMatch(automationControlsSource, /const commandBlock/)
})

test('plan and start workflow is the one-click automation entrypoint and gates on a connected agent', () => {
  assert.doesNotMatch(automationControlsSource, /handleAutomationToggle/)
  assert.doesNotMatch(automationControlsSource, /Automation enabled/)
  assert.doesNotMatch(automationControlsSource, /Automation disabled/)
  assert.doesNotMatch(automationControlsSource, /disabled=\{!canManage \|\| starting \|\| !workflowEnabled\}/)
  assert.match(automationControlsSource, /if \(!activeConnection\) \{[\s\S]*showToast\(\{ kind: 'message', text: 'Connect agent first\.' \}\)[\s\S]*setAgentPrerequisiteHighlight\(true\)[\s\S]*return[\s\S]*\}/)
  assert.match(automationControlsSource, /if \(!workflowEnabled\) \{\s*await updateProjectAutomation\(projectId, \{ workflowEnabled: true \}\)\s*\}/)
  assert.match(automationControlsSource, /const result = await startProjectWorkflow\(projectId\)/)
  assert.match(automationControlsSource, /style=\{automationIslandControlStyle\(connectionToggleOn, agentPrerequisiteHighlight\)\}/)
})

test('workflow start control matches agent island style and reports current workflow state', () => {
  assert.match(automationControlsSource, /function getWorkflowControlState\(/)
  assert.match(automationControlsSource, /const workflowControl = getWorkflowControlState\(\{ jobs, runs, blockers, approvalRequests, activeConnection, workflowEnabled, starting \}\)/)
  assert.match(automationControlsSource, /job\.status === 'RUNNING' \|\| job\.status === 'CLAIMED'/)
  assert.match(automationControlsSource, /job\.status === 'QUEUED'/)
  assert.match(automationControlsSource, /approvalRequests\.some\(\(approval\) => approval\.status === 'PENDING'\)/)
  assert.match(automationControlsSource, /blockers\.some\(\(blocker\) => blocker\.status === 'OPEN'\)/)
  assert.match(automationControlsSource, /workflowControl\.label/)
  assert.match(automationControlsSource, /style=\{automationIslandControlStyle\(workflowControl\.active\)\}/)
  assert.doesNotMatch(automationControlsSource, /style=\{primaryButton\(true\)\}>\{starting \? 'Starting…' : 'Plan & start workflow'\}/)
})

test('project automation toggles use island switcher styling instead of toggle pills', () => {
  assert.match(automationControlsSource, /function automationIslandControlStyle\(active: boolean, danger = false\)/)
  assert.match(automationControlsSource, /padding:\s*'10px 14px'/)
  assert.match(automationControlsSource, /borderRadius:\s*12/)
  assert.match(automationControlsSource, /fontWeight:\s*400/)
  assert.match(automationControlsSource, /background:\s*active \? 'rgba\(16, 185, 129, 0\.10\)' : 'var\(--form-bg\)'/)
  assert.match(automationControlsSource, /border:\s*danger \? '1px solid var\(--danger-text\)' : active \? '1px solid var\(--form-border-focus\)' : '1px solid var\(--form-border\)'/)
  assert.doesNotMatch(automationControlsSource, /toggleKnob/)
  const automationControlStyle = automationControlsSource.match(/function automationIslandControlStyle\(active: boolean, danger = false\): CSSProperties \{[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(automationControlStyle, /#dcfce7/)
  assert.doesNotMatch(automationControlStyle, /fontWeight:\s*800/)
})

test('project automation copies the generated agent connector command to clipboard', async () => {
  const writes: string[] = []
  const copied = await copyAgentConnectCommandToClipboard(
    'npx sally-agent-connect codex --pairing-code ABCD-EFGH',
    { writeText: async (text: string) => { writes.push(text) } },
  )

  assert.equal(copied, true)
  assert.deepEqual(writes, ['npx sally-agent-connect codex --pairing-code ABCD-EFGH'])
})

