import test from 'node:test'
import assert from 'node:assert/strict'

import { runOneConnectedAgentEvent, runOneQueuedAgentJob } from './local-sally-worker.js'
import { buildRuntimeConfigFromEnv } from './runtime-adapters.js'

test('runOneQueuedAgentJob claims one queued job, creates a run, heartbeats, and marks both succeeded', async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const job = {
    id: 'job_1',
    projectId: 'project_1',
    taskId: null,
    agentId: null,
    role: 'pm',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: 'workflow_1',
    workflowStep: 1,
  }
  const run = { id: 'run_1' }
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'GET' && path === '/agent-jobs?status=QUEUED') return [job]
      if (method === 'POST' && path === '/agent-jobs/job_1/claim') return { ok: true, job: { ...job, status: 'CLAIMED' } }
      if (method === 'POST' && path === '/agent-runs') return { ok: true, run }
      if (method === 'POST' && path === '/agent-runs/run_1/heartbeat') return { ok: true }
      if (method === 'PATCH' && path === '/agent-runs/run_1') return { ok: true, run: { ...run, status: 'SUCCEEDED' } }
      if (method === 'PATCH' && path === '/agent-jobs/job_1') return { ok: true, job: { ...job, status: 'SUCCEEDED' } }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }

  const result = await runOneQueuedAgentJob({ client, workerName: 'local-hermes-smoke', resultSummary: 'dummy ok' })

  assert.equal(result.status, 'completed')
  assert.equal(result.jobId, 'job_1')
  assert.equal(result.runId, 'run_1')
  assert.deepEqual(calls, [
    { method: 'GET', path: '/agent-jobs?status=QUEUED', body: undefined },
    { method: 'POST', path: '/agent-jobs/job_1/claim', body: { agentId: null } },
    { method: 'POST', path: '/agent-runs', body: { projectId: 'project_1', taskId: null, jobId: 'job_1', agentId: null, role: 'pm', status: 'RUNNING', triggerType: 'local-hermes-smoke', workflowRunId: 'workflow_1', workflowStep: 1, summary: 'Dummy Hermes worker started job job_1.', metadata: { mode: 'dummy', workerName: 'local-hermes-smoke' } } },
    { method: 'POST', path: '/agent-runs/run_1/heartbeat', body: undefined },
    { method: 'PATCH', path: '/agent-runs/run_1', body: { status: 'SUCCEEDED', summary: 'dummy ok', metadata: { mode: 'dummy', workerName: 'local-hermes-smoke', completed: true } } },
    { method: 'PATCH', path: '/agent-jobs/job_1', body: { status: 'SUCCEEDED', payload: { source: 'local-hermes-smoke', result: 'dummy ok', runId: 'run_1' } } },
  ])
})

test('runOneQueuedAgentJob returns idle when no queued job exists', async () => {
  const client = {
    async request(method: string, path: string) {
      assert.equal(method, 'GET')
      assert.equal(path, '/agent-jobs?status=QUEUED')
      return []
    },
  }

  const result = await runOneQueuedAgentJob({ client, workerName: 'local-hermes-smoke' })

  assert.deepEqual(result, { status: 'idle' })
})

test('runOneQueuedAgentJob uses a configured runtime adapter instead of dummy completion', async () => {
  const calls: Array<{ method: string; path: string; body?: any }> = []
  const executions: any[] = []
  const job = {
    id: 'job_runtime_1',
    projectId: 'project_1',
    taskId: 'task_1',
    agentId: null,
    role: 'coder',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: 'workflow_1',
    workflowStep: 2,
    payload: {
      taskTitle: 'Implement generic adapter foundation',
      taskSummary: 'Bounded local code runtime execution.',
      preferredRuntimeType: 'claude_code',
      requiredCapabilities: ['code', 'git'],
      repoPath: '/workspace/project-alpha',
    },
  }
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'GET' && path === '/agent-jobs?status=QUEUED') return [job]
      if (method === 'POST' && path === '/agent-jobs/job_runtime_1/claim') return { ok: true, job: { ...job, status: 'CLAIMED' } }
      if (method === 'POST' && path === '/agent-runs') return { ok: true, run: { id: 'run_runtime_1' } }
      if (method === 'POST' && path === '/agent-runs/run_runtime_1/heartbeat') return { ok: true }
      if (method === 'PATCH' && path === '/agent-runs/run_runtime_1') return { ok: true }
      if (method === 'PATCH' && path === '/agent-jobs/job_runtime_1') return { ok: true }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }
  const runtimeConfig = buildRuntimeConfigFromEnv({
    SALLY_RUNTIME_CONFIG: JSON.stringify({ runtimes: { claude_code: { enabled: true, command: 'claude', allowedRepoPaths: ['/workspace'], capabilities: ['code', 'git'] } } }),
  })

  const result = await runOneQueuedAgentJob({
    client,
    workerName: 'runtime-worker',
    runtimeConfig,
    executeRuntimePlan: async (plan) => {
      executions.push(plan)
      return { exitCode: 0, summary: `runtime ok via ${plan.runtimeId}` }
    },
  })

  assert.deepEqual(result, { status: 'completed', jobId: 'job_runtime_1', runId: 'run_runtime_1' })
  assert.equal(executions[0].runtimeId, 'claude_code')
  assert.deepEqual(executions[0].argv.slice(0, 2), ['claude', '-p'])
  assert.equal(calls.find((call) => call.method === 'POST' && call.path === '/agent-runs')?.body.metadata.mode, 'runtime')
  assert.equal(calls.find((call) => call.method === 'PATCH' && call.path === '/agent-runs/run_runtime_1')?.body.summary, 'runtime ok via claude_code')
})

