import path from 'node:path'

const RUNTIME_IDS = ['hermes', 'claude_code', 'codex', 'opencode', 'openclaw', 'aider'] as const
export type RuntimeId = typeof RUNTIME_IDS[number]

const SECRET_KEY_PATTERN = /(?:token|password|secret|private[_-]?key|apikey|api[_-]?key|credentials?|cookie|connection[_-]?string|access[_-]?token|refresh[_-]?token)/i

export type AgentRuntimeJob = {
  id: string
  workspaceId?: string | null
  projectId?: string | null
  taskId?: string | null
  role: string
  mode?: string | null
  triggerType?: string | null
  workflowRunId?: string | null
  workflowStep?: number | null
  payload?: Record<string, any> | null
}

export type RuntimeDefinition = {
  enabled: boolean
  command: string
  defaultArgs: string[]
  allowedRepoPaths: string[]
  capabilities: string[]
  timeoutMs?: number
  profiles?: Record<string, string>
}

export type RuntimeConfig = {
  runtimes: Partial<Record<RuntimeId, RuntimeDefinition>>
}

export type RuntimeAdapter = {
  id: RuntimeId
  displayName: string
  capabilities: string[]
  canRun(job: AgentRuntimeJob, runtime: RuntimeDefinition): boolean
  plan(job: AgentRuntimeJob, runtime: RuntimeDefinition): RuntimeCommandPlan
}

export type RuntimeCommandPlan = {
  runtimeId: RuntimeId
  command: string
  argv: string[]
  workdir: string
  prompt: string
  timeoutMs: number
}

function assertNoSecretLikeKeys(value: unknown, pathName = '$') {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeKeys(item, `${pathName}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Refusing to store secret-like key at ${pathName}.${key}`)
    assertNoSecretLikeKeys(nested, `${pathName}.${key}`)
  }
}

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function normalizeRuntimeId(value: string): RuntimeId | null {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (normalized === 'claude' || normalized === 'claude-code') return 'claude_code'
  if ((RUNTIME_IDS as readonly string[]).includes(normalized)) return normalized as RuntimeId
  return null
}

function normalizeRuntimeDefinition(raw: any): RuntimeDefinition {
  return {
    enabled: raw?.enabled === true,
    command: typeof raw?.command === 'string' && raw.command.trim() ? raw.command.trim() : '',
    defaultArgs: asArray(raw?.defaultArgs),
    allowedRepoPaths: asArray(raw?.allowedRepoPaths).map((repoPath) => path.resolve(repoPath)),
    capabilities: asArray(raw?.capabilities).map((cap) => cap.toLowerCase()),
    timeoutMs: Number.isFinite(Number(raw?.timeoutMs)) && Number(raw.timeoutMs) > 0 ? Math.min(Number(raw.timeoutMs), 60 * 60 * 1000) : undefined,
    profiles: raw?.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles)
      ? Object.fromEntries(Object.entries(raw.profiles).map(([key, value]) => [key, String(value)]))
      : undefined,
  }
}

export function buildRuntimeConfigFromEnv(env: Record<string, string | undefined>): RuntimeConfig {
  const rawText = env.SALLY_RUNTIME_CONFIG?.trim()
  if (!rawText) return { runtimes: {} }
  const raw = JSON.parse(rawText)
  assertNoSecretLikeKeys(raw)
  const runtimes: RuntimeConfig['runtimes'] = {}
  for (const [key, value] of Object.entries((raw as any).runtimes ?? {})) {
    const runtimeId = normalizeRuntimeId(key)
    if (!runtimeId) continue
    const definition = normalizeRuntimeDefinition(value)
    if (definition.enabled && !definition.command) throw new Error(`Runtime ${runtimeId} is enabled but has no command`)
    runtimes[runtimeId] = definition
  }
  return { runtimes }
}

function payload(job: AgentRuntimeJob): Record<string, any> {
  return job.payload && typeof job.payload === 'object' ? job.payload : {}
}

function getRepoPath(job: AgentRuntimeJob): string | null {
  const repoPath = payload(job).repoPath
  return typeof repoPath === 'string' && repoPath.trim() ? path.resolve(repoPath.trim()) : null
}

function isRepoAllowed(repoPath: string | null, allowedRepoPaths: string[]) {
  if (!repoPath) return true
  if (!allowedRepoPaths.length) return false
  return allowedRepoPaths.some((allowed) => repoPath === allowed || repoPath.startsWith(`${allowed}${path.sep}`))
}

