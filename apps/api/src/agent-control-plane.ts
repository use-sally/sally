export const WORKFLOW_STAGES = [
  'INTAKE',
  'ARCHITECTURE',
  'EXECUTION',
  'REVIEW',
  'TESTING',
  'REWORK',
  'APPROVAL_NEEDED',
  'BLOCKED',
  'DEPLOYMENT',
  'DONE',
] as const

export const AGENT_JOB_STATUSES = ['QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'] as const
export const AGENT_RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'] as const
export const APPROVAL_TYPES = ['LIVE_DEPLOY', 'CREDENTIAL', 'PAYMENT_DATA', 'CUSTOMER_DATA', 'CLIENT_DECISION', 'DESTRUCTIVE_ACTION', 'PUBLISHING'] as const
export const BLOCKER_TYPES = ['CREDENTIAL', 'ACCESS', 'STAGING_FAILURE', 'ARCHITECTURE_CONFLICT', 'TEST_FAILURE', 'CLIENT_DECISION', 'LIVE_APPROVAL', 'DEPENDENCY', 'AMBIGUITY', 'TOOLING_FAILURE'] as const

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

function slugifyIdentifier(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeWorkflowStage(input?: string | null): WorkflowStage {
  const raw = input?.trim()
  if (!raw) return 'INTAKE'
  const normalized = raw.toUpperCase().replace(/[\s-]+/g, '_')
  if ((WORKFLOW_STAGES as readonly string[]).includes(normalized)) return normalized as WorkflowStage
  throw new Error(`Unknown workflow stage: ${input}`)
}

export function normalizeAgentRole(input?: string | null) {
  const role = slugifyIdentifier(input ?? '')
  if (!role) throw new Error('agent role is required')
  return role
}

export function normalizeHermesProfile(input?: string | null) {
  const profile = slugifyIdentifier(input ?? '')
  return profile || null
}

export function normalizeCapabilityNames(input?: Array<string | null | undefined> | null) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of input ?? []) {
    const capability = slugifyIdentifier(value ?? '')
    if (!capability || seen.has(capability)) continue
    seen.add(capability)
    result.push(capability)
  }
  return result
}

const SECRET_KEY_PATTERN = /(?:secret|token|password|passwd|private[_-]?key|api[_-]?key|access[_-]?key|refresh[_-]?token|cookie|credential|connection[_-]?string)/i

export function findSecretLikeJsonPath(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const match = findSecretLikeJsonPath(value[i], `${path}[${i}]`)
      if (match) return match
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`
    if (SECRET_KEY_PATTERN.test(key)) return nestedPath
    const match = findSecretLikeJsonPath(nested, nestedPath)
    if (match) return match
  }
  return null
}

export function assertNoSecretLikeJson(value: unknown, label = 'metadata') {
  const match = findSecretLikeJsonPath(value)
  if (match) throw new Error(`${label} must not contain secret-like key: ${match}`)
}

function normalizeOptionalId(input: unknown) {
  if (typeof input !== 'string') return null
  const id = input.trim()
  return id || null
}

function normalizeStringList(input: unknown) {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of input) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function buildProjectAutomationPatch(input: {
  workflowEnabled?: boolean
  defaultPmAgentId?: string | null
  roleAgents?: Record<string, unknown> | null
  baselineTaskIds?: unknown
  requiredCapabilities?: Array<string | null | undefined> | null
  liveActionsRequireApproval?: boolean
  stagingFirst?: boolean
  currentStage?: string | null
  nextRole?: string | null
  automationState?: string | null
  metadata?: unknown
}) {
  const data: Record<string, unknown> = {}
  if (input.workflowEnabled !== undefined) data.workflowEnabled = !!input.workflowEnabled
  if (input.defaultPmAgentId !== undefined) data.defaultPmAgentId = normalizeOptionalId(input.defaultPmAgentId)
  if (input.roleAgents !== undefined) {
    assertNoSecretLikeJson(input.roleAgents, 'roleAgents')
    const normalized: Record<string, string> = {}
    for (const [role, agentId] of Object.entries(input.roleAgents ?? {})) {
      const normalizedRole = normalizeAgentRole(role)
      const normalizedAgentId = normalizeOptionalId(agentId)
      if (normalizedAgentId) normalized[normalizedRole] = normalizedAgentId
    }
    data.roleAgents = normalized
  }
  if (input.baselineTaskIds !== undefined) data.baselineTaskIds = normalizeStringList(input.baselineTaskIds)
  if (input.requiredCapabilities !== undefined) data.requiredCapabilities = normalizeCapabilityNames(input.requiredCapabilities)
  if (input.liveActionsRequireApproval !== undefined) data.liveActionsRequireApproval = !!input.liveActionsRequireApproval
  if (input.stagingFirst !== undefined) data.stagingFirst = !!input.stagingFirst
  if (input.currentStage !== undefined) data.currentStage = normalizeWorkflowStage(input.currentStage)
  if (input.nextRole !== undefined) data.nextRole = input.nextRole ? normalizeAgentRole(input.nextRole) : null
  if (input.automationState !== undefined) data.automationState = input.automationState?.trim().toLowerCase() || 'idle'
  if (input.metadata !== undefined) {
    assertNoSecretLikeJson(input.metadata, 'automation metadata')
    data.metadata = input.metadata ?? null
  }
  return data
}

export function buildStartProjectWorkflowJobPayload(input: { projectId: string; pmAgentId?: string | null; workflowRunId: string; maxSteps?: number | null }) {
  return {
    projectId: input.projectId,
    agentId: normalizeOptionalId(input.pmAgentId),
    role: 'pm',
    mode: 'workflow',
    triggerType: 'sally_ui',
    workflowRunId: input.workflowRunId,
    workflowStep: 1,
    maxSteps: input.maxSteps ?? 30,
    payload: { source: 'sally_ui', action: 'start_project_workflow' },
  }
}
