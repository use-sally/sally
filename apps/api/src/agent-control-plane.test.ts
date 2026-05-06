import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_JOB_STATUSES,
  AGENT_RUN_STATUSES,
  APPROVAL_TYPES,
  BLOCKER_TYPES,
  WORKFLOW_STAGES,
  assertNoSecretLikeJson,
  findSecretLikeJsonPath,
  buildProjectAutomationPatch,
  buildStartProjectWorkflowJobPayload,
  normalizeAgentRole,
  normalizeCapabilityNames,
  normalizeHermesProfile,
  normalizeWorkflowStage,
} from './agent-control-plane.js'

test('normalizeWorkflowStage accepts known stages and defaults to intake', () => {
  assert.equal(normalizeWorkflowStage('execution'), 'EXECUTION')
  assert.equal(normalizeWorkflowStage('Approval Needed'), 'APPROVAL_NEEDED')
  assert.equal(normalizeWorkflowStage(''), 'INTAKE')
  assert.equal(normalizeWorkflowStage(undefined), 'INTAKE')
})

test('normalizeWorkflowStage rejects unknown stages', () => {
  assert.throws(() => normalizeWorkflowStage('ship-it'), /Unknown workflow stage/)
})

test('normalizeAgentRole stores stable lowercase role identifiers', () => {
  assert.equal(normalizeAgentRole(' PM '), 'pm')
  assert.equal(normalizeAgentRole('Code Reviewer'), 'code-reviewer')
  assert.equal(normalizeAgentRole('infra_ops'), 'infra-ops')
})

test('normalizeAgentRole rejects empty or invalid roles', () => {
  assert.throws(() => normalizeAgentRole(''), /role is required/)
  assert.throws(() => normalizeAgentRole('!!!'), /role is required/)
})

test('normalizeHermesProfile stores optional profile slugs safely', () => {
  assert.equal(normalizeHermesProfile(' project-alpha '), 'project-alpha')
  assert.equal(normalizeHermesProfile('Project Alpha PM'), 'project-alpha-pm')
  assert.equal(normalizeHermesProfile(undefined), null)
})

test('normalizeCapabilityNames trims, lowercases, slugifies, and deduplicates', () => {
  assert.deepEqual(
    normalizeCapabilityNames([' Gmail Readonly ', 'gmail_readonly', '', 'WP SSH', 'wp ssh']),
    ['gmail-readonly', 'wp-ssh'],
  )
})

test('control-plane constants expose the initial Sally-native vocabulary', () => {
  assert.deepEqual(WORKFLOW_STAGES, [
    'INTAKE',
    'PLANNING',
    'ARCHITECTURE',
    'EXECUTION',
    'REVIEW',
    'TESTING',
    'REWORK',
    'APPROVAL_NEEDED',
    'BLOCKED',
    'DEPLOYMENT',
    'DONE',
  ])
  assert.ok(AGENT_JOB_STATUSES.includes('QUEUED'))
  assert.ok(AGENT_RUN_STATUSES.includes('RUNNING'))
  assert.ok(APPROVAL_TYPES.includes('LIVE_DEPLOY'))
  assert.ok(BLOCKER_TYPES.includes('CREDENTIAL'))
})

test('secret-like JSON keys are rejected before storing automation metadata', () => {
  assert.equal(findSecretLikeJsonPath({ capabilityRefs: ['gmail-readonly'] }), null)
  assert.equal(findSecretLikeJsonPath({ nested: [{ apiToken: '[REDACTED]' }] }), '$.nested[0].apiToken')
  assert.throws(() => assertNoSecretLikeJson({ smtpPassword: '[REDACTED]' }, 'payload'), /payload must not contain secret-like key/)
})

test('buildProjectAutomationPatch normalizes project automation settings and rejects secret-like metadata', () => {
  assert.deepEqual(buildProjectAutomationPatch({
    workflowEnabled: true,
    defaultPmAgentId: 'agent_pm',
    roleAgents: { PM: 'agent_pm', 'Code Reviewer': 'agent_review' },
    baselineTaskIds: [' task_1 ', '', 'task_2'],
    requiredCapabilities: [' Gmail Readonly ', 'gmail_readonly', 'WP SSH'],
    liveActionsRequireApproval: false,
    stagingFirst: true,
    currentStage: 'approval needed',
    nextRole: ' Code Reviewer ',
    automationState: 'Running',
    metadata: { source: 'ui' },
  }), {
    workflowEnabled: true,
    defaultPmAgentId: 'agent_pm',
    roleAgents: { pm: 'agent_pm', 'code-reviewer': 'agent_review' },
    baselineTaskIds: ['task_1', 'task_2'],
    requiredCapabilities: ['gmail-readonly', 'wp-ssh'],
    liveActionsRequireApproval: false,
    stagingFirst: true,
    currentStage: 'APPROVAL_NEEDED',
    nextRole: 'code-reviewer',
    automationState: 'running',
    metadata: { source: 'ui' },
  })
  assert.throws(() => buildProjectAutomationPatch({ metadata: { apiKey: '[REDACTED]' } }), /automation metadata must not contain secret-like key/)
})

test('buildStartProjectWorkflowJobPayload creates a safe first PM workflow job payload', () => {
  const payload = buildStartProjectWorkflowJobPayload({ projectId: 'project_1', pmAgentId: 'agent_pm', workflowRunId: 'run_1' })
  assert.deepEqual(payload, {
    projectId: 'project_1',
    agentId: 'agent_pm',
    role: 'pm',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: 'run_1',
    workflowStep: 1,
    maxSteps: 30,
    payload: {
      source: 'sally_ui',
      action: 'audit_and_plan_project',
      planningFirst: true,
      instructions: 'First audit the project and existing tasks, create or update a coherent visible Sally task plan, then start work only from those visible tasks. Do not begin private implementation before the task plan exists.',
    },
  })
})
