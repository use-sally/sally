import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { buildRuntimeConfigFromEnv, classifyRuntimeResult, createRuntimeAdapters, planRuntimeExecution, sanitizeRuntimeSummary, selectRuntimeAdapter, type RuntimeCommandPlan, type RuntimeConfig } from './runtime-adapters.js'

export type SallyWorkerClient = {
  request(method: string, path: string, body?: unknown): Promise<any>
}

export type QueuedAgentJob = {
  id: string
  projectId?: string | null
  taskId?: string | null
  agentId?: string | null
  role: string
  mode?: string | null
  triggerType?: string | null
  workflowRunId?: string | null
  workflowStep?: number | null
  payload?: Record<string, any> | null
}

export type RuntimeExecutionResult = {
  exitCode: number
  summary: string
}

export type AgentWorkerEvent = {
  id: string
  type: string
  payload?: { jobId?: string | null } | null
}

export type RunOneQueuedAgentJobOptions = {
  client: SallyWorkerClient
  workerName?: string
  resultSummary?: string
  jobId?: string | null
  runtimeConfig?: RuntimeConfig
  executeRuntimePlan?: (plan: RuntimeCommandPlan) => Promise<RuntimeExecutionResult>
}

export type RunOneQueuedAgentJobResult =
  | { status: 'idle' }
  | { status: 'completed'; jobId: string; runId: string }

function firstQueuedJob(value: unknown): QueuedAgentJob | null {
  if (!Array.isArray(value)) return null
  return (value.find((item) => item && typeof item === 'object' && typeof item.id === 'string') as QueuedAgentJob | undefined) ?? null
}

function firstCreatedJobEvent(value: unknown): AgentWorkerEvent | null {
  const events = (value as { events?: unknown[] } | null)?.events
  if (!Array.isArray(events)) return null
  return (events.find((item: any) => item?.type === 'job.created' && typeof item?.payload?.jobId === 'string') as AgentWorkerEvent | undefined) ?? null
}

function firstWorkflowReconciliationEvent(value: unknown): AgentWorkerEvent | null {
  const events = (value as { events?: unknown[] } | null)?.events
  if (!Array.isArray(events)) return null
  return (events.find((item: any) => ['approval.resolved', 'blocker.resolved'].includes(item?.type) && item?.payload?.projectId) as AgentWorkerEvent | undefined) ?? null
}

export class HttpSallyWorkerClient implements SallyWorkerClient {
  constructor(private readonly options: { baseUrl: string; apiKey?: string; workspaceSlug: string }) {}

