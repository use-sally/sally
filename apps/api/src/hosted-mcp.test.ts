import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHostedMcpAgentJobCreatePayload,
  buildHostedMcpAgentJobUpdatePayload,
  buildHostedMcpAgentRunCreatePayload,
  buildHostedMcpAgentRunUpdatePayload,
  buildHostedMcpTaskCreatePayload,
  buildHostedMcpTaskUpdatePayload,
} from './hosted-mcp.js'

test('buildHostedMcpTaskCreatePayload preserves canonical and legacy task people fields', () => {
  const payload = buildHostedMcpTaskCreatePayload({
    projectId: 'proj_123',
    title: 'Ship rollout',
    owner: 'alex@example.com',
    participants: ['bea@example.com'],
    assignee: 'alex@example.com',
    collaborators: ['bea@example.com'],
    description: 'desc',
    priority: 'P1',
  })

  assert.deepEqual(payload, {
    projectId: 'proj_123',
    title: 'Ship rollout',
    owner: 'alex@example.com',
    participants: ['bea@example.com'],
    assignee: 'alex@example.com',
    collaborators: ['bea@example.com'],
    description: 'desc',
    priority: 'P1',
  })
})

test('buildHostedMcpTaskUpdatePayload preserves canonical task people fields without dropping empty participant arrays', () => {
  const payload = buildHostedMcpTaskUpdatePayload({
    owner: 'alex@example.com',
    participants: [],
    dueDate: null,
  })

  assert.deepEqual(payload, {
    owner: 'alex@example.com',
    participants: [],
    dueDate: null,
  })
})

test('buildHostedMcpAgentJobCreatePayload preserves workflow metadata and payload', () => {
  const payload = buildHostedMcpAgentJobCreatePayload({
    projectId: 'proj_123',
    taskId: 'task_123',
    agentId: 'agent_123',
    role: 'pm',
    mode: 'project-workflow',
    triggerType: 'mcp',
    workflowRunId: 'run_abc',
    workflowStep: 2,
    maxSteps: 8,
    payload: { capabilityRefs: ['gmail-readonly'] },
  })

  assert.deepEqual(payload, {
    projectId: 'proj_123',
    taskId: 'task_123',
    agentId: 'agent_123',
    role: 'pm',
    mode: 'project-workflow',
    triggerType: 'mcp',
    workflowRunId: 'run_abc',
    workflowStep: 2,
    maxSteps: 8,
    payload: { capabilityRefs: ['gmail-readonly'] },
  })
})

test('buildHostedMcpAgentJobUpdatePayload omits undefined values but preserves null error and payload', () => {
  const payload = buildHostedMcpAgentJobUpdatePayload({
    status: 'SUCCEEDED',
    error: null,
    payload: { evidenceUrl: 'file:///tmp/evidence.md' },
  })

  assert.deepEqual(payload, {
    status: 'SUCCEEDED',
    error: null,
    payload: { evidenceUrl: 'file:///tmp/evidence.md' },
  })
})

test('buildHostedMcpAgentRunCreatePayload preserves safe execution metadata', () => {
  const payload = buildHostedMcpAgentRunCreatePayload({
    jobId: 'job_123',
    agentId: 'agent_123',
    projectId: 'proj_123',
    taskId: 'task_123',
    role: 'tester',
    status: 'RUNNING',
    triggerType: 'mcp',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    summary: 'Started checkout verification.',
    logUrl: 'file:///tmp/run.log',
    evidenceUrl: 'file:///tmp/evidence.md',
    metadata: { workflowStep: 'tester' },
  })

  assert.deepEqual(payload, {
    jobId: 'job_123',
    agentId: 'agent_123',
    projectId: 'proj_123',
    taskId: 'task_123',
    role: 'tester',
    status: 'RUNNING',
    triggerType: 'mcp',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    summary: 'Started checkout verification.',
    logUrl: 'file:///tmp/run.log',
    evidenceUrl: 'file:///tmp/evidence.md',
    metadata: { workflowStep: 'tester' },
  })
})

test('buildHostedMcpAgentRunUpdatePayload preserves nullable fields for clearing safe references', () => {
  const payload = buildHostedMcpAgentRunUpdatePayload({
    status: 'BLOCKED',
    summary: 'Waiting for credentials.',
    error: null,
    logUrl: null,
    evidenceUrl: null,
    metadata: { blockerType: 'credential' },
  })

  assert.deepEqual(payload, {
    status: 'BLOCKED',
    summary: 'Waiting for credentials.',
    error: null,
    logUrl: null,
    evidenceUrl: null,
    metadata: { blockerType: 'credential' },
  })
})
