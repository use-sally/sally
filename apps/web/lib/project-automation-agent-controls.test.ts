import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { shouldShowAgentIdentityControls, AGENT_IDENTITY_EMPTY_STATE, buildHermesNpxConnectCommand, copyHermesConnectCommandToClipboard } from './project-automation-display'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const automationPanelSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'project-automation-panel.tsx'), 'utf8')

test('project automation keeps named-agent routing hidden for the MVP', () => {
  assert.equal(shouldShowAgentIdentityControls([]), false)
  assert.equal(shouldShowAgentIdentityControls([{ id: 'agent_pm', name: 'PM', role: 'pm' }]), false)
  assert.match(AGENT_IDENTITY_EMPTY_STATE, /one connected local agent/i)
  assert.match(AGENT_IDENTITY_EMPTY_STATE, /internal workflow modes/i)
})

test('project automation builds public npx Hermes connector command for first-time users', () => {
  const command = buildHermesNpxConnectCommand({
    pairingCode: 'ABCD-EFGH',
    apiBaseUrl: 'https://api.sally.example',
    workspaceId: 'ws_123',
    workspaceSlug: 'acme',
  })

  assert.equal(command, 'npx sally-agent-connect hermes --pairing-code ABCD-EFGH --base-url https://api.sally.example --workspace-id ws_123 --workspace-slug acme')
})

test('project automation panel avoids fixed-width grids that cause horizontal overflow', () => {
  assert.match(automationPanelSource, /minWidth:\s*0/)
  assert.doesNotMatch(automationPanelSource, /gridTemplateColumns:\s*'120px 1fr 160px 90px'/)
  assert.doesNotMatch(automationPanelSource, /gridTemplateColumns:\s*'120px 90px 1fr 160px'/)
  assert.match(automationPanelSource, /repeat\(auto-fit, minmax\(min\(100%, 180px\), 1fr\)\)/)
})

test('project automation panel leaves task workflow visibility to the board', () => {
  assert.match(automationPanelSource, /One connected local agent runs a plan-first project workflow/i)
  assert.match(automationPanelSource, /creates or updates visible tasks, then works from those cards/i)
  assert.doesNotMatch(automationPanelSource, /Workflow visibility/)
  assert.doesNotMatch(automationPanelSource, /Working now/)
  assert.doesNotMatch(automationPanelSource, /Queued next/)
  assert.doesNotMatch(automationPanelSource, /No terminal\/process inspection required/)
})

test('project automation panel presents one-agent workflow instead of role-agent routing', () => {
  assert.match(automationPanelSource, /one connected local agent/i)
  assert.match(automationPanelSource, /role="switch"/)
  assert.match(automationPanelSource, /Agent disconnected/)
  assert.match(automationPanelSource, /Agent connected/)
  assert.match(automationPanelSource, /Start plan-first workflow/)
  assert.ok(automationPanelSource.indexOf('role="switch"') < automationPanelSource.indexOf('Start plan-first workflow'))
  assert.doesNotMatch(automationPanelSource, /Role mapping/)
  assert.doesNotMatch(automationPanelSource, /Default PM agent/)
  assert.doesNotMatch(automationPanelSource, /Start PM workflow/)
})

test('project automation opens connection instructions and uses a temporary clipboard popup', () => {
  assert.match(automationPanelSource, /connectionInstructionsOpen \? <div/)
  assert.match(automationPanelSource, /Agent connection instructions/)
  assert.match(automationPanelSource, /Connector command copied to clipboard/)
  assert.match(automationPanelSource, /window\.setTimeout\(\(\) => setToastMessage\(null\), 3500\)/)
  assert.match(automationPanelSource, /role="status" aria-live="polite"/)
})

test('project automation copies the generated Hermes connector command to clipboard', async () => {
  const writes: string[] = []
  const copied = await copyHermesConnectCommandToClipboard(
    'npx sally-agent-connect hermes --pairing-code ABCD-EFGH',
    { writeText: async (text: string) => { writes.push(text) } },
  )

  assert.equal(copied, true)
  assert.deepEqual(writes, ['npx sally-agent-connect hermes --pairing-code ABCD-EFGH'])
})

