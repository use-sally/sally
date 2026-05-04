import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRuntimePrompt,
  buildRuntimeConfigFromEnv,
  classifyRuntimeResult,
  createRuntimeAdapters,
  planRuntimeExecution,
  sanitizeRuntimeSummary,
  selectRuntimeAdapter,
} from './runtime-adapters.js'

const job = {
  id: 'job_123',
  projectId: 'project_123',
  taskId: 'task_123',
  role: 'coder',
  mode: 'workflow',
  triggerType: 'sally_ui',
  payload: {
    taskTitle: 'Implement connector adapter foundation',
    taskSummary: 'Add bounded local runtime adapter support.',
    requiredCapabilities: ['code', 'git'],
    preferredRuntimeType: 'claude_code',
    repoPath: '/workspace/project-alpha',
  },
}

test('runtime config normalizes enabled local coding agents and rejects secret-like fields', () => {
  const config = buildRuntimeConfigFromEnv({
    SALLY_RUNTIME_CONFIG: JSON.stringify({
      runtimes: {
        hermes: { enabled: true, command: 'hermes', profiles: { coder: 'generic-coder' }, allowedRepoPaths: ['/workspace'] },
        claude_code: { enabled: true, command: 'claude', allowedRepoPaths: ['/workspace'], defaultArgs: ['--max-turns', '5'] },
      },
    }),
  })

  assert.equal(config.runtimes.hermes?.enabled, true)
  assert.equal(config.runtimes.claude_code?.command, 'claude')
  assert.deepEqual(config.runtimes.hermes?.allowedRepoPaths, ['/workspace'])
  assert.throws(() => buildRuntimeConfigFromEnv({ SALLY_RUNTIME_CONFIG: JSON.stringify({ token: 'nope' }) }), /secret-like/i)
})

test('adapter selection respects preferred runtime, capabilities, and repo allowlist', () => {
  const adapters = createRuntimeAdapters()
  const config = buildRuntimeConfigFromEnv({
    SALLY_RUNTIME_CONFIG: JSON.stringify({
      runtimes: {
        hermes: { enabled: true, command: 'hermes', capabilities: ['pm'], allowedRepoPaths: ['/workspace'] },
        claude_code: { enabled: true, command: 'claude', capabilities: ['code', 'git'], allowedRepoPaths: ['/workspace'] },
      },
    }),
  })

  const selected = selectRuntimeAdapter({ adapters, config, job })

  assert.equal(selected?.id, 'claude_code')
  assert.equal(selectRuntimeAdapter({ adapters, config, job: { ...job, payload: { ...job.payload, repoPath: '/private/project-alpha' } } }), null)
})

test('command plans are safe argv arrays for supported coding runtimes', () => {
  const config = buildRuntimeConfigFromEnv({
    SALLY_RUNTIME_CONFIG: JSON.stringify({
      runtimes: {
        hermes: { enabled: true, command: 'hermes', profiles: { coder: 'generic-coder' }, allowedRepoPaths: ['/workspace'], defaultArgs: [] },
        claude_code: { enabled: true, command: 'claude', allowedRepoPaths: ['/workspace'] },
        codex: { enabled: true, command: 'codex', allowedRepoPaths: ['/workspace'] },
        opencode: { enabled: true, command: 'opencode', allowedRepoPaths: ['/workspace'] },
        openclaw: { enabled: true, command: 'openclaw', allowedRepoPaths: ['/workspace'] },
        aider: { enabled: true, command: 'aider', allowedRepoPaths: ['/workspace'] },
      },
    }),
  })

  const runtimeIds = ['hermes', 'claude_code', 'codex', 'opencode', 'openclaw', 'aider'] as const
  for (const runtimeId of runtimeIds) {
    const plan = planRuntimeExecution({ runtimeId, config, job: { ...job, payload: { ...job.payload, preferredRuntimeType: runtimeId } } })
    assert.equal(plan.workdir, '/workspace/project-alpha')
    assert.equal(plan.argv.some((arg) => arg.includes(';') || arg.includes('&&')), false)
    assert.equal(plan.prompt.includes('job_123'), true)
  }

  const hermesPlan = planRuntimeExecution({ runtimeId: 'hermes', config, job: { ...job, payload: { ...job.payload, preferredRuntimeType: 'hermes' } } })
  assert.deepEqual(hermesPlan.argv.slice(0, 6), ['hermes', '--profile', 'generic-coder', 'chat', '--quiet', '-q'])
  assert.equal(hermesPlan.argv.includes('--quiet'), true)
  assert.equal(hermesPlan.timeoutMs, 30 * 60 * 1000)
  assert.deepEqual(planRuntimeExecution({ runtimeId: 'claude_code', config, job }).argv.slice(0, 2), ['claude', '-p'])
  assert.deepEqual(planRuntimeExecution({ runtimeId: 'codex', config, job: { ...job, payload: { ...job.payload, preferredRuntimeType: 'codex' } } }).argv.slice(0, 2), ['codex', 'exec'])
  assert.deepEqual(planRuntimeExecution({ runtimeId: 'opencode', config, job: { ...job, payload: { ...job.payload, preferredRuntimeType: 'opencode' } } }).argv.slice(0, 2), ['opencode', 'run'])
})

test('runtime prompt is structured and does not contain secret-like metadata values', () => {
  const prompt = buildRuntimePrompt({ ...job, payload: { ...job.payload, metadata: { apiToken: 'should-not-pass' } } })

  assert.match(prompt, /Sally assigned a bounded agent job/)
  assert.match(prompt, /job_123/)
  assert.match(prompt, /Respond with a concise final summary/)
  assert.doesNotMatch(prompt, /should-not-pass/)
  assert.doesNotMatch(prompt, /apiToken/)
})