function requiredCapabilities(job: AgentRuntimeJob) {
  return asArray(payload(job).requiredCapabilities).map((cap) => cap.toLowerCase())
}

function runtimeSupports(job: AgentRuntimeJob, adapter: RuntimeAdapter, runtime: RuntimeDefinition) {
  const supported = new Set([...adapter.capabilities, ...runtime.capabilities].map((cap) => cap.toLowerCase()))
  return requiredCapabilities(job).every((cap) => supported.has(cap))
}

function pmPlaybookGuidance(): string[] {
  return [
    'Apply the useful additions from /Users/alexhammerschmied/.Hermes/workspace/task-system/rules/task-handling-playbook.md.',
    'Mandatory PM orientation loop: before deciding the next action, fetch the live Sally task or project, read status, assignee, description, todos, labels, comments, blockers, recent updates, latest valid handoff, and project baseline context tasks. Compare claimed completion against evidence, identify the current playbook stage, decide next required role and status, then comment when routing is needed.',
    'Playbook stages: Intake / Clarify, Execution, Intent Check, Testing / Verification, Exceptional Human Review, Deployment / Release, Closure.',
    'Role selection rule: decide the next role from live Sally state, playbook stage, latest valid handoff, task kind, and project rules. Do not route by title prefixes except as a last-resort bootstrap hint.',
    'Required PM routing comment template: PM routing decision | Current playbook stage: <stage> | Task kind: <kind> | Current true state: <summary from live Sally> | What has been done: <summary plus evidence> | What is missing: <gap or blocker or next need> | Next required role: <role> | Next required action: <bounded action> | Recommended Sally status: <status> | Reason: <why this is the correct next step>.',
    'Staleness guard: live Sally status, description, todos, comments, blockers, and latest valid handoff override stale local assumptions, old comments, local run files, and task title hints.',
  ]
}

function specialistPlaybookGuidance(): string[] {
  return [
    'Apply the useful additions from /Users/alexhammerschmied/.Hermes/workspace/task-system/rules/task-handling-playbook.md.',
    'Specialist execution rule: execute one bounded work unit assigned to your role, produce evidence, then hand off instead of broadening scope.',
    'Required specialist handoff comment: Role handoff | Role: <current role> | Playbook stage completed: <stage> | Task kind: <kind> | What I did: <bounded output/action> | Evidence: <links, files, tests, observations> | Known assumptions: <assumptions> | Risks/open issues: <issues> | Recommended next stage: <stage> | Recommended next role: <role> | Recommended Sally status: <status> | Reason for next role: <why this role is now required>.',
  ]
}

function roleGuidance(job: AgentRuntimeJob): string[] {
  const role = job.role.trim().toLowerCase()
  if (role === 'pm' && job.mode === 'workflow') {
    return [
      ...pmPlaybookGuidance(),
      'PM orchestration role: own forward motion, but do not do specialist work yourself.',
      'On start_project_workflow or intake for a new project: read the project brief and existing tasks, then queue an architect job first so architecture can plan the actual project.',
      'Do not treat moving a task to In Progress as sufficient progress. Status movement is only valid when paired with a clear next specialist job or verified completed work.',
      'To invoke the architect, POST /agent-jobs with role "architect", mode "workflow", same projectId, workflowRunId when present, workflowStep incremented by one, and payload.instructions asking for stack-fit architecture, task breakdown, implementation briefs, risks, and handoff back to PM.',
      'When architect hands back a plan, inspect prior architect jobs/runs in the same workflowRunId, read their result/summary, create or update Sally tasks/briefs for the appropriate next roles such as coder, reviewer/tester, infra, or marketer, then queue those bounded jobs. Keep PM as orchestrator, not implementer.',
      'Use PATCH /projects/{projectId}/automation when needed to set currentStage/nextRole, and add Sally comments documenting routing decisions and evidence.',
    ]
  }
  if (role === 'architect') {
    return [
      ...specialistPlaybookGuidance(),
      'Architecture planning role: understand the project intent, existing stack/context, constraints, and risks; produce a concrete architecture and delivery plan.',
      'Do not implement, deploy, or mark delivery tasks done. Your output is a plan and handoff.',
      'Create or update Sally task descriptions/comments with the architecture plan, task breakdown, acceptance criteria, dependencies, risks, and recommended role routing.',
      'Then queue a pm workflow job via POST /agent-jobs so PM can turn the architecture handoff into executable briefs and specialist jobs. Include the same workflowRunId, workflowStep incremented by one, and payload.instructions containing the architecture summary, task breakdown, risks, and source architect job id.',
    ]
  }
  return [
    ...specialistPlaybookGuidance(),
    'Specialist role: execute only the bounded assignment in the job payload or assigned Sally task. Do not broaden scope or perform PM orchestration.',
  ]
}

