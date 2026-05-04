import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentConnectArgs } from './cli-options.js'

export type HermesRuntimeConfig = {
  command: string
  capabilities: string[]
  timeoutMs: number
}

type WorkerClientOptions = {
  baseUrl: string
  workerToken: string
  workspaceSlug: string
}

type QueuedAgentJob = {
  id: string
  projectId?: string | null
  taskId?: string | null
  agentId?: string | null
  role: string
  mode?: string | null
  triggerType?: string | null
  workflowRunId?: string | null
  workflowStep?: number | null
  payload?: Record<string, unknown> | null
}

type WorkerEvent = {
  id: string
  type: string
  payload?: { jobId?: string | null; projectId?: string | null } | null
}

function defaultCapabilities() {
  return ['pm', 'architecture', 'planning', 'code', 'git', 'tools']
}

function splitCapabilities(value?: string) {
  return [...new Set((value ? value.split(',') : defaultCapabilities()).map((item) => item.trim()).filter(Boolean))]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeSecretFile(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, value, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

function readTokenFile(file: string) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
}

export function selectInitialWorkerToken(input: { envToken?: string; fileToken?: string; pairingCode?: string }) {
  const envToken = input.envToken?.trim() || ''
  if (envToken) return { workerToken: envToken, shouldPair: false }
  const pairingCode = input.pairingCode?.trim() || ''
  if (pairingCode) return { workerToken: '', shouldPair: true }
  return { workerToken: input.fileToken?.trim() || '', shouldPair: false }
}

function safeJsonParse(text: string) {
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { return text }
}

function redactSecrets(text: string) {
  return text
    .replace(/sally(?:w|_worker)?_[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/(api[_-]?key|token|secret|password)(["'\s:=]+)([^"'\s,}]+)/gi, '$1$2[REDACTED]')
}

export function sanitizeRuntimeSummary(text: string) {
  const cleaned = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*Hermes Agent v/i.test(line))
    .filter((line) => !/^\s*Available Tools/i.test(line))
    .filter((line) => !/^\s*[╭╰│├─╞═╘╒]/.test(line))
    .join('\n')
    .trim()
  return redactSecrets(cleaned).slice(0, 12000)
}

function classifyRuntimeResult(input: { exitCode: number; summary: string }) {
  if (/^APPROVAL_REQUIRED:/im.test(input.summary)) return { status: 'BLOCKED' as const, needsApproval: true, blockerType: 'approval_required' }
  if (/^BLOCKER:/im.test(input.summary)) return { status: 'BLOCKED' as const, needsApproval: false, blockerType: 'ambiguity' }
  if (input.exitCode === 0) return { status: 'SUCCEEDED' as const, needsApproval: false }
  return { status: 'FAILED' as const, needsApproval: false }
}

function buildHermesPrompt(job: QueuedAgentJob) {
  return `Sally assigned you an automation job.

You are running as a local Hermes runtime connected through the Sally agent connector.
Use live Sally state as authoritative. If Sally MCP points to a different instance, use the local Sally REST API from SALLY_API_BASE_URL and SALLY_API_KEY. Do not print or expose SALLY_API_KEY.

Job context:
${JSON.stringify({
  jobId: job.id,
  projectId: job.projectId ?? null,
  taskId: job.taskId ?? null,
  role: job.role,
  mode: job.mode ?? null,
  triggerType: job.triggerType ?? null,
  workflowRunId: job.workflowRunId ?? null,
  workflowStep: job.workflowStep ?? null,
  payload: job.payload ?? null,
}, null, 2)}

Expected behavior:
- Inspect the current Sally project/task state before acting.
- If role is pm, coordinate and route work; do not silently implement specialist work yourself.
- If role is architect/planning, produce a plan and hand off back to PM.
- If role is coder/reviewer/tester, stay within the assigned scope and report evidence.
- Update Sally with concise comments/status evidence when you can.
- If blocked, start a line with BLOCKER: and describe the needed input.
- If human approval is required, start a line with APPROVAL_REQUIRED: and describe the decision.
- Final answer should be concise and operational.`
}

class SallyWorkerClient {
  constructor(private readonly options: WorkerClientOptions) {}

  async request(method: string, route: string, body?: unknown) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.workerToken}`,
      'X-Api-Key': this.options.workerToken,
      'X-Workspace-Slug': this.options.workspaceSlug,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const parsed = safeJsonParse(text)
    if (!res.ok) throw new Error(`${method} ${route} failed with ${res.status}: ${redactSecrets(text).slice(0, 500)}`)
    return parsed
  }
}

async function completePairing(args: AgentConnectArgs, capabilities: string[]) {
  const res = await fetch(`${args.apiBaseUrl.replace(/\/$/, '')}/agent-connections/complete-pairing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: args.pairingCode,
      name: args.workerName,
      runtimeType: 'hermes',
      runtimeVersion: 'hermes-local',
      profileRef: args.runtimeProfile || 'local-hermes',
      capabilities,
    }),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`Pairing failed with ${res.status}: ${redactSecrets(text).slice(0, 500)}`)
  if (!data?.token) throw new Error('Pairing response did not include a worker token')
  return { token: String(data.token), connectionId: data.connection?.id ?? null }
}