test('runtime prompt gives local Sally context needed to work current project tasks', () => {
  const prompt = buildRuntimePrompt({
    ...job,
    workspaceId: 'workspace_123',
    role: 'pm',
    taskId: null,
    payload: { preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /workspaceId/)
  assert.match(prompt, /workspace_123/)
  assert.match(prompt, /current project/)
  assert.match(prompt, /SALLY_API_BASE_URL/)
  assert.match(prompt, /SALLY_API_KEY/)
})

test('pm workflow prompt orchestrates architect first instead of merely moving a task stage', () => {
  const prompt = buildRuntimePrompt({
    id: 'job_pm_1',
    workspaceId: 'workspace_123',
    projectId: 'project_123',
    taskId: null,
    role: 'pm',
    mode: 'workflow',
    payload: { action: 'start_project_workflow', preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /PM orchestration/i)
  assert.match(prompt, /architect/i)
  assert.match(prompt, /POST \/agent-jobs/)
  assert.match(prompt, /Do not treat moving a task to In Progress as sufficient/i)
})

test('pm workflow prompt exposes top-level workflow metadata for child-role routing', () => {
  const prompt = buildRuntimePrompt({
    id: 'job_pm_2',
    workspaceId: 'workspace_123',
    projectId: 'project_123',
    taskId: null,
    role: 'pm',
    mode: 'workflow',
    workflowRunId: 'workflow_123',
    workflowStep: 3,
    payload: { preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /"workflowRunId": "workflow_123"/)
  assert.match(prompt, /"workflowStep": 3/)
})

test('pm workflow prompt applies task-handling playbook additions', () => {
  const prompt = buildRuntimePrompt({
    id: 'job_pm_playbook',
    workspaceId: 'workspace_123',
    projectId: 'project_123',
    taskId: 'task_123',
    role: 'pm',
    mode: 'workflow',
    payload: { preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /task-handling-playbook\.md/)
  assert.match(prompt, /Mandatory PM orientation loop/i)
  assert.match(prompt, /live Sally task/i)
  assert.match(prompt, /playbook stage/i)
  assert.match(prompt, /Required PM routing comment/i)
  assert.match(prompt, /Current playbook stage:/)
  assert.match(prompt, /Role selection rule/i)
  assert.match(prompt, /staleness guard/i)
})

test('specialist prompts require playbook handoff evidence and bounded scope', () => {
  const prompt = buildRuntimePrompt({
    id: 'job_coder_playbook',
    workspaceId: 'workspace_123',
    projectId: 'project_123',
    taskId: 'task_123',
    role: 'coder',
    mode: 'workflow',
    payload: { preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /Required specialist handoff comment/i)
  assert.match(prompt, /Role handoff/)
  assert.match(prompt, /Evidence:/)
  assert.match(prompt, /Recommended next role:/)
  assert.match(prompt, /bounded assignment/i)
})

test('architect workflow prompt plans the project and hands back to PM without building', () => {
  const prompt = buildRuntimePrompt({
    id: 'job_architect_1',
    workspaceId: 'workspace_123',
    projectId: 'project_123',
    taskId: null,
    role: 'architect',
    mode: 'workflow',
    payload: { preferredRuntimeType: 'hermes' },
  } as any)

  assert.match(prompt, /Architecture planning role/i)
  assert.match(prompt, /do not implement/i)
  assert.match(prompt, /queue.*pm/i)
  assert.match(prompt, /payload\.instructions/i)
  assert.match(prompt, /source architect job id/i)
  assert.match(prompt, /task breakdown/i)
})

test('runtime summaries are bounded and redact obvious secret-like values', () => {
  const summary = sanitizeRuntimeSummary('ok\nAPI_TOKEN=abc123456789\npassword: hunter2\n' + 'x'.repeat(6000))

  assert.match(summary, /\[REDACTED\]/)
  assert.doesNotMatch(summary, /hunter2/)
  assert.equal(summary.length <= 4000, true)
})

test('runtime summaries strip Hermes CLI banner noise before saving to Sally', () => {
  const summary = sanitizeRuntimeSummary([
    '╭──────────── Hermes Agent v0.11.0 (2026.4.23) · upstream 810d98e8 ────────────╮',
    '│                                   Available Tools                            │',
    '│  browser: browser_back, browser_click, ...                                    │',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    '    Completed the Sally job.',
    '    Evidence: tests passed.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
  ].join('\n'))

  assert.doesNotMatch(summary, /Hermes Agent v/)
  assert.doesNotMatch(summary, /Available Tools/)
  assert.doesNotMatch(summary, /╭─ ⚕ Hermes/)
  assert.match(summary, /Completed the Sally job/)
  assert.match(summary, /Evidence: tests passed/)
})

test('runtime result classification distinguishes success, blocker, approval, and failure', () => {
  assert.deepEqual(classifyRuntimeResult({ exitCode: 0, summary: 'Implemented and tested.' }).status, 'SUCCEEDED')
  assert.deepEqual(classifyRuntimeResult({ exitCode: 0, summary: 'BLOCKER: missing staging credentials.' }).status, 'BLOCKED')
  assert.deepEqual(classifyRuntimeResult({ exitCode: 0, summary: 'APPROVAL_REQUIRED: production deployment needs approval.' }).status, 'BLOCKED')
  assert.deepEqual(classifyRuntimeResult({ exitCode: 0, summary: 'banner\n    BLOCKER: project not accessible.' }).status, 'BLOCKED')
  assert.deepEqual(classifyRuntimeResult({ exitCode: 2, summary: 'Tool failed.' }).status, 'FAILED')
})