test('runOneQueuedAgentJob marks Hermes blocker and approval output as blocked metadata', async () => {
  const patches: Array<{ path: string; body: any }> = []
  const created: Array<{ path: string; body: any }> = []
  const job = {
    id: 'job_blocked_1',
    projectId: 'project_1',
    taskId: 'task_1',
    agentId: null,
    role: 'coder',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: 'workflow_1',
    workflowStep: 3,
    payload: { preferredRuntimeType: 'hermes', requiredCapabilities: ['code'], repoPath: process.cwd() },
  }
  const client = {
    async request(method: string, path: string, body?: any) {
      if (method === 'GET' && path === '/agent-jobs?status=QUEUED') return [job]
      if (method === 'POST' && path === '/agent-jobs/job_blocked_1/claim') return { ok: true, job: { ...job, status: 'CLAIMED' } }
      if (method === 'POST' && path === '/agent-runs') return { ok: true, run: { id: 'run_blocked_1' } }
      if (method === 'POST' && path === '/agent-runs/run_blocked_1/heartbeat') return { ok: true }
      if ((method === 'POST' && path === '/approval-requests') || (method === 'POST' && path === '/blockers')) { created.push({ path, body }); return { ok: true, approvalRequest: { id: 'approval_1' }, blocker: { id: 'blocker_1' } } }
      if (method === 'PATCH') { patches.push({ path, body }); return { ok: true } }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }
  const runtimeConfig = buildRuntimeConfigFromEnv({
    SALLY_RUNTIME_CONFIG: JSON.stringify({ runtimes: { hermes: { enabled: true, command: 'hermes', allowedRepoPaths: [process.cwd()], capabilities: ['code'] } } }),
  })

  await runOneQueuedAgentJob({
    client,
    workerName: 'runtime-worker',
    runtimeConfig,
    executeRuntimePlan: async () => ({ exitCode: 0, summary: 'APPROVAL_REQUIRED: production deploy needs approval.' }),
  })

  const runPatch = patches.find((patch) => patch.path === '/agent-runs/run_blocked_1')
  const jobPatch = patches.find((patch) => patch.path === '/agent-jobs/job_blocked_1')
  assert.equal(runPatch?.body.status, 'BLOCKED')
  assert.equal(jobPatch?.body.status, 'BLOCKED')
  assert.equal(runPatch?.body.metadata.needsApproval, true)
  assert.equal(runPatch?.body.metadata.blockerType, 'approval_required')
  assert.equal(created.find((call) => call.path === '/approval-requests')?.body.question, 'production deploy needs approval.')
  assert.equal(created.find((call) => call.path === '/blockers')?.body.type, 'LIVE_APPROVAL')
})

test('runOneConnectedAgentEvent heartbeats, consumes job.created, runs the job, and acks the event', async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const job = {
    id: 'job_event_1',
    projectId: 'project_1',
    taskId: null,
    agentId: null,
    role: 'pm',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: 'workflow_1',
    workflowStep: 1,
  }
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'POST' && path === '/agent-worker/heartbeat') return { ok: true }
      if (method === 'GET' && path === '/agent-worker/events') return { ok: true, events: [{ id: 'evt_1', type: 'job.created', payload: { jobId: 'job_event_1' } }] }
      if (method === 'POST' && path === '/agent-jobs/job_event_1/claim') return { ok: true, job: { ...job, status: 'CLAIMED' } }
      if (method === 'POST' && path === '/agent-runs') return { ok: true, run: { id: 'run_event_1' } }
      if (method === 'POST' && path === '/agent-runs/run_event_1/heartbeat') return { ok: true }
      if (method === 'PATCH' && path === '/agent-runs/run_event_1') return { ok: true }
      if (method === 'PATCH' && path === '/agent-jobs/job_event_1') return { ok: true }
      if (method === 'POST' && path === '/agent-worker/events/ack') return { ok: true }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }

  const result = await runOneConnectedAgentEvent({ client, workerName: 'connected-smoke' })

  assert.deepEqual(result, { status: 'completed', jobId: 'job_event_1', runId: 'run_event_1', eventId: 'evt_1' })
  assert.equal(calls[0].path, '/agent-worker/heartbeat')
  assert.equal(calls[1].path, '/agent-worker/events')
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/agent-worker/events/ack', body: { eventId: 'evt_1' } })
})