export function buildRuntimePrompt(job: AgentRuntimeJob): string {
  const data = payload(job)
  const safe = {
    jobId: job.id,
    workspaceId: job.workspaceId ?? null,
    projectId: job.projectId ?? null,
    taskId: job.taskId ?? null,
    role: job.role,
    mode: job.mode ?? null,
    workflowRunId: job.workflowRunId ?? (typeof data.workflowRunId === 'string' ? data.workflowRunId : null),
    workflowStep: typeof job.workflowStep === 'number' ? job.workflowStep : (typeof data.workflowStep === 'number' ? data.workflowStep : null),
    title: typeof data.taskTitle === 'string' ? data.taskTitle : null,
    summary: typeof data.taskSummary === 'string' ? data.taskSummary : null,
    instructions: typeof data.instructions === 'string' ? data.instructions : null,
  }
  return [
    'Sally assigned a bounded agent job. Execute only this job and report a concise result.',
    'Do not expose secrets, tokens, credentials, cookies, private keys, or raw sensitive logs in your final output.',
    'Stop and report a blocker if the work requires production access, credentials, irreversible actions, or unclear business judgment.',
    'If blocked, start the final output with BLOCKER:. If human approval is required, start with APPROVAL_REQUIRED:.',
    'Use the workspaceId and projectId below as authoritative for this local Sally current project.',
    'If native Sally MCP does not expose this local project, use the local Sally REST API from SALLY_API_BASE_URL with SALLY_API_KEY as Authorization: Bearer <value> and X-Workspace-Id set to workspaceId. Useful routes are GET /projects/{projectId}, GET /projects/{projectId}/tasks, GET /agent-jobs?status=SUCCEEDED, POST /agent-jobs, PATCH /projects/{projectId}/automation, PATCH /tasks/{taskId}, and POST /tasks/{taskId}/comments. Never print the key.',
    ...roleGuidance(job),
    'Respond with a concise final summary plus evidence of validation.',
    '',
    JSON.stringify(safe, null, 2),
  ].join('\n')
}

export type RuntimeResultClassification = {
  status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED'
  needsApproval: boolean
  blockerType?: 'blocker' | 'approval_required'
}

function stripHermesCliNoise(text: string): string {
  const lines = text.split('\n')
  let start = 0
  if (/^╭.*Hermes Agent v/i.test(lines[0] ?? '')) {
    const bannerEnd = lines.findIndex((line, index) => index > 0 && /^╰[─━-]+╯?$/.test(line.trim()))
    if (bannerEnd >= 0) start = bannerEnd + 1
  }

  const remaining = lines.slice(start)
  while (remaining[0]?.trim() === '') remaining.shift()

  if (/^╭─\s*⚕\s*Hermes\s*─/.test(remaining[0] ?? '')) remaining.shift()
  if (/^╰[─━-]+╯?$/.test((remaining[remaining.length - 1] ?? '').trim())) remaining.pop()

  return remaining.join('\n').trim()
}

export function sanitizeRuntimeSummary(value: unknown): string {
  const text = stripHermesCliNoise(String(value ?? '').replace(/\r\n/g, '\n'))
  const redacted = text
    .replace(/\b(?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|secret|password|private[_-]?key)\b\s*[:=]\s*[^\s]+/gi, (match) => match.replace(/[:=]\s*[^\s]+$/, ': [REDACTED]'))
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
  const trimmed = redacted.trim()
  if (trimmed.length <= 4000) return trimmed
  return `${trimmed.slice(0, 1900)}\n…[truncated]…\n${trimmed.slice(-1900)}`
}

export function classifyRuntimeResult(result: { exitCode: number; summary: string }): RuntimeResultClassification {
  const summary = result.summary.trim()
  const hasApproval = /(?:^|\n)\s*APPROVAL_REQUIRED\b/i.test(summary)
  const hasBlocker = /(?:^|\n)\s*BLOCKER\b/i.test(summary)
  if (hasApproval) return { status: 'BLOCKED', needsApproval: true, blockerType: 'approval_required' }
  if (hasBlocker) return { status: 'BLOCKED', needsApproval: false, blockerType: 'blocker' }
  if (result.exitCode !== 0) return { status: 'FAILED', needsApproval: false }
  return { status: 'SUCCEEDED', needsApproval: false }
}