  async request(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = {
      'X-Workspace-Slug': this.options.workspaceSlug,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (this.options.apiKey) headers['X-Api-Key'] = this.options.apiKey
    const res = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const parsed = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}: ${text.slice(0, 500)}`)
    return parsed
  }
}

export async function executeRuntimeCommandPlan(plan: RuntimeCommandPlan): Promise<RuntimeExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(plan.command, plan.argv.slice(1), {
      cwd: plan.workdir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let settled = false
    let output = ''
    const finish = (result: RuntimeExecutionResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, summary: sanitizeRuntimeSummary(result.summary) })
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ exitCode: 124, summary: `Runtime ${plan.runtimeId} timed out after ${Math.round(plan.timeoutMs / 1000)} seconds.\n${output}` })
    }, plan.timeoutMs)
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', (err) => finish({ exitCode: 127, summary: `Runtime ${plan.runtimeId} failed to start: ${err.message}` }))
    child.on('close', (code) => {
      const trimmed = sanitizeRuntimeSummary(output)
      finish({ exitCode: code ?? 1, summary: trimmed || `Runtime ${plan.runtimeId} exited with code ${code ?? 1}` })
    })
  })
}

function getRuntimePlan(job: QueuedAgentJob, runtimeConfig?: RuntimeConfig): RuntimeCommandPlan | null {
  if (!runtimeConfig) return null
  const adapter = selectRuntimeAdapter({ adapters: createRuntimeAdapters(), config: runtimeConfig, job })
  if (!adapter) return null
  return planRuntimeExecution({ runtimeId: adapter.id, config: runtimeConfig, job })
}

function blockerTypeForClassification(blockerType?: string | null) {
  if (blockerType === 'approval_required') return 'LIVE_APPROVAL'
  if (blockerType === 'credential') return 'CREDENTIAL'
  if (blockerType === 'tooling_failure') return 'TOOLING_FAILURE'
  return 'AMBIGUITY'
}

function approvalTypeForClassification(blockerType?: string | null) {
  if (blockerType === 'approval_required') return 'LIVE_DEPLOY'
  if (blockerType === 'credential') return 'CREDENTIAL'
  return 'CUSTOMER_DATA'
}

function stripClassificationPrefix(summary: string) {
  return summary.replace(/^(?:APPROVAL_REQUIRED|BLOCKER):\s*/i, '').trim() || summary
}

export async function runOneQueuedAgentJob(options: RunOneQueuedAgentJobOptions): Promise<RunOneQueuedAgentJobResult> {
  const workerName = options.workerName?.trim() || 'local-hermes-dummy-worker'
  const resultSummary = options.resultSummary?.trim() || 'Dummy Hermes worker completed the queued job successfully.'
  const jobs = options.jobId
    ? [{ id: options.jobId }]
    : await options.client.request('GET', '/agent-jobs?status=QUEUED')
  const job = firstQueuedJob(jobs)
  if (!job) return { status: 'idle' }

  const claimed = await options.client.request('POST', `/agent-jobs/${job.id}/claim`, { agentId: job.agentId ?? null })
  const claimedJob = claimed?.job ?? job
  const runtimePlan = getRuntimePlan(claimedJob, options.runtimeConfig)
  const runCreated = await options.client.request('POST', '/agent-runs', {
    projectId: claimedJob.projectId ?? null,
    taskId: claimedJob.taskId ?? null,
    jobId: claimedJob.id,
    agentId: claimedJob.agentId ?? null,
    role: claimedJob.role,
    status: 'RUNNING',
    triggerType: workerName,
    workflowRunId: claimedJob.workflowRunId ?? null,
    workflowStep: claimedJob.workflowStep ?? null,
    summary: runtimePlan ? `Runtime ${runtimePlan.runtimeId} started job ${claimedJob.id}.` : `Dummy Hermes worker started job ${claimedJob.id}.`,
    metadata: runtimePlan ? { mode: 'runtime', workerName, runtimeType: runtimePlan.runtimeId, workdir: runtimePlan.workdir } : { mode: 'dummy', workerName },
  })
  const runId = runCreated?.run?.id
  if (!runId) throw new Error('Sally did not return an AgentRun id')

  await options.client.request('POST', `/agent-runs/${runId}/heartbeat`)
  const runtimeResult = runtimePlan ? await (options.executeRuntimePlan ?? executeRuntimeCommandPlan)(runtimePlan) : null
  const sanitizedSummary = sanitizeRuntimeSummary(runtimeResult?.summary || resultSummary)
  const classification = runtimeResult ? classifyRuntimeResult({ exitCode: runtimeResult.exitCode, summary: sanitizedSummary }) : { status: 'SUCCEEDED' as const, needsApproval: false }
  const finalStatus = classification.status
  const finalSummary = sanitizedSummary
  const finalMetadata = runtimePlan
    ? { mode: 'runtime', workerName, runtimeType: runtimePlan.runtimeId, completed: finalStatus === 'SUCCEEDED', exitCode: runtimeResult?.exitCode ?? null, needsApproval: classification.needsApproval, blockerType: classification.blockerType ?? null }
    : { mode: 'dummy', workerName, completed: true }
  await options.client.request('PATCH', `/agent-runs/${runId}`, {
    status: finalStatus,
    summary: finalSummary,
    metadata: finalMetadata,
  })
  await options.client.request('PATCH', `/agent-jobs/${claimedJob.id}`, {
    status: finalStatus,
    payload: runtimePlan ? { source: workerName, result: finalSummary, runId, mode: 'runtime', runtimeType: runtimePlan.runtimeId } : { source: workerName, result: finalSummary, runId },
  })
  if (runtimePlan && finalStatus === 'BLOCKED') {
    const requiredInput = stripClassificationPrefix(finalSummary)
    const blockerBody = {
      projectId: claimedJob.projectId ?? null,
      taskId: claimedJob.taskId ?? null,
      ownerAgentId: claimedJob.agentId ?? null,
      type: blockerTypeForClassification(classification.blockerType),
      summary: requiredInput,
      requiredInput,
      metadata: { source: workerName, runId, jobId: claimedJob.id, runtimeType: runtimePlan.runtimeId },
    }
    await options.client.request('POST', '/blockers', blockerBody)
    if (classification.needsApproval) {
      await options.client.request('POST', '/approval-requests', {
        projectId: claimedJob.projectId ?? null,
        taskId: claimedJob.taskId ?? null,
        requestedByAgentId: claimedJob.agentId ?? null,
        type: approvalTypeForClassification(classification.blockerType),
        question: requiredInput,
        options: ['approve', 'deny'],
        recommendation: 'Review the blocked runtime result and approve only if the requested action is safe and intended.',
        metadata: { source: workerName, runId, jobId: claimedJob.id, runtimeType: runtimePlan.runtimeId },
      })
    }
  }

  return { status: 'completed', jobId: claimedJob.id, runId }
}

export async function runOneConnectedAgentEvent(options: RunOneQueuedAgentJobOptions & { cursor?: string | null }): Promise<RunOneQueuedAgentJobResult & { eventId?: string }> {
  await options.client.request('POST', '/agent-worker/heartbeat', { capabilities: ['agent-job-runner'] })
  const eventPage = await options.client.request('GET', `/agent-worker/events${options.cursor ? `?cursor=${encodeURIComponent(options.cursor)}` : ''}`)
  const jobEvent = firstCreatedJobEvent(eventPage)
  if (jobEvent?.payload?.jobId) {
    try {
      const result = await runOneQueuedAgentJob({ ...options, jobId: jobEvent.payload.jobId })
      await options.client.request('POST', '/agent-worker/events/ack', { eventId: jobEvent.id })
      return result.status === 'completed' ? { ...result, eventId: jobEvent.id } : result
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err)
      if (/\b409\b/.test(message) || /not queued|unavailable/i.test(message)) {
        await options.client.request('POST', '/agent-worker/events/ack', { eventId: jobEvent.id })
        return { status: 'idle', eventId: jobEvent.id }
      }
      throw err
    }
  }

  const reconciliationEvent = firstWorkflowReconciliationEvent(eventPage)
  if (!reconciliationEvent) return runOneQueuedAgentJob(options)
  const reconciled = await options.client.request('POST', '/agent-worker/reconcile-event', {
    eventId: reconciliationEvent.id,
    type: reconciliationEvent.type,
    payload: reconciliationEvent.payload ?? null,
  })
  await options.client.request('POST', '/agent-worker/events/ack', { eventId: reconciliationEvent.id })
  return { status: 'completed', jobId: reconciled?.jobId ?? '', runId: '', eventId: reconciliationEvent.id }
}

function readCliOptions() {
  const baseUrl = process.env.SALLY_API_BASE_URL || 'http://localhost:4000'
  const apiKey = process.env.SALLY_API_KEY || process.env.API_TOKEN || undefined
  const workspaceSlug = process.env.SALLY_WORKSPACE_SLUG || 'release-validation'
  const workerName = process.env.SALLY_WORKER_NAME || 'local-hermes-dummy-worker'
  const runtimeConfig = buildRuntimeConfigFromEnv(process.env as Record<string, string | undefined>)
  return { baseUrl, apiKey, workspaceSlug, workerName, runtimeConfig }
}

export async function runLocalSallyWorkerOnce() {
  const options = readCliOptions()
  const client = new HttpSallyWorkerClient(options)
  const cursorFile = process.env.SALLY_WORKER_CURSOR_FILE?.trim()
  const targetJobId = process.env.TARGET_JOB_ID?.trim() || null
  const cursor = cursorFile && fs.existsSync(cursorFile) ? fs.readFileSync(cursorFile, 'utf8').trim() : null
  const isWorkerToken = options.apiKey?.startsWith('sallyw_') || options.apiKey?.startsWith('sally_worker_')
  const result = targetJobId
    ? await runOneQueuedAgentJob({ client, workerName: options.workerName, runtimeConfig: options.runtimeConfig, jobId: targetJobId })
    : isWorkerToken
      ? await runOneConnectedAgentEvent({ client, workerName: options.workerName, runtimeConfig: options.runtimeConfig, cursor })
      : await runOneQueuedAgentJob({ client, workerName: options.workerName, runtimeConfig: options.runtimeConfig })
  if (cursorFile && 'eventId' in result && result.eventId) fs.writeFileSync(cursorFile, String(result.eventId))
  return result
}

async function main() {
  const result = await runLocalSallyWorkerOnce()
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1]?.endsWith('local-sally-worker.ts') || process.argv[1]?.endsWith('local-sally-worker.js')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