test('runOneConnectedAgentEvent skips and acks stale job.created events that are no longer claimable', async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'POST' && path === '/agent-worker/heartbeat') return { ok: true }
      if (method === 'GET' && path === '/agent-worker/events') return { ok: true, events: [{ id: 'evt_stale_1', type: 'job.created', payload: { jobId: 'job_stale_1' } }] }
      if (method === 'POST' && path === '/agent-jobs/job_stale_1/claim') throw new Error('POST /agent-jobs/job_stale_1/claim failed with 409: {"ok":false,"error":"Job is not queued or is unavailable"}')
      if (method === 'POST' && path === '/agent-worker/events/ack') return { ok: true }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }

  const result = await runOneConnectedAgentEvent({ client, workerName: 'connected-smoke' })

  assert.deepEqual(result, { status: 'idle', eventId: 'evt_stale_1' })
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/agent-worker/events/ack', body: { eventId: 'evt_stale_1' } })
})

test('runOneConnectedAgentEvent consumes approval.resolved reconciliation events and acks them without resuming stale jobs', async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const event = { id: 'evt_approval_1', type: 'approval.resolved', payload: { projectId: 'project_1', taskId: 'task_1', approvalRequestId: 'approval_1', status: 'APPROVED' } }
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'POST' && path === '/agent-worker/heartbeat') return { ok: true }
      if (method === 'GET' && path === '/agent-worker/events') return { ok: true, events: [event] }
      if (method === 'POST' && path === '/agent-worker/reconcile-event') return { ok: true, action: 'queued', jobId: 'job_pm_2' }
      if (method === 'POST' && path === '/agent-worker/events/ack') return { ok: true }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }

  const result = await runOneConnectedAgentEvent({ client, workerName: 'connected-smoke' })

  assert.deepEqual(result, { status: 'completed', jobId: 'job_pm_2', runId: '', eventId: 'evt_approval_1' })
  assert.deepEqual(calls[2], { method: 'POST', path: '/agent-worker/reconcile-event', body: { eventId: 'evt_approval_1', type: 'approval.resolved', payload: event.payload } })
  assert.equal(calls.some((call) => call.path.includes('/claim')), false)
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/agent-worker/events/ack', body: { eventId: 'evt_approval_1' } })
})

test('runOneConnectedAgentEvent consumes blocker.resolved reconciliation events and acks them without resuming stale jobs', async () => {
  const calls: Array<{ method: string; path: string; body?: unknown }> = []
  const event = { id: 'evt_blocker_1', type: 'blocker.resolved', payload: { projectId: 'project_1', taskId: 'task_1', blockerId: 'blocker_1', status: 'RESOLVED' } }
  const client = {
    async request(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body })
      if (method === 'POST' && path === '/agent-worker/heartbeat') return { ok: true }
      if (method === 'GET' && path === '/agent-worker/events') return { ok: true, events: [event] }
      if (method === 'POST' && path === '/agent-worker/reconcile-event') return { ok: true, action: 'queued', jobId: 'job_pm_2' }
      if (method === 'POST' && path === '/agent-worker/events/ack') return { ok: true }
      throw new Error(`unexpected call ${method} ${path}`)
    },
  }

  const result = await runOneConnectedAgentEvent({ client, workerName: 'connected-smoke' })

  assert.deepEqual(result, { status: 'completed', jobId: 'job_pm_2', runId: '', eventId: 'evt_blocker_1' })
  assert.deepEqual(calls[2], { method: 'POST', path: '/agent-worker/reconcile-event', body: { eventId: 'evt_blocker_1', type: 'blocker.resolved', payload: event.payload } })
  assert.equal(calls.some((call) => call.path.includes('/claim')), false)
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/agent-worker/events/ack', body: { eventId: 'evt_blocker_1' } })
})