function assertHermesAvailable(command: string) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (result.error) throw new Error(`Hermes command not found: ${command}`)
}

function firstJob(value: unknown): QueuedAgentJob | null {
  if (!Array.isArray(value)) return null
  return (value.find((item: any) => item?.id) as QueuedAgentJob | undefined) ?? null
}

function firstJobCreatedEvent(value: unknown): WorkerEvent | null {
  const events = (value as { events?: unknown[] } | null)?.events
  if (!Array.isArray(events)) return null
  return (events.find((item: any) => item?.type === 'job.created' && item?.payload?.jobId) as WorkerEvent | undefined) ?? null
}

function runtimeArgv(args: AgentConnectArgs, prompt: string) {
  return [
    ...(args.runtimeProfile ? ['--profile', args.runtimeProfile] : []),
    'chat',
    '--quiet',
    '-q',
    prompt,
  ]
}

function executeHermes(args: AgentConnectArgs, job: QueuedAgentJob, workerToken: string) {
  const prompt = buildHermesPrompt(job)
  const env = {
    ...process.env,
    SALLY_API_BASE_URL: args.apiBaseUrl,
    SALLY_API_KEY: workerToken,
    SALLY_WORKSPACE_SLUG: args.workspaceSlug,
    ...(args.workspaceId ? { SALLY_WORKSPACE_ID: args.workspaceId } : {}),
  }
  return new Promise<{ exitCode: number; summary: string }>((resolve) => {
    const child = spawn(args.runtimeCommand, runtimeArgv(args, prompt), { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let settled = false
    const timeoutMs = Number(args.timeoutMs || 1800000)
    const finish = (exitCode: number, summary: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ exitCode, summary: sanitizeRuntimeSummary(summary) })
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(124, `Hermes timed out after ${Math.round(timeoutMs / 1000)} seconds.\n${output}`)
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', (err) => finish(127, `Hermes failed to start: ${err.message}`))
    child.on('close', (code) => finish(code ?? 1, output || `Hermes exited with code ${code ?? 1}`))
  })
}

async function runOneWorkerIteration(input: { args: AgentConnectArgs; client: SallyWorkerClient; workerToken: string }) {
  await input.client.request('POST', '/agent-worker/heartbeat', { capabilities: ['agent-job-runner'] })
  const cursor = fs.existsSync(input.args.cursorFile) ? fs.readFileSync(input.args.cursorFile, 'utf8').trim() : ''
  const eventPage = await input.client.request('GET', `/agent-worker/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
  const event = firstJobCreatedEvent(eventPage)
  const jobs = event?.payload?.jobId ? [{ id: event.payload.jobId }] : await input.client.request('GET', '/agent-jobs?status=QUEUED')
  const job = firstJob(jobs)
  if (!job) return { status: 'idle' as const }

  try {
    const claimed = await input.client.request('POST', `/agent-jobs/${job.id}/claim`, { agentId: job.agentId ?? null })
    const claimedJob = claimed?.job ?? job
    const runCreated = await input.client.request('POST', '/agent-runs', {
      projectId: claimedJob.projectId ?? null,
      taskId: claimedJob.taskId ?? null,
      jobId: claimedJob.id,
      agentId: claimedJob.agentId ?? null,
      role: claimedJob.role,
      status: 'RUNNING',
      triggerType: input.args.workerName,
      workflowRunId: claimedJob.workflowRunId ?? null,
      workflowStep: claimedJob.workflowStep ?? null,
      summary: `Hermes runtime started job ${claimedJob.id}.`,
      metadata: { mode: 'runtime', workerName: input.args.workerName, runtimeType: 'hermes' },
    })
    const runId = runCreated?.run?.id
    if (!runId) throw new Error('Sally did not return an AgentRun id')
    await input.client.request('POST', `/agent-runs/${runId}/heartbeat`)
    const runtimeResult = await executeHermes(input.args, claimedJob, input.workerToken)
    const classification = classifyRuntimeResult(runtimeResult)
    await input.client.request('PATCH', `/agent-runs/${runId}`, {
      status: classification.status,
      summary: runtimeResult.summary,
      metadata: { mode: 'runtime', workerName: input.args.workerName, runtimeType: 'hermes', exitCode: runtimeResult.exitCode, needsApproval: classification.needsApproval, blockerType: classification.blockerType ?? null },
    })
    await input.client.request('PATCH', `/agent-jobs/${claimedJob.id}`, {
      status: classification.status,
      payload: { source: input.args.workerName, result: runtimeResult.summary, runId, mode: 'runtime', runtimeType: 'hermes' },
    })
    if (event?.id) {
      await input.client.request('POST', '/agent-worker/events/ack', { eventId: event.id })
      fs.mkdirSync(path.dirname(input.args.cursorFile), { recursive: true, mode: 0o700 })
      fs.writeFileSync(input.args.cursorFile, event.id)
    }
    return { status: 'completed' as const, jobId: claimedJob.id, runId }
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    if (event?.id && (/\b409\b/.test(message) || /not queued|unavailable/i.test(message))) {
      await input.client.request('POST', '/agent-worker/events/ack', { eventId: event.id })
      fs.mkdirSync(path.dirname(input.args.cursorFile), { recursive: true, mode: 0o700 })
      fs.writeFileSync(input.args.cursorFile, event.id)
      return { status: 'idle' as const, eventId: event.id }
    }
    throw err
  }
}

export async function runHermesConnector(args: AgentConnectArgs) {
  const capabilities = splitCapabilities(args.capabilities)
  assertHermesAvailable(args.runtimeCommand)

  const selectedToken = selectInitialWorkerToken({ envToken: process.env.SALLY_API_KEY, fileToken: readTokenFile(args.tokenFile), pairingCode: args.pairingCode })
  let workerToken = selectedToken.workerToken
  let connectionId: string | null = null
  if (selectedToken.shouldPair) {
    const paired = await completePairing(args, capabilities)
    workerToken = paired.token
    connectionId = paired.connectionId
    writeSecretFile(args.tokenFile, workerToken)
  }
  if (!workerToken) throw new Error('No worker token found. Pass --pairing-code <CODE> or set SALLY_PAIRING_CODE for first-time connection.')

  const client = new SallyWorkerClient({ baseUrl: args.apiBaseUrl, workerToken, workspaceSlug: args.workspaceSlug })
  console.log(JSON.stringify({
    ok: true,
    mode: args.once ? 'once' : 'loop',
    runtime: 'hermes',
    apiBaseUrl: args.apiBaseUrl,
    tokenFile: args.tokenFile,
    cursorFile: args.cursorFile,
    connectionId,
    workerToken: '[REDACTED]',
  }, null, 2))

  do {
    try {
      const result = await runOneWorkerIteration({ args, client, workerToken })
      console.log(JSON.stringify(result))
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      if (args.once) return 1
    }
    if (!args.once) await sleep(5000)
  } while (!args.once)
  return 0
}