function baseCanRun(adapter: RuntimeAdapter, job: AgentRuntimeJob, runtime: RuntimeDefinition) {
  return runtime.enabled && Boolean(runtime.command) && isRepoAllowed(getRepoPath(job), runtime.allowedRepoPaths) && runtimeSupports(job, adapter, runtime)
}

function plan(runtimeId: RuntimeId, job: AgentRuntimeJob, runtime: RuntimeDefinition, argvBuilder: (prompt: string, runtime: RuntimeDefinition, job: AgentRuntimeJob) => string[]): RuntimeCommandPlan {
  const prompt = buildRuntimePrompt(job)
  const command = runtime.command
  const workdir = getRepoPath(job) ?? process.cwd()
  return { runtimeId, command, argv: [command, ...argvBuilder(prompt, runtime, job)], workdir, prompt, timeoutMs: runtime.timeoutMs ?? (runtimeId === 'hermes' ? 30 : 15) * 60 * 1000 }
}

function hermesQuietArgs(defaultArgs: string[]): string[] {
  return defaultArgs.some((arg) => arg === '--quiet' || arg === '-Q') ? defaultArgs : ['--quiet', ...defaultArgs]
}

export function createRuntimeAdapters(): RuntimeAdapter[] {
  return [
    {
      id: 'hermes', displayName: 'Hermes', capabilities: ['pm', 'code', 'git', 'tools'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('hermes', job, runtime, (prompt, rt, j) => [...(rt.profiles?.[j.role] ? ['--profile', rt.profiles[j.role]] : []), 'chat', ...hermesQuietArgs(rt.defaultArgs), '-q', prompt]) },
    },
    {
      id: 'claude_code', displayName: 'Claude Code', capabilities: ['code', 'git'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('claude_code', job, runtime, (prompt, rt) => ['-p', prompt, ...rt.defaultArgs]) },
    },
    {
      id: 'codex', displayName: 'Codex', capabilities: ['code', 'git'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('codex', job, runtime, (prompt, rt) => ['exec', prompt, ...rt.defaultArgs]) },
    },
    {
      id: 'opencode', displayName: 'OpenCode', capabilities: ['code', 'git'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('opencode', job, runtime, (prompt, rt) => ['run', prompt, ...rt.defaultArgs]) },
    },
    {
      id: 'openclaw', displayName: 'OpenClaw', capabilities: ['code', 'git', 'tools'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('openclaw', job, runtime, (prompt, rt) => ['chat', '-q', prompt, ...rt.defaultArgs]) },
    },
    {
      id: 'aider', displayName: 'Aider', capabilities: ['code', 'git'],
      canRun(job, runtime) { return baseCanRun(this, job, runtime) },
      plan(job, runtime) { return plan('aider', job, runtime, (prompt, rt) => ['--message', prompt, ...rt.defaultArgs]) },
    },
  ]
}

export function selectRuntimeAdapter(options: { adapters: RuntimeAdapter[]; config: RuntimeConfig; job: AgentRuntimeJob }): RuntimeAdapter | null {
  const preferred = normalizeRuntimeId(String(payload(options.job).preferredRuntimeType ?? ''))
  const candidates = preferred ? options.adapters.filter((adapter) => adapter.id === preferred) : options.adapters
  return candidates.find((adapter) => {
    const runtime = options.config.runtimes[adapter.id]
    return runtime ? adapter.canRun(options.job, runtime) : false
  }) ?? null
}

export function planRuntimeExecution(options: { runtimeId: RuntimeId; config: RuntimeConfig; job: AgentRuntimeJob }): RuntimeCommandPlan {
  const adapter = createRuntimeAdapters().find((item) => item.id === options.runtimeId)
  const runtime = options.config.runtimes[options.runtimeId]
  if (!adapter || !runtime || !adapter.canRun(options.job, runtime)) throw new Error(`Runtime ${options.runtimeId} cannot run this job`)
  const commandPlan = adapter.plan(options.job, runtime)
  if (commandPlan.argv.some((arg) => /[;&|`$<>]/.test(arg) && arg !== commandPlan.prompt)) throw new Error('Unsafe shell-like token in runtime argv')
  return commandPlan
}
