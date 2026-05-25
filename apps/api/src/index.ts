import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient, Prisma, TaskStatusType, TaskPriority, WorkspaceRole, PlatformRole, PrincipalType, AgentJobStatus, AgentRunStatus, AgentConnectionStatus, ApprovalStatus, BlockerStatus, WorkItemProvider } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { hasExactTodoOrder, normalizeTaskLabels, normalizeTaskTodoTexts } from './task-helpers.js'
import { canAccessTaskParticipants } from './task-collaborators.js'
import { buildHostedMcpAgentJobCreatePayload, buildHostedMcpAgentJobUpdatePayload, buildHostedMcpAgentRunCreatePayload, buildHostedMcpAgentRunUpdatePayload, buildHostedMcpTaskCreatePayload, buildHostedMcpTaskUpdatePayload } from './hosted-mcp.js'
import { buildTaskParticipantWrites, resolveVisibleTaskPeople } from './task-people.js'
import { chooseCreateTimesheetUserId } from './timesheet-helpers.js'
import { serveProfileImage, saveProfileImage } from './profile-images.js'
import { cleanupRemovedDescriptionImages, saveTaskImage, serveTaskImage } from './task-description-images.js'
import { cleanupRemovedProjectDescriptionImages, saveProjectImage, serveProjectImage } from './project-description-images.js'
import { assertNoSecretLikeJson, buildProjectAutomationPatch, buildStartProjectWorkflowJobPayload, normalizeAgentRole, normalizeCapabilityNames, normalizeHermesProfile } from './agent-control-plane.js'
import { buildAgentConnectionPatch, buildAgentEventPayload, chooseAgentEventCursor, createAgentWorkerToken, hashAgentWorkerToken, normalizeRuntimeType, redactAgentConnection, verifyAgentWorkerToken } from './agent-connector.js'
import { buildApprovalDecisionPatch, buildApprovalRequestPayload, buildBlockerPayload, buildBlockerResolutionPatch } from './blockers-approvals.js'
import { sendEmailChangeConfirmationEmail, sendInviteEmail, sendNotificationEmail, sendPasswordResetEmail } from './mailer.js'
import { appBuildTime, appGitSha, appVersion } from './version.js'
import { getEditionInfo, requireFeature } from './edition.js'
import { activateInstalledLicense, readInstalledLicense, readInstalledLicenseWithAutoRefresh, refreshInstalledLicense, removeInstalledLicense } from './license-management.js'

function loadSimpleEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const envText = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}
loadSimpleEnv(path.resolve(process.cwd(), '.env'))
loadSimpleEnv(path.resolve(process.cwd(), '../../packages/db/.env'))

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Missing required env var: DATABASE_URL')
  return new PrismaClient({ adapter: new PrismaPg(databaseUrl) })
}

const prisma = createPrismaClient()
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })

const API_TOKEN = process.env.API_TOKEN || process.env.API_KEY
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30)
const INVITE_TTL_DAYS = Number(process.env.INVITE_TTL_DAYS || 7)
const RESET_TTL_HOURS = Number(process.env.RESET_TTL_HOURS || 2)
const PROJECT_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const

type ProjectRole = (typeof PROJECT_ROLE)[keyof typeof PROJECT_ROLE]

function slugify(input: string) { return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function readHeader(request: any, key: string) {
  const value = request.headers?.[key] ?? request.headers?.[key.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}
function extractAuthToken(request: any) {
  const auth = readHeader(request, 'authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return readHeader(request, 'x-session-token') || readHeader(request, 'x-api-key')
}
function hashApiToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const API_KEY_SCOPES = ['read', 'write', 'admin'] as const
const MCP_KEY_SCOPES = ['read', 'write', 'mcp'] as const

function normalizeKeyScopes(input: unknown, allowed: readonly string[], defaults: string[]) {
  if (!Array.isArray(input)) return defaults
  const scopes = Array.from(new Set(input.map((scope) => String(scope).trim()).filter((scope) => allowed.includes(scope))))
  return scopes.length ? scopes : defaults
}

function parseOptionalExpiry(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const expiresAt = new Date(String(value))
  if (Number.isNaN(expiresAt.getTime())) throw new Error('expiresAt must be a valid ISO date')
  if (expiresAt <= new Date()) throw new Error('expiresAt must be in the future')
  return expiresAt
}

function keyIsExpired(key: { expiresAt?: Date | null }) {
  return Boolean(key.expiresAt && key.expiresAt <= new Date())
}

function generateApiKeyToken() {
  return `atpm_${crypto.randomBytes(24).toString('base64url')}`
}

function generateMcpKeyToken() {
  return `sallymcp_${crypto.randomBytes(24).toString('base64url')}`
}

function generatePairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let value = ''
  for (let i = 0; i < 8; i += 1) value += alphabet[crypto.randomInt(alphabet.length)]
  return `${value.slice(0, 4)}-${value.slice(4)}`
}

async function ensureWorkerAuth(request: any, reply: any) {
  const token = extractAuthToken(request)
  if (!token) return false
  const hash = hashAgentWorkerToken(token)
  const connection = await prisma.agentConnection.findFirst({ where: { tokenHash: hash, revokedAt: null }, include: { workspace: true } })
  if (!connection || !verifyAgentWorkerToken(token, connection.tokenHash)) return false
  if (connection.workspace.archivedAt) return false
  await prisma.agentConnection.update({ where: { id: connection.id }, data: { status: AgentConnectionStatus.ONLINE, lastSeenAt: new Date() } })
  ;(request as any).agentConnection = connection
  ;(request as any).workspace = connection.workspace
  return true
}

async function emitAgentEvent(input: { workspaceId: string; agentId?: string | null; type: string; payload: unknown }) {
  const event = buildAgentEventPayload(input.type, input.payload)
  return prisma.agentEvent.create({ data: { workspaceId: input.workspaceId, agentId: input.agentId ?? null, type: event.type, payload: event.payload as any } })
}

type WorkItemRefBody = {
  provider?: string | null
  externalId?: string | null
  externalUrl?: string | null
  title?: string | null
  description?: string | null
  sallyTaskId?: string | null
  metadata?: unknown
}

function normalizeWorkItemProvider(provider?: string | null): WorkItemProvider {
  const normalized = provider?.trim().toUpperCase()
  if (!normalized || !(normalized in WorkItemProvider)) throw new Error('invalid work item provider')
  return WorkItemProvider[normalized as keyof typeof WorkItemProvider]
}

async function resolveWorkItemRef(input: { workspaceId: string; projectId?: string | null; taskId?: string | null; workItemRefId?: string | null; workItemRef?: WorkItemRefBody | null }) {
  const explicitId = input.workItemRefId?.trim()
  if (explicitId) {
    const existing = await prisma.workItemRef.findFirst({ where: { id: explicitId, workspaceId: input.workspaceId } })
    if (!existing) throw new Error('Work item ref not found')
    return existing.id
  }

  const taskId = input.taskId?.trim() || input.workItemRef?.sallyTaskId?.trim() || null
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: input.workspaceId } } })
    if (!task) throw new Error('Task not found')
    const existing = await prisma.workItemRef.findFirst({ where: { workspaceId: input.workspaceId, provider: WorkItemProvider.SALLY, sallyTaskId: task.id } })
    if (existing) return existing.id
    const created = await prisma.workItemRef.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: task.projectId,
        provider: WorkItemProvider.SALLY,
        sallyTaskId: task.id,
        titleSnapshot: task.title,
        descriptionSnapshot: task.description,
      },
    })
    return created.id
  }

  const workItemRef = input.workItemRef
  if (!workItemRef?.provider) return null
  const provider = normalizeWorkItemProvider(workItemRef.provider)
  const externalId = workItemRef.externalId?.trim() || workItemRef.externalUrl?.trim() || null
  if (!externalId) throw new Error('external work item refs require externalId or externalUrl')
  if (workItemRef.metadata !== undefined) assertNoSecretLikeJson(workItemRef.metadata, 'workItemRef.metadata')
  const projectId = input.projectId?.trim() || null
  const existing = await prisma.workItemRef.findFirst({ where: { workspaceId: input.workspaceId, provider, externalId } })
  if (existing) {
    const updated = await prisma.workItemRef.update({
      where: { id: existing.id },
      data: {
        projectId,
        externalUrl: workItemRef.externalUrl?.trim() || existing.externalUrl,
        titleSnapshot: workItemRef.title?.trim() || existing.titleSnapshot,
        descriptionSnapshot: workItemRef.description?.trim() || existing.descriptionSnapshot,
        metadata: workItemRef.metadata === undefined ? undefined : workItemRef.metadata as any,
      },
    })
    return updated.id
  }
  const created = await prisma.workItemRef.create({
    data: {
      workspaceId: input.workspaceId,
      projectId,
      provider: normalizeWorkItemProvider(workItemRef.provider),
      externalId,
      externalUrl: workItemRef.externalUrl?.trim() || null,
      titleSnapshot: workItemRef.title?.trim() || null,
      descriptionSnapshot: workItemRef.description?.trim() || null,
      metadata: workItemRef.metadata === undefined ? undefined : workItemRef.metadata as any,
    },
  })
  return created.id
}

async function moveTaskForWorkflow(input: { workspaceId: string; projectId?: string | null; taskId?: string | null; targetType: TaskStatusType; reason: string; actor?: ReturnType<typeof actorFromRequest> }) {
  const projectId = input.projectId?.trim()
  const taskId = input.taskId?.trim()
  if (!projectId || !taskId) return { ok: true, action: 'skipped', reason: 'missing_task' }
  const [task, targetStatus] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, projectId, archivedAt: null, project: { workspaceId: input.workspaceId, archivedAt: null } }, include: { status: true } }),
    prisma.taskStatus.findFirst({ where: { projectId, type: input.targetType }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
  ])
  if (!task || !targetStatus) return { ok: true, action: 'skipped', reason: !task ? 'task_not_found' : 'target_status_not_found' }
  if (task.statusId === targetStatus.id) return { ok: true, action: 'unchanged', statusId: targetStatus.id }
  await prisma.task.update({ where: { id: task.id }, data: { statusId: targetStatus.id } })
  await logActivity({ workspaceId: input.workspaceId, projectId, taskId, ...(input.actor ?? {}), type: 'task.workflow_status_synced', summary: `Moved task ${task.title} to ${targetStatus.name} from agent workflow state.`, payload: { taskId, fromStatusId: task.statusId, toStatusId: targetStatus.id, targetType: input.targetType, reason: input.reason } })
  return { ok: true, action: 'moved', statusId: targetStatus.id }
}

function targetStatusTypeForWorkflowJob(role: string | null | undefined, status: string | null | undefined): TaskStatusType | null {
  const normalizedStatus = status?.trim().toUpperCase()
  if (normalizedStatus === 'BLOCKED') return TaskStatusType.BLOCKED
  if (normalizedStatus === 'CLAIMED' || normalizedStatus === 'RUNNING') {
    const normalizedRole = role?.trim().toLowerCase()
    if (normalizedRole === 'reviewer' || normalizedRole === 'tester') return TaskStatusType.REVIEW
    return TaskStatusType.IN_PROGRESS
  }
  return null
}

async function reconcileWorkflowResolution(input: { workspaceId: string; projectId?: string | null; taskId?: string | null; eventId?: string | null; type: string; status?: string | null; jobId?: string | null; role?: string | null; workflowRunId?: string | null; workflowStep?: number | null; maxSteps?: number | null; actor?: ReturnType<typeof actorFromRequest> }) {
  const projectId = input.projectId?.trim()
  if (!projectId) return { ok: true, action: 'skipped', reason: 'missing_project' }
  const config = await prisma.projectAutomationConfig.findFirst({ where: { workspaceId: input.workspaceId, projectId } })
  if (!config?.workflowEnabled) return { ok: true, action: 'skipped', reason: 'automation_disabled' }

  const normalizedStatus = input.status?.trim().toUpperCase() || ''
  const deniedApproval = input.type === 'approval.resolved' && (normalizedStatus === ApprovalStatus.REJECTED || normalizedStatus === ApprovalStatus.CANCELLED)
  const cancelledBlocker = input.type === 'blocker.resolved' && normalizedStatus === BlockerStatus.CANCELLED
  const terminalFailure = input.type === 'job.finished' && ['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(normalizedStatus)
  const terminalBlocker = input.type === 'job.finished' && normalizedStatus === 'BLOCKED'
  if (deniedApproval || cancelledBlocker || terminalFailure || terminalBlocker) {
    const reason = deniedApproval ? 'approval_denied' : cancelledBlocker ? 'blocker_cancelled' : terminalBlocker ? 'job_blocked' : 'job_failed'
    if (terminalBlocker) await moveTaskForWorkflow({ workspaceId: input.workspaceId, projectId, taskId: input.taskId, targetType: TaskStatusType.BLOCKED, reason, actor: input.actor })
    await prisma.projectAutomationConfig.update({
      where: { projectId },
      data: { automationState: terminalFailure ? 'failed' : terminalBlocker ? 'blocked' : 'stopped', currentStage: terminalBlocker ? 'BLOCKED' : deniedApproval ? 'APPROVAL_NEEDED' : cancelledBlocker ? 'BLOCKED' : 'REWORK', nextRole: terminalBlocker || terminalFailure ? 'pm' : null, metadata: { source: 'sally_reconciliation', stopReason: reason, eventId: input.eventId ?? null, jobId: input.jobId ?? null, taskId: input.taskId ?? null, status: normalizedStatus } },
    })
    await logActivity({ workspaceId: input.workspaceId, projectId, taskId: input.taskId ?? null, ...(input.actor ?? {}), type: terminalFailure || terminalBlocker ? 'workflow.job_attention_needed' : 'workflow.stopped', summary: deniedApproval ? 'Stopped workflow after denied approval.' : cancelledBlocker ? 'Stopped workflow after cancelled blocker.' : terminalBlocker ? 'Workflow is blocked by an agent job.' : 'Workflow stopped after an agent job failed.', payload: { reason, eventId: input.eventId ?? null, jobId: input.jobId ?? null, status: normalizedStatus } })
    return { ok: true, action: terminalFailure || terminalBlocker ? 'attention_needed' : 'stopped', reason }
  }

  const [pendingApprovals, openBlockers, existingActiveWorkflowJob, lastWorkflowJob] = await Promise.all([
    prisma.approvalRequest.count({ where: { workspaceId: input.workspaceId, projectId, status: ApprovalStatus.PENDING } }),
    prisma.blocker.count({ where: { workspaceId: input.workspaceId, projectId, status: BlockerStatus.OPEN } }),
    prisma.agentJob.findFirst({ where: { workspaceId: input.workspaceId, projectId, mode: 'workflow', status: { in: [AgentJobStatus.QUEUED, AgentJobStatus.CLAIMED, AgentJobStatus.RUNNING] }, ...(input.jobId ? { id: { not: input.jobId } } : {}) }, orderBy: { createdAt: 'desc' } }),
    prisma.agentJob.findFirst({ where: { workspaceId: input.workspaceId, projectId, mode: 'workflow', workflowRunId: { not: null } }, orderBy: [{ workflowStep: 'desc' }, { createdAt: 'desc' }] }),
  ])
  if (pendingApprovals || openBlockers) {
    await prisma.projectAutomationConfig.update({ where: { projectId }, data: { automationState: pendingApprovals ? 'approval_needed' : 'blocked', currentStage: pendingApprovals ? 'APPROVAL_NEEDED' : 'BLOCKED', nextRole: 'pm' } })
    return { ok: true, action: 'waiting', pendingApprovals, openBlockers }
  }
  if (existingActiveWorkflowJob) {
    await prisma.projectAutomationConfig.update({ where: { projectId }, data: { automationState: existingActiveWorkflowJob.status === AgentJobStatus.QUEUED ? 'queued' : 'running', currentStage: existingActiveWorkflowJob.role === 'architect' ? 'ARCHITECTURE' : existingActiveWorkflowJob.role === 'reviewer' ? 'REVIEW' : existingActiveWorkflowJob.role === 'tester' ? 'TESTING' : existingActiveWorkflowJob.role === 'coder' ? 'EXECUTION' : 'INTAKE', nextRole: existingActiveWorkflowJob.role } })
    return { ok: true, action: 'already_active', jobId: existingActiveWorkflowJob.id, role: existingActiveWorkflowJob.role, status: existingActiveWorkflowJob.status }
  }

  const workflowRunId = input.workflowRunId?.trim() || lastWorkflowJob?.workflowRunId || randomUUID()
  const workflowStep = Math.max((lastWorkflowJob?.workflowStep ?? 0) + 1, (input.workflowStep ?? 0) + 1)
  const maxSteps = input.maxSteps ?? lastWorkflowJob?.maxSteps ?? 30
  if (workflowStep > maxSteps) {
    await prisma.projectAutomationConfig.update({ where: { projectId }, data: { automationState: 'stopped', currentStage: 'DONE', nextRole: null, metadata: { source: 'sally_reconciliation', stopReason: 'max_steps_reached', eventId: input.eventId ?? null, workflowRunId, workflowStep, maxSteps } } })
    await logActivity({ workspaceId: input.workspaceId, projectId, taskId: input.taskId ?? null, ...(input.actor ?? {}), type: 'workflow.stopped', summary: `Stopped workflow after reaching max steps (${maxSteps}).`, payload: { eventId: input.eventId ?? null, workflowRunId, workflowStep, maxSteps } })
    return { ok: true, action: 'stopped', reason: 'max_steps_reached' }
  }
  const resumeAction = input.type === 'approval.resolved' ? 'resume_after_approval_resolution' : input.type === 'blocker.resolved' ? 'resume_after_blocker_resolution' : 'resume_after_job_finished'
  const job = await prisma.agentJob.create({
    data: {
      workspaceId: input.workspaceId,
      projectId,
      taskId: input.taskId ?? null,
      agentId: config.defaultPmAgentId,
      role: 'pm',
      mode: 'workflow',
      triggerType: 'sally_reconciliation',
      workflowRunId,
      workflowStep,
      maxSteps,
      payload: { source: 'sally_reconciliation', action: resumeAction, eventId: input.eventId ?? null, completedJobId: input.jobId ?? null, completedRole: input.role ?? null, taskId: input.taskId ?? null, resolutionStatus: normalizedStatus } as any,
    },
    include: { agent: true },
  })
  await prisma.projectAutomationConfig.update({ where: { projectId }, data: { automationState: 'queued', currentStage: 'INTAKE', nextRole: 'pm' } })
  await emitAgentEvent({ workspaceId: input.workspaceId, agentId: job.agentId, type: 'job.created', payload: { jobId: job.id, projectId, taskId: job.taskId, role: job.role, mode: job.mode, workflowRunId: job.workflowRunId, workflowStep: job.workflowStep, maxSteps: job.maxSteps } })
  await logActivity({ workspaceId: input.workspaceId, projectId, taskId: input.taskId ?? null, ...(input.actor ?? {}), type: 'workflow.reconciliation_queued', summary: input.type === 'job.finished' ? 'Queued next PM workflow step after agent job finished.' : 'Queued PM reconciliation after approval/blocker resolution.', payload: { jobId: job.id, completedJobId: input.jobId ?? null, eventId: input.eventId ?? null, type: input.type, status: normalizedStatus, workflowStep, maxSteps } })
  return { ok: true, action: 'queued', jobId: job.id }
}

async function ensureAuth(request: any, reply: any) {
  const token = extractAuthToken(request)
  if (token && API_TOKEN && token === API_TOKEN) return true
  if (token) {
    const session = await prisma.accountSession.findFirst({
      where: { token, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { account: true },
    })
    if (session) {
      if (session.account.archivedAt) {
        reply.code(403).send({ ok: false, error: 'Account archived' })
        return false
      }
      ;(request as any).account = session.account
      ;(request as any).session = session
      return true
    }
    const apiKey = await prisma.accountApiKey.findFirst({
      where: { tokenHash: hashApiToken(token), revokedAt: null },
      include: { account: true },
    })
    if (apiKey) {
      if (apiKey.account.archivedAt) {
        reply.code(403).send({ ok: false, error: 'Account archived' })
        return false
      }
      if (keyIsExpired(apiKey)) {
        reply.code(401).send({ ok: false, error: 'API key expired', code: 'API_KEY_EXPIRED' })
        return false
      }
      await prisma.accountApiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      ;(request as any).account = apiKey.account
      ;(request as any).apiKey = { id: apiKey.id, label: apiKey.label, scopes: apiKey.scopes }
      return true
    }
    const mcpKey = await prisma.accountMcpKey.findFirst({
      where: { tokenHash: hashApiToken(token), revokedAt: null },
      include: { account: true, workspace: true },
    })
    if (mcpKey) {
      if (mcpKey.account.archivedAt) {
        reply.code(403).send({ ok: false, error: 'Account archived' })
        return false
      }
      if (keyIsExpired(mcpKey)) {
        reply.code(401).send({ ok: false, error: 'MCP key expired', code: 'MCP_KEY_EXPIRED' })
        return false
      }
      await prisma.accountMcpKey.update({ where: { id: mcpKey.id }, data: { lastUsedAt: new Date() } })
      ;(request as any).account = mcpKey.account
      ;(request as any).mcpKey = { id: mcpKey.id, label: mcpKey.label, workspaceId: mcpKey.workspaceId, workspaceSlug: mcpKey.workspace?.slug ?? null, scopes: mcpKey.scopes }
      return true
    }
    reply.code(401).send({ ok: false, error: 'Unauthorized' })
    return false
  }
  if (API_TOKEN) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' })
    return false
  }
  return true
}
async function resolveWorkspace(request: any, reply: any) {
  const query = (request as any).query as Record<string, any> | undefined
  const queryWorkspaceId = query?.workspaceId ?? query?.workspace_id
  const queryWorkspaceSlug = query?.workspaceSlug ?? query?.workspace_slug
  const workspaceId = readHeader(request, 'x-workspace-id') ?? queryWorkspaceId
  const workspaceSlug = readHeader(request, 'x-workspace-slug') ?? queryWorkspaceSlug
  const account = (request as any).account as { id: string } | undefined
  const mcpKey = (request as any).mcpKey as { workspaceId?: string | null; workspaceSlug?: string | null } | undefined
  if (mcpKey?.workspaceId) {
    const restrictedWorkspace = await prisma.workspace.findUnique({ where: { id: mcpKey.workspaceId } })
    if (!restrictedWorkspace) {
      reply.code(403).send({ ok: false, error: 'Restricted workspace not found' })
      return null
    }
    if (!ensureWorkspaceIsActive(restrictedWorkspace, reply)) return null
    if ((workspaceId && String(workspaceId) !== mcpKey.workspaceId) || (workspaceSlug && String(workspaceSlug) !== restrictedWorkspace.slug)) {
      reply.code(403).send({ ok: false, error: 'Workspace access denied by MCP key restriction' })
      return null
    }
    return restrictedWorkspace
  }
  let workspace = null

  if (account) {
    if (isPlatformAdmin(request)) {
      if (workspaceId) workspace = await prisma.workspace.findUnique({ where: { id: String(workspaceId) } })
      else if (workspaceSlug) workspace = await prisma.workspace.findUnique({ where: { slug: String(workspaceSlug) } })
      else {
        const count = await prisma.workspace.count({ where: { archivedAt: null } })
        if (count === 1) workspace = await prisma.workspace.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } })
        else {
          reply.code(400).send({ ok: false, error: 'workspace selector required' })
          return null
        }
      }
      if (!workspace) {
        reply.code(404).send({ ok: false, error: 'Workspace not found' })
        return null
      }
      if (!ensureWorkspaceIsActive(workspace, reply)) return null
      return workspace
    }
    const memberships = await prisma.workspaceMembership.findMany({
      where: { accountId: account.id },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!memberships.length) {
      reply.code(403).send({ ok: false, error: 'No workspace membership' })
      return null
    }
    let membership = null as (typeof memberships)[number] | null
    if (workspaceId) {
      membership = memberships.find((m) => m.workspaceId === String(workspaceId)) ?? null
    } else if (workspaceSlug) {
      membership = memberships.find((m) => m.workspace.slug === String(workspaceSlug)) ?? null
    } else if (memberships.length === 1) {
      membership = memberships[0]
    } else {
      reply.code(400).send({ ok: false, error: 'workspace selector required' })
      return null
    }
    if (!membership) {
      reply.code(403).send({ ok: false, error: 'Workspace access denied' })
      return null
    }
    if (!ensureWorkspaceIsActive(membership.workspace, reply)) return null
    ;(request as any).membership = membership
    return membership.workspace
  }

  if (workspaceId) {
    workspace = await prisma.workspace.findUnique({ where: { id: String(workspaceId) } })
  } else if (workspaceSlug) {
    workspace = await prisma.workspace.findUnique({ where: { slug: String(workspaceSlug) } })
  } else {
    const count = await prisma.workspace.count({ where: { archivedAt: null } })
    if (count === 1) {
      workspace = await prisma.workspace.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } })
    } else {
      reply.code(400).send({ ok: false, error: 'workspace selector required' })
      return null
    }
  }
  if (!workspace) {
    reply.code(404).send({ ok: false, error: 'Workspace not found' })
    return null
  }
  if (!ensureWorkspaceIsActive(workspace, reply)) return null
  return workspace
}
function toIsoOrNull(input?: string | null) { if (!input) return null; const v = input.trim(); if (!v) return null; return new Date(v).toISOString() }
function normalizeWorkspaceRole(input?: string) {
  if (!input) return WorkspaceRole.MEMBER
  const value = input.trim().toUpperCase()
  if (value === 'OWNER') return WorkspaceRole.OWNER
  if (value === 'MEMBER') return WorkspaceRole.MEMBER
  if (value === 'VIEWER') return WorkspaceRole.MEMBER
  return WorkspaceRole.MEMBER
}

function normalizeProjectRole(input?: string) {
  if (!input) return PROJECT_ROLE.MEMBER
  const value = input.trim().toUpperCase()
  if (value === 'OWNER') return PROJECT_ROLE.OWNER
  if (value === 'MEMBER') return PROJECT_ROLE.MEMBER
  if (value === 'VIEWER') return PROJECT_ROLE.MEMBER
  return null
}

function isSuperadmin(request: any) {
  const account = (request as any).account as { platformRole?: PlatformRole | null } | undefined
  return account?.platformRole === PlatformRole.SUPERADMIN
}

function isPlatformAdmin(request: any) {
  const account = (request as any).account as { platformRole?: PlatformRole | null } | undefined
  return account?.platformRole === PlatformRole.SUPERADMIN || account?.platformRole === PlatformRole.ADMIN
}

function ensureWorkspaceIsActive(workspace: { archivedAt?: Date | null } | null | undefined, reply: any) {
  if (workspace?.archivedAt) {
    reply.code(409).send({ ok: false, error: 'Workspace archived' })
    return false
  }
  return true
}

function normalizePlatformRole(input?: string | null) {
  const value = input?.trim().toUpperCase()
  if (value === 'SUPERADMIN') return PlatformRole.SUPERADMIN
  if (value === 'ADMIN') return PlatformRole.ADMIN
  if (value === 'NONE' || !value) return PlatformRole.NONE
  return null
}

async function requireWorkspaceRole(request: any, reply: any, roles: WorkspaceRole[]) {
  const account = (request as any).account as { id: string } | undefined
  const workspace = (request as any).workspace as { archivedAt?: Date | null } | undefined
  if (!ensureWorkspaceIsActive(workspace, reply)) return false
  if (!account) return true
  if (isPlatformAdmin(request)) return true
  const membership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (!membership) {
    reply.code(403).send({ ok: false, error: 'Workspace access denied' })
    return false
  }
  const effectiveRole = membership.role === WorkspaceRole.VIEWER ? WorkspaceRole.MEMBER : membership.role
  if (!roles.includes(effectiveRole)) {
    reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
    return false
  }
  return true
}

async function requireWorkspaceRoleForWorkspaceId(request: any, reply: any, workspaceId: string, roles: WorkspaceRole[]) {
  const account = (request as any).account as { id: string } | undefined
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    reply.code(404).send({ ok: false, error: 'Workspace not found' })
    return false
  }
  if (!ensureWorkspaceIsActive(workspace, reply)) return false
  ;(request as any).workspace = workspace
  if (!account) return true
  if (isPlatformAdmin(request)) return true
  const membership = await prisma.workspaceMembership.findFirst({ where: { workspaceId, accountId: account.id }, include: { workspace: true } })
  if (!membership) {
    reply.code(403).send({ ok: false, error: 'Workspace access denied' })
    return false
  }
  if (!ensureWorkspaceIsActive(membership.workspace, reply)) return false
  ;(request as any).membership = membership
  ;(request as any).workspace = membership.workspace
  const effectiveRole = membership.role === WorkspaceRole.VIEWER ? WorkspaceRole.MEMBER : membership.role
  if (!roles.includes(effectiveRole)) {
    reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
    return false
  }
  return true
}

async function requireProjectRole(request: any, reply: any, projectId: string, roles: ProjectRole[]) {
  const account = (request as any).account as { id: string } | undefined
  if (!account) return true
  const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (isPlatformAdmin(request)) return true
  if (workspaceMembership?.role === WorkspaceRole.OWNER) return true
  const membership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: account.id } })
  if (!membership) {
    reply.code(403).send({ ok: false, error: 'Project access denied' })
    return false
  }
  const effectiveRole = membership.role === 'VIEWER' ? PROJECT_ROLE.MEMBER : membership.role
  if (!roles.includes(effectiveRole)) {
    reply.code(403).send({ ok: false, error: 'Insufficient project permissions' })
    return false
  }
  return true
}

function getAccountTaskAssigneeNames(account: { name: string | null; email: string }) {
  return Array.from(new Set([account.name?.trim(), account.email?.trim()].filter(Boolean) as string[]))
}

async function getVisibleProjectIds(request: any, workspaceId: string) {
  const account = (request as any).account as { id: string } | undefined
  if (!account) return null as string[] | null
  const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (isPlatformAdmin(request)) return null as string[] | null
  if (workspaceMembership?.role === WorkspaceRole.OWNER) return null as string[] | null
  const memberships = await prisma.projectMembership.findMany({
    where: { accountId: account.id, project: { workspaceId } },
    select: { projectId: true },
  })
  return memberships.map((membership) => membership.projectId)
}

function visibleProjectWhere(projectIds: string[] | null) {
  if (projectIds === null) return {}
  if (!projectIds.length) return { id: { equals: '__never__' } }
  return { id: { in: projectIds } }
}

function workspaceRoleRank(role: WorkspaceRole) {
  if (role === WorkspaceRole.OWNER) return 3
  if (role === WorkspaceRole.MEMBER || role === WorkspaceRole.VIEWER) return 2
  return 1
}

function projectRoleRank(role: ProjectRole | 'VIEWER') {
  if (role === PROJECT_ROLE.OWNER) return 3
  if (role === PROJECT_ROLE.MEMBER || role === 'VIEWER') return 2
  return 1
}

function canManageWorkspaceRole(requesterRole: WorkspaceRole, targetRole: WorkspaceRole, nextRole?: WorkspaceRole) {
  const requester = workspaceRoleRank(requesterRole)
  const target = workspaceRoleRank(targetRole)
  const next = nextRole ? workspaceRoleRank(nextRole) : 0
  return requester > target && requester > next
}

function canManageProjectRole(requesterRole: ProjectRole | 'VIEWER', targetRole: ProjectRole | 'VIEWER', nextRole?: ProjectRole | 'VIEWER') {
  const requester = projectRoleRank(requesterRole)
  const target = projectRoleRank(targetRole)
  const next = nextRole ? projectRoleRank(nextRole) : 0
  return requester > target && requester > next
}

async function getTaskAccessScope(request: any, projectId: string) {
  const account = (request as any).account as { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: PlatformRole | null } | undefined
  if (!account) return { restricted: false, allowedAssignees: [] as string[] }
  const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (isPlatformAdmin(request) || workspaceMembership?.role === WorkspaceRole.OWNER) {
    return { restricted: false, allowedAssignees: [] as string[] }
  }
  const membership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: account.id } })
  if (!membership) return { restricted: false, allowedAssignees: [] as string[] }
  if (membership.role !== PROJECT_ROLE.MEMBER) return { restricted: false, allowedAssignees: [] as string[] }
  return { restricted: true, allowedAssignees: getAccountTaskAssigneeNames(account) }
}

function taskVisibilityWhere(scope: { restricted: boolean; allowedAssignees: string[] }) {
  if (!scope.restricted) return {}
  if (!scope.allowedAssignees.length) return { id: { equals: '__never__' } }
  return {
    OR: [
      { owner: { in: scope.allowedAssignees } },
      { participants: { some: { participant: { in: scope.allowedAssignees } } } },
      { assignee: { in: scope.allowedAssignees } },
      { collaborators: { some: { collaborator: { in: scope.allowedAssignees } } } },
    ],
  }
}

function canAccessTaskAssignee(
  scope: { restricted: boolean; allowedAssignees: string[] },
  assignee?: string | null,
  collaborators?: string[] | null,
  owner?: string | null,
  participants?: string[] | null,
) {
  return canAccessTaskParticipants(scope, assignee, collaborators, owner, participants)
}

function getResolvedTaskPeople(task: {
  owner?: string | null
  participants?: Array<{ participant: string; role: 'OWNER' | 'PARTICIPANT'; position: number }> | null
  assignee?: string | null
  collaborators?: Array<{ collaborator: string }> | null
}) {
  return resolveVisibleTaskPeople({
    owner: task.owner,
    participants: task.participants,
    assignee: task.assignee,
    collaborators: task.collaborators,
  })
}

function formatTaskPeopleForResponse(
  task: {
    owner?: string | null
    participants?: Array<{ participant: string; role: 'OWNER' | 'PARTICIPANT'; position: number }> | null
    assignee?: string | null
    collaborators?: Array<{ collaborator: string }> | null
  },
  avatarMap: Map<string, string | null>,
) {
  const people = getResolvedTaskPeople(task)
  return {
    owner: people.owner ?? 'Unassigned',
    ownerAvatarUrl: people.owner ? avatarMap.get(people.owner) ?? null : null,
    participants: people.participants.map((participant) => ({
      name: participant.participant,
      role: participant.role,
      position: participant.position,
      avatarUrl: avatarMap.get(participant.participant) ?? null,
    })),
    assignee: people.assignee ?? 'Unassigned',
    assigneeAvatarUrl: people.assignee ? avatarMap.get(people.assignee) ?? null : null,
    collaborators: people.collaborators.map((participant) => ({
      name: participant,
      avatarUrl: avatarMap.get(participant) ?? null,
    })),
  }
}

async function logActivity(input: { workspaceId: string; projectId?: string | null; taskId?: string | null; actorName?: string | null; actorEmail?: string | null; actorApiKeyLabel?: string | null; actorMcpKeyLabel?: string | null; type: string; summary: string; payload?: any }) {
  const basePayload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {}
  const payload = input.actorApiKeyLabel || input.actorMcpKeyLabel
    ? {
        ...basePayload,
        ...(input.actorApiKeyLabel ? { actorApiKeyLabel: input.actorApiKeyLabel } : {}),
        ...(input.actorMcpKeyLabel ? { actorMcpKeyLabel: input.actorMcpKeyLabel } : {}),
      }
    : input.payload
  await prisma.activityLog.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId ?? null, taskId: input.taskId ?? null, actorName: input.actorName ?? null, actorEmail: input.actorEmail ?? null, type: input.type, summary: input.summary, payload: payload ?? undefined } })
}


async function writeAuditLog(input: { workspaceId?: string | null; actorAccountId?: string | null; projectId?: string | null; taskId?: string | null; agentId?: string | null; agentJobId?: string | null; agentRunId?: string | null; action: string; targetType?: string | null; targetId?: string | null; summary?: string | null; metadata?: any }) {
  if (input.metadata !== undefined) assertNoSecretLikeJson(input.metadata, 'auditLog.metadata')
  await prisma.auditLogEvent.create({ data: { workspaceId: input.workspaceId ?? null, actorAccountId: input.actorAccountId ?? null, projectId: input.projectId ?? null, taskId: input.taskId ?? null, agentId: input.agentId ?? null, agentJobId: input.agentJobId ?? null, agentRunId: input.agentRunId ?? null, action: input.action, targetType: input.targetType ?? null, targetId: input.targetId ?? null, summary: input.summary ?? null, metadata: input.metadata ?? undefined } })
}

function formatAuditLogEvent(event: any) {
  return {
    id: event.id,
    workspaceId: event.workspaceId ?? null,
    projectId: event.projectId ?? null,
    taskId: event.taskId ?? null,
    agentId: event.agentId ?? null,
    agentJobId: event.agentJobId ?? null,
    agentRunId: event.agentRunId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    summary: event.summary ?? null,
    metadata: event.metadata ?? null,
    createdAt: event.createdAt.toISOString(),
    actor: event.actor ? { id: event.actor.id, email: event.actor.email, name: event.actor.name } : null,
  }
}

async function wouldCreateDependencyCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  const visited = new Set<string>()
  const queue = [dependsOnId]
  while (queue.length) {
    const current = queue.shift()!
    if (current === taskId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const deps = await prisma.taskDependency.findMany({ where: { taskId: current }, select: { dependsOnId: true } })
    queue.push(...deps.map((d) => d.dependsOnId))
  }
  return false
}

async function wouldCreateProjectDependencyCycle(projectId: string, dependsOnId: string): Promise<boolean> {
  const visited = new Set<string>()
  const queue = [dependsOnId]
  while (queue.length) {
    const current = queue.shift()!
    if (current === projectId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const deps = await prisma.projectDependency.findMany({ where: { projectId: current }, select: { dependsOnId: true } })
    queue.push(...deps.map((d) => d.dependsOnId))
  }
  return false
}

function actorFromRequest(request: any) {
  const account = (request as any).account as { id?: string | null; name?: string | null; email?: string | null } | undefined
  const apiKey = (request as any).apiKey as { label?: string | null } | undefined
  const mcpKey = (request as any).mcpKey as { label?: string | null } | undefined
  return { actorAccountId: account?.id ?? null, actorName: account?.name ?? null, actorEmail: account?.email ?? null, actorApiKeyLabel: apiKey?.label ?? null, actorMcpKeyLabel: mcpKey?.label ?? null }
}

async function deleteOrphanPlaceholderAccountByEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  const account = await prisma.account.findFirst({ where: { email: normalized } })
  if (!account) return false
  const [memberships, pendingInvites, sessions, apiKeys, mcpKeys, emailChanges, passwordResets, authoredComments, sentNotifications, receivedNotifications, commentMentions, projectMemberships] = await Promise.all([
    prisma.workspaceMembership.count({ where: { accountId: account.id } }),
    prisma.accountInvite.count({ where: { email: normalized, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.accountSession.count({ where: { accountId: account.id } }),
    prisma.accountApiKey.count({ where: { accountId: account.id } }),
    prisma.accountMcpKey.count({ where: { accountId: account.id } }),
    prisma.emailChangeToken.count({ where: { accountId: account.id } }),
    prisma.passwordReset.count({ where: { accountId: account.id } }),
    prisma.comment.count({ where: { authorAccountId: account.id } }),
    prisma.notification.count({ where: { actorAccountId: account.id } }),
    prisma.notification.count({ where: { recipientAccountId: account.id } }),
    prisma.commentMention.count({ where: { mentionedAccountId: account.id } }),
    prisma.projectMembership.count({ where: { accountId: account.id } }),
  ])
  const isOrphanPlaceholder = memberships === 0 && pendingInvites === 0 && sessions === 0 && apiKeys === 0 && mcpKeys === 0 && emailChanges === 0 && passwordResets === 0 && authoredComments === 0 && sentNotifications === 0 && receivedNotifications === 0 && commentMentions === 0 && projectMemberships === 0
  if (!isOrphanPlaceholder) return false
  await prisma.account.delete({ where: { id: account.id } })
  return true
}

function activityValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

const NOTIFICATION_EVENT_TYPES = ['comment.mentioned', 'task.assigned'] as const

function activityChange(label: string, before: unknown, after: unknown) {
  return `${label}: ${activityValue(before)} → ${activityValue(after)}`
}

async function getEffectiveProjectMembers(workspaceId: string, projectId: string, requesterAccountId?: string | null) {
  const configuredSuperadminEmail = getConfiguredSuperadminEmail()
  const [projectMemberships, workspaceOwners, superadminAccount] = await Promise.all([
    prisma.projectMembership.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, include: { account: true } }),
    prisma.workspaceMembership.findMany({ where: { workspaceId, role: WorkspaceRole.OWNER }, orderBy: { createdAt: 'asc' }, include: { account: true } }),
    configuredSuperadminEmail
      ? prisma.account.findFirst({ where: { email: configuredSuperadminEmail } })
      : requesterAccountId
        ? prisma.account.findFirst({ where: { id: requesterAccountId } })
        : Promise.resolve(null),
  ])

  const members = new Map<string, { id: string; accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; createdAt: string; locked?: boolean; workspaceRole?: string | null; platformRole?: string | null }>()

  for (const membership of projectMemberships) {
    members.set(membership.accountId, {
      id: membership.id,
      accountId: membership.accountId,
      name: membership.account.name,
      email: membership.account.email,
      avatarUrl: membership.account.avatarUrl,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      locked: membership.role === PROJECT_ROLE.OWNER,
      workspaceRole: null,
      platformRole: membership.account.platformRole,
    })
  }

  for (const membership of workspaceOwners) {
    const existing = members.get(membership.accountId)
    if (existing) {
      existing.role = PROJECT_ROLE.OWNER
      existing.locked = true
      existing.workspaceRole = membership.role
      existing.platformRole = existing.platformRole ?? membership.account.platformRole
      continue
    }
    members.set(membership.accountId, {
      id: `workspace-owner:${membership.id}`,
      accountId: membership.accountId,
      name: membership.account.name,
      email: membership.account.email,
      avatarUrl: membership.account.avatarUrl,
      role: PROJECT_ROLE.OWNER,
      createdAt: membership.createdAt.toISOString(),
      locked: true,
      workspaceRole: membership.role,
      platformRole: membership.account.platformRole,
    })
  }

  if (superadminAccount?.platformRole === PlatformRole.SUPERADMIN) {
    const existing = members.get(superadminAccount.id)
    if (existing) {
      existing.locked = true
      existing.platformRole = PlatformRole.SUPERADMIN
    } else {
      members.set(superadminAccount.id, {
        id: `superadmin:${superadminAccount.id}`,
        accountId: superadminAccount.id,
        name: superadminAccount.name,
        email: superadminAccount.email,
        avatarUrl: superadminAccount.avatarUrl,
        role: PROJECT_ROLE.OWNER,
        createdAt: superadminAccount.createdAt.toISOString(),
        locked: true,
        workspaceRole: null,
        platformRole: PlatformRole.SUPERADMIN,
      })
    }
  }

  return Array.from(members.values())
}

async function getAssigneeAvatarMap(workspaceId: string, assignees: Array<string | null | undefined>) {
  const desired = Array.from(new Set(assignees.map((value) => value?.trim()).filter(Boolean) as string[]))
  const map = new Map<string, string | null>()
  if (!desired.length) return map
  const memberships = await prisma.workspaceMembership.findMany({
    where: {
      workspaceId,
      account: {
        OR: [{ name: { in: desired } }, { email: { in: desired } }],
      },
    },
    include: { account: true },
  })
  for (const membership of memberships) {
    if (membership.account.name?.trim()) map.set(membership.account.name.trim(), membership.account.avatarUrl ?? null)
    if (membership.account.email?.trim()) map.set(membership.account.email.trim(), membership.account.avatarUrl ?? null)
  }
  return map
}

async function resolveWorkspaceAccountMembership(workspaceId: string, identity?: string | null) {
  const value = identity?.trim()
  if (!value) return null
  return prisma.workspaceMembership.findFirst({
    where: {
      workspaceId,
      account: {
        OR: [
          { name: value },
          { email: value.toLowerCase() },
        ],
      },
    },
    include: { account: true },
  })
}

async function ensureProjectMembershipForAssignee(workspaceId: string, projectId: string, assignee?: string | null) {
  const value = assignee?.trim()
  if (!value) return null

  const workspaceMembership = await resolveWorkspaceAccountMembership(workspaceId, value)
  if (workspaceMembership) {
    const existing = await prisma.projectMembership.findFirst({ where: { projectId, accountId: workspaceMembership.accountId } })
    if (!existing) {
      await prisma.projectMembership.create({ data: { projectId, accountId: workspaceMembership.accountId, role: PROJECT_ROLE.MEMBER } })
    } else if (existing.role === 'VIEWER') {
      await prisma.projectMembership.update({ where: { id: existing.id }, data: { role: PROJECT_ROLE.MEMBER } })
    }
    return workspaceMembership
  }

  const account = await prisma.account.findFirst({
    where: {
      OR: [
        { name: value },
        { email: value.toLowerCase() },
      ],
    },
  })
  if (!account) return null

  const existingProjectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: account.id } })
  if (!existingProjectMembership) return null
  if (existingProjectMembership.role === 'VIEWER') {
    await prisma.projectMembership.update({ where: { id: existingProjectMembership.id }, data: { role: PROJECT_ROLE.MEMBER } })
  }
  return { accountId: account.id, account }
}

async function createNotification(input: { workspaceId: string; recipientAccountId: string; actorAccountId?: string | null; projectId?: string | null; taskId?: string | null; type: string; title: string; body: string; data?: any }) {
  const preference = await prisma.notificationPreference.findFirst({ where: { accountId: input.recipientAccountId, eventType: input.type } })
  const inAppEnabled = preference?.inAppEnabled ?? true
  const emailEnabled = preference?.emailEnabled ?? true
  if (!inAppEnabled && !emailEnabled) return

  const notification = await prisma.notification.create({
    data: {
      workspaceId: input.workspaceId,
      recipientAccountId: input.recipientAccountId,
      actorAccountId: input.actorAccountId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? undefined,
      ...(inAppEnabled ? {} : { readAt: new Date() }),
      deliveries: emailEnabled ? { create: [{ channel: 'email', status: 'pending' }] } : undefined,
    },
  })
  return notification
}

async function notifyTaskAssignment(input: { workspaceId: string; projectId: string; taskId: string; taskTitle: string; assignee?: string | null; actorAccountId?: string | null }) {
  const membership = await resolveWorkspaceAccountMembership(input.workspaceId, input.assignee)
  if (!membership) return
  if (input.actorAccountId && membership.accountId === input.actorAccountId) return
  await createNotification({
    workspaceId: input.workspaceId,
    recipientAccountId: membership.accountId,
    actorAccountId: input.actorAccountId ?? null,
    projectId: input.projectId,
    taskId: input.taskId,
    type: 'task.assigned',
    title: 'You were assigned a task',
    body: input.taskTitle,
    data: { assignee: input.assignee, taskTitle: input.taskTitle },
  })
}

async function formatNotificationEmail(notification: { type: string; title: string; body: string; data: any; actor?: { name: string | null; email: string } | null; project?: { name: string } | null; task?: { title: string } | null }) {
  const actorName = notification.actor?.name?.trim() || notification.actor?.email || 'Someone'
  const projectName = notification.project?.name?.trim() || null
  const taskTitle = notification.task?.title?.trim() || (typeof notification.data?.taskTitle === 'string' ? notification.data.taskTitle.trim() : '') || notification.body.replace(/^Task:\s*/i, '').trim() || null

  if (notification.type === 'task.assigned') {
    return {
      subject: taskTitle ? `Task assigned: ${taskTitle}` : notification.title,
      title: 'You were assigned a task',
      intro: `${actorName} assigned a task to you in sally_.`,
      body: taskTitle ? `Task: ${taskTitle}` : notification.body,
      eyebrow: 'Task assignment',
      actionLabel: taskTitle ? `Open task: ${taskTitle}` : 'Open task',
      meta: [projectName ? `Project: ${projectName}` : '', `Actor: ${actorName}`],
    }
  }

  if (notification.type === 'comment.mentioned') {
    const commentId = typeof notification.data?.commentId === 'string' ? notification.data.commentId : null
    const comment = commentId ? await prisma.comment.findUnique({ where: { id: commentId } }) : null
    const commentBody = comment?.body?.trim()
    return {
      subject: taskTitle ? `Mentioned in: ${taskTitle}` : notification.title,
      title: 'You were mentioned in a comment',
      intro: `${actorName} mentioned you in a task comment.`,
      body: taskTitle
        ? `Task: ${taskTitle}${commentBody ? `\n\nComment:\n${commentBody}` : ''}`
        : commentBody || notification.body,
      eyebrow: 'Mention',
      actionLabel: taskTitle ? `Open task: ${taskTitle}` : 'Open task',
      meta: [projectName ? `Project: ${projectName}` : '', `Actor: ${actorName}`],
    }
  }

  return {
    subject: notification.title,
    title: notification.title,
    intro: 'You have a new sally_ notification.',
    body: `${actorName} · ${notification.body}`,
    eyebrow: 'Notification',
    actionLabel: 'Open in sally_',
    meta: [projectName ? `Project: ${projectName}` : '', taskTitle ? `Task: ${taskTitle}` : ''],
  }
}

async function processPendingNotificationDeliveries(limit = 20) {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { channel: 'email', status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      notification: {
        include: {
          recipient: true,
          actor: true,
          project: true,
          task: true,
        },
      },
    },
  })

  const baseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, '')

  for (const delivery of deliveries) {
    const notification = delivery.notification
    const workspaceUrl = baseUrl ? `${baseUrl}/?workspaceId=${encodeURIComponent(notification.workspaceId)}` : undefined
    const actionUrl = notification.taskId && baseUrl ? `${baseUrl}/tasks/${notification.taskId}?workspaceId=${encodeURIComponent(notification.workspaceId)}` : notification.projectId && baseUrl ? `${baseUrl}/projects/${notification.projectId}?workspaceId=${encodeURIComponent(notification.workspaceId)}` : undefined
    const emailContent = await formatNotificationEmail(notification)
    const result = await sendNotificationEmail({
      email: notification.recipient.email,
      subject: emailContent.subject,
      title: emailContent.title,
      intro: emailContent.intro,
      body: emailContent.body,
      eyebrow: emailContent.eyebrow,
      actionLabel: actionUrl ? emailContent.actionLabel : undefined,
      actionUrl,
      brandUrl: workspaceUrl,
      meta: emailContent.meta,
    })
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: result.ok ? { status: 'sent', sentAt: new Date(), attempts: { increment: 1 } } : { status: 'failed', lastError: result.reason || 'Failed to send email notification', attempts: { increment: 1 } },
    })
  }
}

async function ensureTimesheetUser(workspaceId: string, account: { id: string; name: string | null; email: string }) {
  const userName = account.name?.trim() || account.email?.trim()
  if (!userName) return null
  const user = await prisma.user.upsert({
    where: { workspaceId_name: { workspaceId, name: userName } },
    update: { ...(account.email ? { email: account.email } : {}) },
    create: { workspaceId, name: userName, email: account.email || null },
  })
  return user
}

async function resolveTimesheetScope(request: any, workspaceId: string, projectId?: string) {
  const account = (request as any).account as { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: PlatformRole | null } | undefined
  if (!account) return { elevated: true, userId: null as string | null }
  const user = await ensureTimesheetUser(workspaceId, account)
  const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (isPlatformAdmin(request) || workspaceMembership?.role === WorkspaceRole.OWNER) return { elevated: true, userId: user?.id ?? null }
  if (projectId) {
    const projectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: account.id } })
    if (projectMembership?.role === PROJECT_ROLE.OWNER) return { elevated: true, userId: user?.id ?? null }
  }
  return { elevated: false, userId: user?.id ?? null }
}

function validateStrongPassword(password: string) {
  const checks = [
    password.length >= 12,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  return checks.every(Boolean)
}

const STRONG_PASSWORD_HINT = 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'

const scryptAsync = promisify(crypto.scrypt)

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url')
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}

function getSessionExpiry() {
  const days = Number.isFinite(SESSION_TTL_DAYS) && SESSION_TTL_DAYS > 0 ? SESSION_TTL_DAYS : 30
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function getInviteExpiry() {
  const days = Number.isFinite(INVITE_TTL_DAYS) && INVITE_TTL_DAYS > 0 ? INVITE_TTL_DAYS : 7
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function getResetExpiry() {
  const hours = Number.isFinite(RESET_TTL_HOURS) && RESET_TTL_HOURS > 0 ? RESET_TTL_HOURS : 2
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

function getEmailChangeExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}

function getConfiguredSuperadminEmail() {
  return process.env.SUPERADMIN_EMAIL?.trim().toLowerCase() || null
}

function getConfiguredSuperadminPasswordHash() {
  return process.env.SUPERADMIN_PASSWORD_HASH?.trim() || null
}

function isConfiguredSuperadminEmail(email?: string | null) {
  const configuredEmail = getConfiguredSuperadminEmail()
  return Boolean(configuredEmail && email?.trim().toLowerCase() === configuredEmail)
}

function superadminPasswordResetDisabled() {
  const value = process.env.SUPERADMIN_DISABLE_PASSWORD_RESET?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

async function syncConfiguredSuperadmin() {
  const configuredEmail = getConfiguredSuperadminEmail()
  if (!configuredEmail) return
  await prisma.account.updateMany({ where: { platformRole: PlatformRole.SUPERADMIN, email: { not: configuredEmail } }, data: { platformRole: PlatformRole.NONE } })
  await prisma.account.updateMany({ where: { email: configuredEmail }, data: { platformRole: PlatformRole.SUPERADMIN } })
}

async function getInitialPlatformRole(email?: string | null) {
  const configuredEmail = getConfiguredSuperadminEmail()
  if (configuredEmail) return email?.trim().toLowerCase() === configuredEmail ? PlatformRole.SUPERADMIN : PlatformRole.NONE
  const accountCount = await prisma.account.count()
  return accountCount === 0 ? PlatformRole.SUPERADMIN : PlatformRole.NONE
}

function summarizeTimesheets(entries: { minutes: number; billable: boolean }[]) {
  return {
    totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    billableMinutes: entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.minutes, 0),
    entries: entries.length,
  }
}

function formatTimesheetEntry(entry: { id: string; userId: string; date: Date; minutes: number; description: string | null; billable: boolean; validated: boolean; createdAt: Date; user: { name: string }; taskId?: string | null; task?: { title: string | null } }) {
  return {
    id: entry.id,
    userId: entry.userId,
    userName: entry.user.name,
    projectId: 'projectId' in entry ? (entry as any).projectId : undefined,
    taskId: entry.taskId ?? null,
    taskTitle: entry.task?.title ?? null,
    date: entry.date.toISOString(),
    minutes: entry.minutes,
    description: entry.description,
    billable: entry.billable,
    validated: entry.validated,
    createdAt: entry.createdAt.toISOString(),
  }
}

async function getBoardData(request: any, workspaceId: string, projectId?: string) {
  const visibleProjectIdsForBoard = await getVisibleProjectIds(request, workspaceId)
  const statuses = await prisma.taskStatus.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(visibleProjectIdsForBoard === null ? {} : { projectId: { in: visibleProjectIdsForBoard } }),
      project: { workspaceId },
    },
    orderBy: [{ position: 'asc' }],
    include: {
      tasks: {
        where: { archivedAt: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          labels: { include: { label: true } },
          participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
          collaborators: true,
          todos: true,
        },
      },
    },
  })

  const projectIds = Array.from(new Set(statuses.map((status) => status.projectId)))
  const taskScopes = new Map<string, { restricted: boolean; allowedAssignees: string[] }>()
  for (const id of projectIds) taskScopes.set(id, await getTaskAccessScope(request, id))
  const assigneeAvatars = await getAssigneeAvatarMap(
    workspaceId,
    statuses.flatMap((status) => status.tasks.flatMap((task) => getResolvedTaskPeople(task).participants.map((participant) => participant.participant))),
  )

  return statuses.map((status) => ({
    id: status.id,
    title: status.name,
    type: status.type,
    color: status.color,
    cards: status.tasks
      .filter((task) => {
        const people = getResolvedTaskPeople(task)
        return canAccessTaskAssignee(
          taskScopes.get(status.projectId) || { restricted: false, allowedAssignees: [] },
          people.assignee,
          people.collaborators,
          people.owner,
          people.participants.map((participant) => participant.participant),
        )
      })
      .map((task) => {
        const people = formatTaskPeopleForResponse(task, assigneeAvatars)
        return {
          id: task.id,
          number: task.number,
          position: task.position,
          title: task.title,
          meta: `${people.owner} · ${task.priority}`,
          description: task.description ?? 'No description yet.',
          ...people,
          priority: task.priority,
          status: status.name,
          statusId: status.id,
          statusColor: status.color,
          dueDate: task.dueDate?.toISOString() ?? null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          labels: task.labels.map((l) => l.label.name),
          todoProgress: task.todos.length ? `${task.todos.filter((t) => t.done).length}/${task.todos.length}` : null,
        }
      }),
  }))
}

type McpTool = { name: string; description: string; inputSchema: Record<string, unknown> }
type HostedMcpSession = {
  server: McpProtocolServer
  transport: StreamableHTTPServerTransport
  account: { id: string; name: string | null; email: string }
  mcpKey: { id: string; label: string; workspaceId: string | null; workspaceSlug: string | null }
  authorization: string
}

const hostedMcpSessions = new Map<string, HostedMcpSession>()

const hostedMcpTools: McpTool[] = [
  { name: 'workspace.list', description: 'List accessible workspaces.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'client.list', description: 'List visible clients in the current workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' } }, additionalProperties: false } },
  { name: 'client.get', description: 'Get full client details.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, clientId: { type: 'string' } }, required: ['clientId'], additionalProperties: false } },
  { name: 'client.create', description: 'Create a client.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } }, required: ['name'], additionalProperties: false } },
  { name: 'client.update', description: 'Update a client.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, clientId: { type: 'string' }, name: { type: 'string' }, notes: { type: ['string', 'null'] } }, required: ['clientId'], additionalProperties: false } },
  { name: 'client.delete', description: 'Delete a client with no linked projects.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, clientId: { type: 'string' } }, required: ['clientId'], additionalProperties: false } },
  { name: 'project.list', description: 'List projects in the current workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, archived: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'project.get', description: 'Get full project details.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.create', description: 'Create a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, clientId: { type: ['string', 'null'] } }, required: ['name'], additionalProperties: false } },
  { name: 'project.update', description: 'Update a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, clientId: { type: ['string', 'null'] } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.archive', description: 'Archive or unarchive a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.delete', description: 'Delete a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.status.create', description: 'Create a project status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, name: { type: 'string' }, type: { type: 'string', enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'] } }, required: ['projectId', 'name', 'type'], additionalProperties: false } },
  { name: 'project.status.update', description: 'Update a project status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, statusId: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'project.status.delete', description: 'Delete a project status, optionally moving tasks to a replacement status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, statusId: { type: 'string' }, targetStatusId: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'project.status.reorder', description: 'Reorder project statuses while keeping the first status pinned.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, orderedStatusIds: { type: 'array', items: { type: 'string' } } }, required: ['projectId', 'orderedStatusIds'], additionalProperties: false } },
  { name: 'workspace.invite', description: 'Invite a user into a workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } }, required: ['email', 'role'], additionalProperties: false } },
  { name: 'project.member.list', description: 'List project members.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.member.add', description: 'Add a member to a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, accountId: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } }, required: ['projectId', 'role'], additionalProperties: false } },
  { name: 'project.member.update', description: 'Update a project member role.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, membershipId: { type: 'string' }, role: { type: 'string' } }, required: ['projectId', 'membershipId', 'role'], additionalProperties: false } },
  { name: 'project.member.remove', description: 'Remove a member from a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, membershipId: { type: 'string' } }, required: ['projectId', 'membershipId'], additionalProperties: false } },
  { name: 'task.list', description: 'List tasks for a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, status: { type: 'string' }, assignee: { type: 'string' }, search: { type: 'string' }, label: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'task.get', description: 'Get full task details.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.create', description: 'Create a task in a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, title: { type: 'string' }, owner: { type: 'string' }, participants: { type: 'array', items: { type: 'string' } }, assignee: { type: 'string' }, collaborators: { type: 'array', items: { type: 'string' } }, description: { type: 'string' }, priority: { type: 'string' }, status: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: ['string','null'] }, labels: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } }, required: ['projectId','title'], additionalProperties: false } },
  { name: 'task.update', description: 'Update a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, owner: { type: 'string' }, participants: { type: 'array', items: { type: 'string' } }, assignee: { type: 'string' }, collaborators: { type: 'array', items: { type: 'string' } }, priority: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: ['string','null'] } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.archive', description: 'Archive or unarchive a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.delete', description: 'Delete a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.move', description: 'Move a task by target status name.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, targetStatus: { type: 'string' } }, required: ['taskId', 'targetStatus'], additionalProperties: false } },
  { name: 'task.reorder', description: 'Move a task into a target status and set the full ordered task list for that column.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, targetStatusId: { type: 'string' }, orderedTaskIds: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'targetStatusId', 'orderedTaskIds'], additionalProperties: false } },
  { name: 'task.labels.update', description: 'Replace the full label set for a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'labels'], additionalProperties: false } },
  { name: 'task.todo.create', description: 'Add a checklist item to a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, text: { type: 'string' } }, required: ['taskId', 'text'], additionalProperties: false } },
  { name: 'task.todo.update', description: 'Update a checklist item on a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, todoId: { type: 'string' }, text: { type: 'string' }, done: { type: 'boolean' } }, required: ['taskId', 'todoId'], additionalProperties: false } },
  { name: 'task.todo.delete', description: 'Delete a checklist item from a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, todoId: { type: 'string' } }, required: ['taskId', 'todoId'], additionalProperties: false } },
  { name: 'task.todo.reorder', description: 'Reorder task checklist items by providing the full ordered todo id list.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, orderedTodoIds: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'orderedTodoIds'], additionalProperties: false } },
  { name: 'comment.add', description: 'Add a comment to a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, body: { type: 'string' }, author: { type: 'string' }, mentions: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'body'], additionalProperties: false } },
  { name: 'timesheet.list', description: 'List timesheets for a project or task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, additionalProperties: false } },
  { name: 'timesheet.report', description: 'Get a timesheet report across the workspace or a filtered scope.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, projectId: { type: 'string' }, clientId: { type: 'string' }, taskId: { type: 'string' }, userId: { type: 'string' }, showValidated: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'timesheet.users', description: 'List timesheet users available for the current scope.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' } }, additionalProperties: false } },
  { name: 'timesheet.add', description: 'Add a timesheet entry.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: ['string','null'] }, userId: { type: 'string' }, userName: { type: 'string' }, date: { type: 'string' }, minutes: { type: 'number' }, description: { type: 'string' }, billable: { type: 'boolean' }, validated: { type: 'boolean' } }, required: ['projectId', 'minutes'], additionalProperties: false } },
  { name: 'timesheet.update', description: 'Update a timesheet entry.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, timesheetId: { type: 'string' }, minutes: { type: 'number' }, description: { type: ['string', 'null'] }, date: { type: 'string' }, billable: { type: 'boolean' }, validated: { type: 'boolean' }, taskId: { type: ['string', 'null'] }, userId: { type: 'string' } }, required: ['timesheetId'], additionalProperties: false } },
  { name: 'timesheet.delete', description: 'Delete a timesheet entry.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, timesheetId: { type: 'string' } }, required: ['timesheetId'], additionalProperties: false } },
  { name: 'agent.list', description: 'List Sally agent identities in the current workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, role: { type: 'string' }, enabled: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'agent_job.create', description: 'Queue a Sally-native or external-work-item agent job for Hermes or remote Hermes to claim.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: ['string','null'] }, taskId: { type: ['string','null'] }, agentId: { type: ['string','null'] }, role: { type: 'string' }, mode: { type: 'string' }, triggerType: { type: 'string' }, workflowRunId: { type: ['string','null'] }, workflowStep: { type: ['number','null'] }, maxSteps: { type: ['number','null'] }, workItemRefId: { type: ['string','null'] }, workItemRef: { type: ['object','null'] }, payload: { type: 'object' } }, required: ['role'], additionalProperties: false } },
  { name: 'agent_job.list', description: 'List Sally-native agent jobs in the current workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, status: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, role: { type: 'string' } }, additionalProperties: false } },
  { name: 'agent_job.claim', description: 'Atomically claim a queued Sally-native agent job.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, jobId: { type: 'string' }, agentId: { type: ['string','null'] } }, required: ['jobId'], additionalProperties: false } },
  { name: 'agent_job.update', description: 'Update Sally-native agent job status, error, or safe payload metadata.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, jobId: { type: 'string' }, status: { type: 'string' }, error: { type: ['string','null'] }, payload: { type: 'object' } }, required: ['jobId'], additionalProperties: false } },
  { name: 'agent_run.create', description: 'Create a visible Sally agent run record for Hermes execution.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: ['string','null'] }, taskId: { type: ['string','null'] }, jobId: { type: ['string','null'] }, agentId: { type: ['string','null'] }, role: { type: 'string' }, status: { type: 'string' }, triggerType: { type: 'string' }, provider: { type: ['string','null'] }, model: { type: ['string','null'] }, workflowRunId: { type: ['string','null'] }, workflowStep: { type: ['number','null'] }, workItemRefId: { type: ['string','null'] }, workItemRef: { type: ['object','null'] }, summary: { type: ['string','null'] }, logUrl: { type: ['string','null'] }, evidenceUrl: { type: ['string','null'] }, metadata: { type: 'object' } }, required: ['role'], additionalProperties: false } },
  { name: 'agent_run.update', description: 'Update a Sally agent run status and safe execution metadata.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, runId: { type: 'string' }, status: { type: 'string' }, summary: { type: ['string','null'] }, error: { type: ['string','null'] }, logUrl: { type: ['string','null'] }, evidenceUrl: { type: ['string','null'] }, metadata: { type: 'object' } }, required: ['runId'], additionalProperties: false } },
  { name: 'agent_run.heartbeat', description: 'Update the latest heartbeat timestamp for a Sally agent run.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, runId: { type: 'string' } }, required: ['runId'], additionalProperties: false } },
]

function extractMcpBearerToken(request: any) {
  const auth = readHeader(request, 'authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return readHeader(request, 'x-api-key')
}

async function ensureMcpAuth(request: any, reply: any) {
  const token = extractMcpBearerToken(request)
  if (!token) {
    reply.code(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing MCP key' }, id: null })
    return false
  }
  const key = await prisma.accountMcpKey.findFirst({ where: { tokenHash: hashApiToken(token), revokedAt: null }, include: { account: true, workspace: true } })
  if (!key) {
    reply.code(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid MCP key' }, id: null })
    return false
  }
  if (keyIsExpired(key)) {
    reply.code(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'MCP key expired' }, id: null })
    return false
  }
  await prisma.accountMcpKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  ;(request as any).account = key.account
  ;(request as any).mcpKey = { id: key.id, label: key.label, workspaceId: key.workspaceId, workspaceSlug: key.workspace?.slug ?? null, scopes: key.scopes }
  return true
}

function mcpResult(id: unknown, result: unknown) { return { jsonrpc: '2.0', id: id ?? null, result } }
function mcpError(id: unknown, code: number, message: string) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } } }

function mcpHeaders(request: any, args: Record<string, any>) {
  return {
    authorization: readHeader(request, 'authorization') || request.authorization || '',
    'x-workspace-id': args.workspaceId || '',
    'x-workspace-slug': args.workspaceSlug || '',
  }
}

async function injectJson(request: any, options: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; url: string; args: Record<string, any>; payload?: Record<string, any> }) {
  const response = await app.inject({ method: options.method, url: options.url, payload: options.payload, headers: mcpHeaders(request, options.args) })
  const bodyText = response.body || '{}'
  const body = JSON.parse(bodyText)
  if (response.statusCode >= 400) throw new Error(body?.error || body?.message || `Request failed (${response.statusCode})`)
  return body
}

async function callHostedMcpTool(request: any, name: string, args: Record<string, any>) {
  switch (name) {
    case 'workspace.list': {
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: request.account.id, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      const items = memberships
        .filter((membership) => !request.mcpKey?.workspaceId || membership.workspaceId === request.mcpKey.workspaceId)
        .map((membership) => ({ id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug, role: membership.role }))
      return { items }
    }
    case 'client.list':
      return { items: await injectJson(request, { method: 'GET', url: '/clients', args }) }
    case 'client.get':
      return await injectJson(request, { method: 'GET', url: `/clients/${args.clientId}`, args })
    case 'client.create':
      return await injectJson(request, { method: 'POST', url: '/clients', args, payload: { name: args.name, notes: args.notes } })
    case 'client.update':
      return await injectJson(request, { method: 'PATCH', url: `/clients/${args.clientId}`, args, payload: { name: args.name, notes: args.notes } })
    case 'client.delete':
      return await injectJson(request, { method: 'DELETE', url: `/clients/${args.clientId}`, args })
    case 'project.list': {
      const params = new URLSearchParams()
      if (args.archived) params.set('archived', 'true')
      const q = params.toString()
      return { items: await injectJson(request, { method: 'GET', url: `/projects${q ? `?${q}` : ''}`, args }) }
    }
    case 'project.get': {
      const q = args.archived ? '?archived=true' : ''
      return await injectJson(request, { method: 'GET', url: `/projects/${args.projectId}${q}`, args })
    }
    case 'project.create':
      return await injectJson(request, { method: 'POST', url: '/projects', args, payload: { name: args.name, description: args.description, clientId: args.clientId } })
    case 'project.update':
      return await injectJson(request, { method: 'PATCH', url: `/projects/${args.projectId}`, args, payload: { name: args.name, description: args.description, clientId: args.clientId } })
    case 'project.archive':
      return await injectJson(request, { method: 'POST', url: `/projects/${args.projectId}/archive`, args, payload: { archived: args.archived } })
    case 'project.delete':
      return await injectJson(request, { method: 'DELETE', url: `/projects/${args.projectId}`, args })
    case 'project.status.create':
      return await injectJson(request, { method: 'POST', url: `/projects/${args.projectId}/statuses`, args, payload: { name: args.name } })
    case 'project.status.update':
      return await injectJson(request, { method: 'PATCH', url: `/projects/${args.projectId}/statuses/${args.statusId}`, args, payload: { name: args.name, color: args.color } })
    case 'project.status.delete':
      return await injectJson(request, { method: 'POST', url: `/projects/${args.projectId}/statuses/${args.statusId}/delete`, args, payload: { targetStatusId: args.targetStatusId } })
    case 'project.status.reorder':
      return await injectJson(request, { method: 'POST', url: `/projects/${args.projectId}/statuses/reorder`, args, payload: { orderedStatusIds: args.orderedStatusIds } })
    case 'workspace.invite':
      return await injectJson(request, { method: 'POST', url: '/auth/invite', args, payload: { email: args.email, role: args.role } })
    case 'project.member.list':
      return { items: await injectJson(request, { method: 'GET', url: `/projects/${args.projectId}/members`, args }) }
    case 'project.member.add':
      return await injectJson(request, { method: 'POST', url: `/projects/${args.projectId}/members`, args, payload: { accountId: args.accountId, email: args.email, name: args.name, role: args.role } })
    case 'project.member.update':
      return await injectJson(request, { method: 'PATCH', url: `/projects/${args.projectId}/members/${args.membershipId}`, args, payload: { role: args.role } })
    case 'project.member.remove':
      return await injectJson(request, { method: 'DELETE', url: `/projects/${args.projectId}/members/${args.membershipId}`, args })
    case 'task.list': {
      const params = new URLSearchParams()
      for (const key of ['status', 'assignee', 'search', 'label']) if (args[key]) params.set(key, String(args[key]))
      if (args.archived) params.set('archived', 'true')
      const q = params.toString()
      return { items: await injectJson(request, { method: 'GET', url: `/projects/${args.projectId}/tasks${q ? `?${q}` : ''}`, args }) }
    }
    case 'task.get':
      return await injectJson(request, { method: 'GET', url: `/tasks/${args.taskId}`, args })
    case 'task.create':
      return await injectJson(request, { method: 'POST', url: '/tasks', args, payload: buildHostedMcpTaskCreatePayload({ projectId: args.projectId, title: args.title, owner: args.owner, participants: args.participants, assignee: args.assignee, collaborators: args.collaborators, description: args.description, priority: args.priority, status: args.status, statusId: args.statusId, dueDate: args.dueDate, labels: args.labels, todos: args.todos }) })
    case 'task.update':
      return await injectJson(request, { method: 'PATCH', url: `/tasks/${args.taskId}`, args, payload: buildHostedMcpTaskUpdatePayload({ title: args.title, description: args.description, owner: args.owner, participants: args.participants, assignee: args.assignee, collaborators: args.collaborators, priority: args.priority, statusId: args.statusId, dueDate: args.dueDate }) })
    case 'task.archive':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/archive`, args, payload: { archived: args.archived } })
    case 'task.delete':
      return await injectJson(request, { method: 'DELETE', url: `/tasks/${args.taskId}`, args })
    case 'task.move':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/move`, args, payload: { targetStatus: args.targetStatus } })
    case 'task.reorder':
      return await injectJson(request, { method: 'POST', url: '/tasks/reorder', args, payload: { taskId: args.taskId, targetStatusId: args.targetStatusId, orderedTaskIds: args.orderedTaskIds } })
    case 'task.labels.update':
      return await injectJson(request, { method: 'PATCH', url: `/tasks/${args.taskId}/labels`, args, payload: { labels: args.labels } })
    case 'task.todo.create':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/todos`, args, payload: { text: args.text } })
    case 'task.todo.update':
      return await injectJson(request, { method: 'PATCH', url: `/tasks/${args.taskId}/todos/${args.todoId}`, args, payload: { text: args.text, done: args.done } })
    case 'task.todo.delete':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/todos/${args.todoId}/delete`, args, payload: {} })
    case 'task.todo.reorder':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/todos/reorder`, args, payload: { orderedTodoIds: args.orderedTodoIds } })
    case 'comment.add':
      return await injectJson(request, { method: 'POST', url: `/tasks/${args.taskId}/comments`, args, payload: { body: args.body, author: args.author, mentions: args.mentions } })
    case 'timesheet.list': {
      const params = new URLSearchParams()
      if (args.from) params.set('from', String(args.from))
      if (args.to) params.set('to', String(args.to))
      const q = params.toString()
      if (args.taskId) return await injectJson(request, { method: 'GET', url: `/tasks/${args.taskId}/timesheets${q ? `?${q}` : ''}`, args })
      if (args.projectId) return await injectJson(request, { method: 'GET', url: `/projects/${args.projectId}/timesheets${q ? `?${q}` : ''}`, args })
      throw new Error('timesheet.list requires projectId or taskId')
    }
    case 'timesheet.report': {
      const params = new URLSearchParams()
      for (const key of ['from', 'to', 'projectId', 'clientId', 'taskId', 'userId']) if (args[key]) params.set(key, String(args[key]))
      if (args.showValidated) params.set('showValidated', 'true')
      const q = params.toString()
      return await injectJson(request, { method: 'GET', url: `/timesheets/report${q ? `?${q}` : ''}`, args })
    }
    case 'timesheet.users': {
      const q = args.projectId ? `?projectId=${encodeURIComponent(String(args.projectId))}` : ''
      return { items: await injectJson(request, { method: 'GET', url: `/timesheets/users${q}`, args }) }
    }
    case 'timesheet.add':
      return await injectJson(request, { method: 'POST', url: '/timesheets', args, payload: { projectId: args.projectId, taskId: args.taskId, userId: args.userId, userName: args.userName, date: args.date, minutes: args.minutes, description: args.description, billable: args.billable, validated: args.validated } })
    case 'timesheet.update':
      return await injectJson(request, { method: 'PATCH', url: `/timesheets/${args.timesheetId}`, args, payload: { minutes: args.minutes, description: args.description, date: args.date, billable: args.billable, validated: args.validated, taskId: args.taskId, userId: args.userId } })
    case 'timesheet.delete':
      return await injectJson(request, { method: 'DELETE', url: `/timesheets/${args.timesheetId}`, args })
    case 'agent.list': {
      const params = new URLSearchParams()
      if (args.role) params.set('role', String(args.role))
      if (args.enabled !== undefined) params.set('enabled', String(args.enabled))
      const q = params.toString()
      return { items: await injectJson(request, { method: 'GET', url: `/agents${q ? `?${q}` : ''}`, args }) }
    }
    case 'agent_job.list': {
      const params = new URLSearchParams()
      for (const key of ['status', 'projectId', 'taskId', 'role']) if (args[key]) params.set(key, String(args[key]))
      const q = params.toString()
      return { items: await injectJson(request, { method: 'GET', url: `/agent-jobs${q ? `?${q}` : ''}`, args }) }
    }
    case 'agent_job.create':
      return await injectJson(request, { method: 'POST', url: '/agent-jobs', args, payload: buildHostedMcpAgentJobCreatePayload({ projectId: args.projectId, taskId: args.taskId, agentId: args.agentId, role: args.role, mode: args.mode, triggerType: args.triggerType, workflowRunId: args.workflowRunId, workflowStep: args.workflowStep, maxSteps: args.maxSteps, workItemRefId: args.workItemRefId, workItemRef: args.workItemRef, payload: args.payload }) })
    case 'agent_job.claim':
      return await injectJson(request, { method: 'POST', url: `/agent-jobs/${args.jobId}/claim`, args, payload: { agentId: args.agentId } })
    case 'agent_job.update':
      return await injectJson(request, { method: 'PATCH', url: `/agent-jobs/${args.jobId}`, args, payload: buildHostedMcpAgentJobUpdatePayload({ status: args.status, error: args.error, payload: args.payload }) })
    case 'agent_run.create':
      return await injectJson(request, { method: 'POST', url: '/agent-runs', args, payload: buildHostedMcpAgentRunCreatePayload({ projectId: args.projectId, taskId: args.taskId, jobId: args.jobId, agentId: args.agentId, role: args.role, status: args.status, triggerType: args.triggerType, provider: args.provider, model: args.model, workflowRunId: args.workflowRunId, workflowStep: args.workflowStep, workItemRefId: args.workItemRefId, workItemRef: args.workItemRef, summary: args.summary, logUrl: args.logUrl, evidenceUrl: args.evidenceUrl, metadata: args.metadata }) })
    case 'agent_run.update':
      return await injectJson(request, { method: 'PATCH', url: `/agent-runs/${args.runId}`, args, payload: buildHostedMcpAgentRunUpdatePayload({ status: args.status, summary: args.summary, error: args.error, logUrl: args.logUrl, evidenceUrl: args.evidenceUrl, metadata: args.metadata }) })
    case 'agent_run.heartbeat':
      return await injectJson(request, { method: 'POST', url: `/agent-runs/${args.runId}/heartbeat`, args, payload: {} })
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function createHostedMcpServer(session: { account: { id: string; name: string | null; email: string }; mcpKey: { id: string; label: string; workspaceId: string | null; workspaceSlug: string | null }; authorization: string }) {
  const server = new McpProtocolServer(
    { name: 'sally-hosted-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: hostedMcpTools }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = (request.params.arguments || {}) as Record<string, any>
      const result = await callHostedMcpTool({ account: session.account, mcpKey: session.mcpKey, authorization: session.authorization }, request.params.name, args)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result }
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
    }
  })

  return server
}

async function ensureHostedMcpSession(request: any, reply: any) {
  if (!(await ensureMcpAuth(request, reply))) return null
  const session = { account: request.account, mcpKey: request.mcpKey, authorization: readHeader(request, 'authorization') || '' }
  const headerSessionId = readHeader(request, 'mcp-session-id')
  if (headerSessionId) {
    const existing = hostedMcpSessions.get(String(headerSessionId))
    if (!existing) {
      reply.code(404).send({ ok: false, error: 'MCP session not found' })
      return null
    }
    if (existing.mcpKey.id !== session.mcpKey.id) {
      reply.code(403).send({ ok: false, error: 'MCP session/key mismatch' })
      return null
    }
    return existing
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      hostedMcpSessions.set(sessionId, { server, transport, account: session.account, mcpKey: session.mcpKey, authorization: session.authorization })
    },
    onsessionclosed: (sessionId) => {
      hostedMcpSessions.delete(sessionId)
    },
  })
  const server = createHostedMcpServer(session)
  await server.connect(transport)
  return { server, transport, account: session.account, mcpKey: session.mcpKey, authorization: session.authorization }
}

const start = async () => {
  try {
    await app.register(cors, { origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Session-Token', 'X-Workspace-Id', 'X-Workspace-Slug', 'Mcp-Session-Id'] })

    app.addHook('preHandler', async (request, reply) => {
      const url = request.raw.url || ''
      if (url.startsWith('/health') || url.startsWith('/edition') || url.startsWith('/mcp') || url.startsWith('/uploads/task-images/') || url.startsWith('/uploads/project-images/') || url.startsWith('/uploads/profile-images/')) return
      if (url.startsWith('/agent-connections/complete-pairing')) return
      if (url.startsWith('/agent-worker/')) {
        if (!(await ensureWorkerAuth(request, reply))) return reply.code(401).send({ ok: false, error: 'Unauthorized worker' })
        return
      }
      if ((url.startsWith('/agent-jobs') || url.startsWith('/agent-runs') || url.startsWith('/blockers') || url.startsWith('/approval-requests')) && (await ensureWorkerAuth(request, reply))) return
      if ((url.startsWith('/projects') || url.startsWith('/tasks')) && (await ensureWorkerAuth(request, reply))) return
      if (url.startsWith('/auth/login') || url.startsWith('/auth/accept-invite') || url.startsWith('/auth/request-password-reset') || url.startsWith('/auth/reset-password')) return
      if (!(await ensureAuth(request, reply))) return
      const keyAuth = ((request as any).apiKey ?? (request as any).mcpKey) as { scopes?: string[] } | undefined
      if (keyAuth && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !keyAuth.scopes?.includes('write')) {
        return reply.code(403).send({ ok: false, error: 'Key scope does not allow write access', code: 'KEY_SCOPE_DENIED' })
      }
      if (url.startsWith('/accounts') || url.startsWith('/team') || url.startsWith('/workspaces') || url.startsWith('/auth') || url.startsWith('/edition') || url.startsWith('/license')) return
      const workspace = await resolveWorkspace(request, reply)
      if (!workspace) return
      ;(request as any).workspace = workspace
    })

    app.get('/health', async () => ({ ok: true, service: 'api', timestamp: new Date().toISOString() }))
    app.get('/edition', async () => {
      const installedLicense = await readInstalledLicenseWithAutoRefresh(prisma)
      const edition = getEditionInfo({ installedLicense })
      return { ...edition, availableFeatures: edition.availableFeatures }
    })

    app.get('/license', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const installedLicense = await readInstalledLicenseWithAutoRefresh(prisma)
      const edition = getEditionInfo({ installedLicense })
      const record = await prisma.installedLicense.findUnique({ where: { id: 'instance' } })
      return {
        ...edition,
        installed: record ? {
          licenseServerUrl: record.licenseServerUrl,
          activationId: record.activationId,
          licenseId: record.licenseId,
          instanceId: record.instanceId,
          status: record.status,
          validUntil: record.validUntil?.toISOString() ?? null,
          graceUntil: record.graceUntil?.toISOString() ?? null,
          lastRefreshAt: record.lastRefreshAt?.toISOString() ?? null,
          installedAt: record.installedAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        } : null,
      }
    })

    app.post('/license/activate', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const body = request.body as { licenseKey?: string; instanceId?: string; instanceName?: string; appVersion?: string; fingerprint?: string }
      try {
        const result = await activateInstalledLicense(prisma, body as any)
        const installedLicense = await readInstalledLicense(prisma)
        const edition = getEditionInfo({ installedLicense })
        await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.license.activated', targetType: 'license', targetId: result.license.licenseId ?? result.license.activationId ?? 'instance', summary: 'Activated Enterprise license', metadata: { status: result.license.status ?? null, validUntil: result.license.validUntil ?? null, graceUntil: result.license.graceUntil ?? null } })
        return { ok: true, edition, installed: result.license }
      } catch (error) {
        await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.license.activationFailed', targetType: 'license', targetId: 'instance', summary: 'License activation failed', metadata: { reason: error instanceof Error ? error.message : 'License activation failed' } })
        return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : 'License activation failed' })
      }
    })

    app.post('/license/refresh', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      try {
        const result = await refreshInstalledLicense(prisma)
        const installedLicense = await readInstalledLicense(prisma)
        const edition = getEditionInfo({ installedLicense })
        await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.license.refreshed', targetType: 'license', targetId: result.license.licenseId ?? result.license.activationId ?? 'instance', summary: 'Refreshed Enterprise license', metadata: { status: result.license.status ?? null, validUntil: result.license.validUntil ?? null, graceUntil: result.license.graceUntil ?? null } })
        return { ok: true, edition, installed: result.license }
      } catch (error) {
        await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.license.refreshFailed', targetType: 'license', targetId: 'instance', summary: 'License refresh failed', metadata: { reason: error instanceof Error ? error.message : 'License refresh failed' } })
        return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : 'License refresh failed' })
      }
    })

    app.delete('/license', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      await removeInstalledLicense(prisma)
      await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.license.removed', targetType: 'license', targetId: 'instance', summary: 'Removed Enterprise license' })
      return { ok: true, edition: getEditionInfo({ installedLicense: null }) }
    })

    app.get('/runtime-config', async () => ({
      ok: true,
      appBaseUrl: process.env.APP_BASE_URL?.replace(/\/+$/, '') || process.env.SALLY_URL?.replace(/\/+$/, '') || null,
    }))
    app.get('/version', async () => ({ ok: true, name: 'sally', version: appVersion, commit: appGitSha || null, builtAt: appBuildTime || null }))
    app.get('/uploads/task-images/:taskId/:fileName', async (request, reply) => {
      const { taskId, fileName } = request.params as { taskId: string; fileName: string }
      const file = serveTaskImage([taskId, fileName])
      if (!file) return reply.code(404).send({ ok: false, error: 'Image not found' })
      reply.header('Content-Type', file.mimeType)
      return reply.send(fs.createReadStream(file.absolutePath))
    })

    app.get('/uploads/project-images/:projectId/:fileName', async (request, reply) => {
      const { projectId, fileName } = request.params as { projectId: string; fileName: string }
      const file = serveProjectImage([projectId, fileName])
      if (!file) return reply.code(404).send({ ok: false, error: 'Image not found' })
      reply.header('Content-Type', file.mimeType)
      return reply.send(fs.createReadStream(file.absolutePath))
    })

    app.get('/uploads/profile-images/:accountId/:fileName', async (request, reply) => {
      const { accountId, fileName } = request.params as { accountId: string; fileName: string }
      const file = serveProfileImage([accountId, fileName])
      if (!file) return reply.code(404).send({ ok: false, error: 'Image not found' })
      reply.header('Content-Type', file.mimeType)
      return reply.send(fs.createReadStream(file.absolutePath))
    })

    app.post('/auth/login', async (request, reply) => {
      const body = request.body as { email?: string; password?: string }
      const email = body.email?.trim().toLowerCase()
      const password = body.password?.trim()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      if (!password) return reply.code(400).send({ ok: false, error: 'password is required' })
      const account = await prisma.account.findFirst({ where: { email } })
      const configuredSuperadminPasswordHash = isConfiguredSuperadminEmail(email) ? getConfiguredSuperadminPasswordHash() : null
      const effectivePasswordHash = configuredSuperadminPasswordHash || account?.passwordHash || null
      if (!account || !effectivePasswordHash) {
        await writeAuditLog({ actorAccountId: null, action: 'audit.auth.loginFailed', targetType: 'account', targetId: null, summary: `Failed login for ${email}`, metadata: { email, reason: 'invalid_credentials' } })
        return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
      }
      if (account.archivedAt) {
        await writeAuditLog({ actorAccountId: account.id, action: 'audit.auth.loginFailed', targetType: 'account', targetId: account.id, summary: `Failed login for archived account ${account.email}`, metadata: { reason: 'account_archived' } })
        return reply.code(403).send({ ok: false, error: 'Account archived' })
      }
      const valid = await verifyPassword(password, effectivePasswordHash)
      if (!valid) {
        await writeAuditLog({ actorAccountId: account.id, action: 'audit.auth.loginFailed', targetType: 'account', targetId: account.id, summary: `Failed login for ${account.email}`, metadata: { reason: 'invalid_credentials' } })
        return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
      }
      const sessionToken = generateSessionToken()
      const session = await prisma.accountSession.create({ data: { accountId: account.id, token: sessionToken, expiresAt: getSessionExpiry() } })
      await writeAuditLog({ actorAccountId: account.id, action: 'audit.auth.loginSucceeded', targetType: 'accountSession', targetId: session.id, summary: `Signed in ${account.email}`, metadata: { expiresAt: session.expiresAt.toISOString() } })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceSlug: membership.workspace.slug, workspaceName: membership.workspace.name, workspaceArchivedAt: membership.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
      }
    })

    app.post('/auth/logout', async (request, reply) => {
      const session = (request as any).session as { id: string } | undefined
      if (!session) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      await prisma.accountSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      await writeAuditLog({ actorAccountId: (request as any).account?.id ?? null, action: 'audit.auth.logout', targetType: 'accountSession', targetId: session.id, summary: 'Signed out' })
      return { ok: true }
    })

    app.get('/auth/me', async (request, reply) => {
      const account = (request as any).account as { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: PlatformRole | null } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceSlug: membership.workspace.slug, workspaceName: membership.workspace.name, workspaceArchivedAt: membership.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
      }
    })

    app.get('/notifications', async (request) => {
      const account = (request as any).account as { id: string }
      const query = request.query as { unreadOnly?: string; limit?: string }
      const unreadOnly = query.unreadOnly === 'true'
      const limit = Math.min(Math.max(Number(query.limit || 20) || 20, 1), 100)
      const notifications = await prisma.notification.findMany({
        where: { recipientAccountId: account.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { actor: true },
      })
      return notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
        projectId: notification.projectId,
        taskId: notification.taskId,
        actor: notification.actor ? { id: notification.actor.id, name: notification.actor.name, email: notification.actor.email, avatarUrl: notification.actor.avatarUrl ?? null } : null,
      }))
    })

    app.post('/notifications/:notificationId/read', async (request, reply) => {
      const account = (request as any).account as { id: string }
      const { notificationId } = request.params as { notificationId: string }
      const notification = await prisma.notification.findFirst({ where: { id: notificationId, recipientAccountId: account.id } })
      if (!notification) return reply.code(404).send({ ok: false, error: 'Notification not found' })
      await prisma.notification.delete({ where: { id: notificationId } })
      return { ok: true }
    })

    app.post('/notifications/read-all', async (request) => {
      const account = (request as any).account as { id: string }
      await prisma.notification.deleteMany({ where: { recipientAccountId: account.id } })
      return { ok: true }
    })

    app.get('/notifications/preferences', async (request) => {
      const account = (request as any).account as { id: string }
      const rows = await prisma.notificationPreference.findMany({ where: { accountId: account.id } })
      return NOTIFICATION_EVENT_TYPES.map((eventType) => {
        const row = rows.find((item) => item.eventType === eventType)
        return { eventType, inAppEnabled: row?.inAppEnabled ?? true, emailEnabled: row?.emailEnabled ?? true }
      })
    })

    app.put('/notifications/preferences', async (request) => {
      const account = (request as any).account as { id: string }
      const body = request.body as { preferences?: { eventType: string; inAppEnabled: boolean; emailEnabled: boolean }[] }
      const preferences = (body.preferences || []).filter((item) => NOTIFICATION_EVENT_TYPES.includes(item.eventType as any))
      for (const preference of preferences) {
        await prisma.notificationPreference.upsert({
          where: { accountId_eventType: { accountId: account.id, eventType: preference.eventType } },
          update: { inAppEnabled: preference.inAppEnabled, emailEnabled: preference.emailEnabled },
          create: { accountId: account.id, eventType: preference.eventType, inAppEnabled: preference.inAppEnabled, emailEnabled: preference.emailEnabled },
        })
      }
      return { ok: true }
    })

    app.post('/notifications/process-deliveries', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      await processPendingNotificationDeliveries()
      return { ok: true }
    })

    app.get('/mentionable-users', async (request, reply) => {
      const workspace = (request as any).workspace
      const query = request.query as { projectId?: string; query?: string }
      const projectId = query.projectId?.trim()
      const search = query.query?.trim() || ''
      const account = (request as any).account as { id: string } | undefined
      if (!projectId) return reply.code(400).send({ ok: false, error: 'projectId is required' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const projectMemberships = await prisma.projectMembership.findMany({ where: { projectId }, select: { accountId: true } })
      const projectMemberIds = new Set(projectMemberships.map((membership) => membership.accountId))
      const memberships = await prisma.workspaceMembership.findMany({
        where: {
          workspaceId: workspace.id,
          ...(account?.id ? { accountId: { not: account.id } } : {}),
          account: search
            ? { OR: [ { name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } } ] }
            : undefined,
        },
        include: { account: true },
        take: 20,
      })
      return memberships
        .sort((a, b) => Number(projectMemberIds.has(b.accountId)) - Number(projectMemberIds.has(a.accountId)))
        .map((membership) => ({ accountId: membership.accountId, name: membership.account.name, email: membership.account.email, avatarUrl: membership.account.avatarUrl ?? null }))
    })

    app.get('/auth/api-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const keys = await prisma.accountApiKey.findMany({ where: { accountId: account.id }, orderBy: { createdAt: 'desc' } })
      return keys.map((key) => ({ id: key.id, label: key.label, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expiresAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null }))
    })

    app.post('/auth/api-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { label?: string; scopes?: string[]; expiresAt?: string | null }
      const label = body.label?.trim()
      if (!label) return reply.code(400).send({ ok: false, error: 'label is required' })
      let expiresAt: Date | null = null
      try {
        expiresAt = parseOptionalExpiry(body.expiresAt)
      } catch (error) {
        return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : 'expiresAt is invalid' })
      }
      const scopes = normalizeKeyScopes(body.scopes, API_KEY_SCOPES, ['read', 'write'])
      const token = generateApiKeyToken()
      const created = await prisma.accountApiKey.create({
        data: {
          accountId: account.id,
          label,
          prefix: token.slice(0, 12),
          tokenHash: hashApiToken(token),
          scopes,
          expiresAt,
        },
      })
      await writeAuditLog({ actorAccountId: account.id, action: 'audit.apiKey.created', targetType: 'apiKey', targetId: created.id, summary: `Created API key ${label}`, metadata: { prefix: created.prefix, scopes, expiresAt: expiresAt?.toISOString() ?? null } })
      return { ok: true, apiKeyId: created.id, token, key: token, prefix: created.prefix, scopes: created.scopes, expiresAt: created.expiresAt?.toISOString() ?? null }
    })

    app.delete('/auth/api-keys/:apiKeyId', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const { apiKeyId } = request.params as { apiKeyId: string }
      const apiKey = await prisma.accountApiKey.findFirst({ where: { id: apiKeyId, accountId: account.id } })
      if (!apiKey) return reply.code(404).send({ ok: false, error: 'API key not found' })
      if (apiKey.revokedAt) {
        await prisma.accountApiKey.delete({ where: { id: apiKey.id } })
        await writeAuditLog({ actorAccountId: account.id, action: 'audit.apiKey.deleted', targetType: 'apiKey', targetId: apiKey.id, summary: `Deleted revoked API key ${apiKey.label}`, metadata: { prefix: apiKey.prefix } })
        return { ok: true, deleted: true }
      }
      await prisma.accountApiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } })
      await writeAuditLog({ actorAccountId: account.id, action: 'audit.apiKey.revoked', targetType: 'apiKey', targetId: apiKey.id, summary: `Revoked API key ${apiKey.label}`, metadata: { prefix: apiKey.prefix } })
      return { ok: true, revoked: true }
    })

    app.get('/auth/mcp-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const keys = await prisma.accountMcpKey.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'desc' } })
      return keys.map((key) => ({ id: key.id, label: key.label, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expiresAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null, workspaceId: key.workspaceId, workspaceSlug: key.workspace?.slug ?? null, workspaceName: key.workspace?.name ?? null }))
    })

    app.post('/auth/mcp-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { label?: string; workspaceId?: string | null; scopes?: string[]; expiresAt?: string | null }
      const label = body.label?.trim()
      if (!label) return reply.code(400).send({ ok: false, error: 'label is required' })
      if (body.expiresAt) {
        const edition = getEditionInfo({ installedLicense: await readInstalledLicenseWithAutoRefresh(prisma) })
        if (!edition.availableFeatures.includes('security.apiMcpKeyPolicy')) {
          return reply.code(402).send({ ok: false, error: 'Enterprise feature', feature: 'security.apiMcpKeyPolicy', upgradeUrl: edition.upgradeUrl })
        }
      }
      let expiresAt: Date | null = null
      try {
        expiresAt = parseOptionalExpiry(body.expiresAt)
      } catch (error) {
        return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : 'expiresAt is invalid' })
      }
      const scopes = normalizeKeyScopes(body.scopes, MCP_KEY_SCOPES, ['read', 'write', 'mcp'])
      let workspaceId: string | null = null
      if (body.workspaceId) {
        const membership = await prisma.workspaceMembership.findFirst({ where: { accountId: account.id, workspaceId: body.workspaceId }, include: { workspace: true } })
        if (!membership) return reply.code(403).send({ ok: false, error: 'Workspace access denied' })
        workspaceId = membership.workspaceId
      }
      const token = generateMcpKeyToken()
      const created = await prisma.accountMcpKey.create({ data: { accountId: account.id, workspaceId, label, prefix: token.slice(0, 16), tokenHash: hashApiToken(token), scopes, expiresAt }, include: { workspace: true } })
      await writeAuditLog({ workspaceId, actorAccountId: account.id, action: 'audit.mcpKey.created', targetType: 'mcpKey', targetId: created.id, summary: `Created MCP key ${label}`, metadata: { prefix: created.prefix, scopes, expiresAt: expiresAt?.toISOString() ?? null, workspaceId } })
      return { ok: true, mcpKeyId: created.id, token, key: token, prefix: created.prefix, scopes: created.scopes, expiresAt: created.expiresAt?.toISOString() ?? null, workspaceId: created.workspaceId, workspaceSlug: created.workspace?.slug ?? null }
    })

    app.delete('/auth/mcp-keys/:mcpKeyId', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const { mcpKeyId } = request.params as { mcpKeyId: string }
      const mcpKey = await prisma.accountMcpKey.findFirst({ where: { id: mcpKeyId, accountId: account.id } })
      if (!mcpKey) return reply.code(404).send({ ok: false, error: 'MCP key not found' })
      if (mcpKey.revokedAt) {
        await prisma.accountMcpKey.delete({ where: { id: mcpKey.id } })
        await writeAuditLog({ workspaceId: mcpKey.workspaceId, actorAccountId: account.id, action: 'audit.mcpKey.deleted', targetType: 'mcpKey', targetId: mcpKey.id, summary: `Deleted revoked MCP key ${mcpKey.label}`, metadata: { prefix: mcpKey.prefix } })
        return { ok: true, deleted: true }
      }
      await prisma.accountMcpKey.update({ where: { id: mcpKey.id }, data: { revokedAt: new Date() } })
      await writeAuditLog({ workspaceId: mcpKey.workspaceId, actorAccountId: account.id, action: 'audit.mcpKey.revoked', targetType: 'mcpKey', targetId: mcpKey.id, summary: `Revoked MCP key ${mcpKey.label}`, metadata: { prefix: mcpKey.prefix } })
      return { ok: true, revoked: true }
    })

    app.route({
      method: ['GET', 'POST', 'DELETE'],
      url: '/mcp',
      handler: async (request, reply) => {
        const session = await ensureHostedMcpSession(request, reply)
        if (!session) return
        await session.transport.handleRequest(request.raw, reply.raw, request.body)
        reply.hijack()
      },
    })

    app.get('/auth/profile', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const profile = await prisma.account.findUnique({ where: { id: account.id } })
      if (!profile) return reply.code(404).send({ ok: false, error: 'Account not found' })
      const pendingEmail = await prisma.emailChangeToken.findFirst({ where: { accountId: profile.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })
      return { ok: true, profile: { id: profile.id, name: profile.name, email: profile.email, avatarUrl: profile.avatarUrl, pendingEmail: pendingEmail?.newEmail ?? null, platformRole: profile.platformRole, emailLocked: isConfiguredSuperadminEmail(profile.email) } }
    })

    app.patch('/auth/profile', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { name?: string; email?: string; avatarUrl?: string | null }
      const current = await prisma.account.findUnique({ where: { id: account.id } })
      if (!current) return reply.code(404).send({ ok: false, error: 'Account not found' })
      const name = body.name !== undefined ? body.name?.trim() || null : current.name
      const avatarUrl = body.avatarUrl !== undefined ? (body.avatarUrl?.trim() || null) : current.avatarUrl
      await prisma.account.update({ where: { id: current.id }, data: { name, avatarUrl } })
      let emailChange = null as null | { pendingEmail: string; emailed: boolean; reason?: string }
      const nextEmail = body.email?.trim().toLowerCase()
      if (isConfiguredSuperadminEmail(current.email) && nextEmail && nextEmail !== current.email) {
        return reply.code(403).send({ ok: false, error: 'The configured superadmin email can only be changed via .env update and redeploy' })
      }
      if (nextEmail && nextEmail !== current.email) {
        const existing = await prisma.account.findFirst({ where: { email: nextEmail } })
        if (existing) return reply.code(400).send({ ok: false, error: 'Email is already in use' })
        await prisma.emailChangeToken.deleteMany({ where: { accountId: current.id, usedAt: null } })
        const token = generateSessionToken()
        const pending = await prisma.emailChangeToken.create({ data: { accountId: current.id, newEmail: nextEmail, token, expiresAt: getEmailChangeExpiry() } })
        const mailResult = await sendEmailChangeConfirmationEmail({ email: nextEmail, confirmationToken: token, expiresAt: pending.expiresAt })
        emailChange = { pendingEmail: nextEmail, emailed: mailResult.ok, ...(mailResult.ok ? {} : { reason: mailResult.reason }) }
      }
      const updated = await prisma.account.findUnique({ where: { id: current.id } })
      return { ok: true, profile: { id: updated!.id, name: updated!.name, email: updated!.email, avatarUrl: updated!.avatarUrl, platformRole: updated!.platformRole, emailLocked: isConfiguredSuperadminEmail(updated!.email) }, emailChange }
    })

    app.post('/auth/confirm-email-change', async (request, reply) => {
      const body = request.body as { token?: string }
      const token = body.token?.trim()
      if (!token) return reply.code(400).send({ ok: false, error: 'token is required' })
      const pending = await prisma.emailChangeToken.findFirst({ where: { token, usedAt: null, expiresAt: { gt: new Date() } } })
      if (!pending) return reply.code(400).send({ ok: false, error: 'Email change link is invalid or expired' })
      const existing = await prisma.account.findFirst({ where: { email: pending.newEmail } })
      if (existing && existing.id !== pending.accountId) return reply.code(400).send({ ok: false, error: 'Email is already in use' })
      const updated = await prisma.account.update({ where: { id: pending.accountId }, data: { email: pending.newEmail } })
      await syncConfiguredSuperadmin()
      await prisma.emailChangeToken.update({ where: { id: pending.id }, data: { usedAt: new Date() } })
      return { ok: true, account: { id: updated.id, name: updated.name, email: updated.email, avatarUrl: updated.avatarUrl, platformRole: updated.platformRole } }
    })

    app.post('/auth/profile/image-upload', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      if (!body.base64) return reply.code(400).send({ ok: false, error: 'base64 is required' })
      const saved = saveProfileImage(account.id, { fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 })
      await prisma.account.update({ where: { id: account.id }, data: { avatarUrl: saved.url } })
      return { ok: true, url: saved.url }
    })

    app.post('/auth/invite', async (request, reply) => {
      const body = request.body as { email?: string; role?: string }
      const email = body.email?.trim().toLowerCase()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      const workspace = await resolveWorkspace(request, reply)
      if (!workspace) return
      ;(request as any).workspace = workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const role = normalizeWorkspaceRole(body.role)
      if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
      const existingAccount = await prisma.account.findFirst({ where: { email } })
      if (existingAccount) {
        const existingMembership = await prisma.workspaceMembership.findFirst({ where: { workspaceId: workspace.id, accountId: existingAccount.id } })
        if (existingMembership) return { ok: true, existing: true }
      }
      const existingInvite = await prisma.accountInvite.findFirst({
        where: { email, workspaceId: workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      })
      if (existingInvite) {
        const mailResult = await sendInviteEmail({
          email,
          inviteToken: existingInvite.token,
          expiresAt: existingInvite.expiresAt,
          workspaceName: workspace.name,
          role: existingInvite.role,
        })
        if (!mailResult.ok) {
          request.log.warn({ err: mailResult.reason }, 'Failed to send invite email')
        }
        return {
          ok: true,
          existing: true,
          emailed: mailResult.ok,
          expiresAt: existingInvite.expiresAt.toISOString(),
        }
      }
      const inviteToken = generateSessionToken()
      const invite = await prisma.accountInvite.create({
        data: {
          email,
          workspaceId: workspace.id,
          role,
          token: inviteToken,
          expiresAt: getInviteExpiry(),
        },
      })
      const mailResult = await sendInviteEmail({
        email,
        inviteToken: invite.token,
        expiresAt: invite.expiresAt,
        workspaceName: workspace.name,
        role: invite.role,
      })
      if (!mailResult.ok) {
        request.log.warn({ err: mailResult.reason }, 'Failed to send invite email')
      }
      return {
        ok: true,
        emailed: mailResult.ok,
        expiresAt: invite.expiresAt.toISOString(),
      }
    })

    app.get('/auth/invite-info', async (request, reply) => {
      const query = request.query as { token?: string }
      const token = query.token?.trim()
      if (!token) return reply.code(400).send({ ok: false, error: 'token is required' })
      const invite = await prisma.accountInvite.findFirst({ where: { token, acceptedAt: null, expiresAt: { gt: new Date() } } })
      if (!invite) return reply.code(400).send({ ok: false, error: 'Invite is invalid or expired' })
      const account = await prisma.account.findFirst({ where: { email: invite.email } })
      return {
        ok: true,
        invite: {
          email: invite.email,
          workspaceId: invite.workspaceId,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
          accountExists: !!account,
          accountActivated: !!account?.passwordHash,
        },
      }
    })

    app.post('/auth/accept-invite', async (request, reply) => {
      const body = request.body as { token?: string; name?: string; password?: string }
      const token = body.token?.trim()
      const password = body.password?.trim()
      if (!token) return reply.code(400).send({ ok: false, error: 'token is required' })
      if (!password) return reply.code(400).send({ ok: false, error: 'password is required' })
      if (!validateStrongPassword(password)) return reply.code(400).send({ ok: false, error: STRONG_PASSWORD_HINT })
      const invite = await prisma.accountInvite.findFirst({ where: { token, acceptedAt: null, expiresAt: { gt: new Date() } } })
      if (!invite) return reply.code(400).send({ ok: false, error: 'Invite is invalid or expired' })
      let account = await prisma.account.findFirst({ where: { email: invite.email } })
      if (!account) {
        account = await prisma.account.create({ data: { email: invite.email, name: body.name?.trim() || null, passwordHash: await hashPassword(password), platformRole: await getInitialPlatformRole(invite.email) } })
        await syncConfiguredSuperadmin()
      } else {
        if (account.passwordHash) {
          const valid = await verifyPassword(password, account.passwordHash)
          if (!valid) return reply.code(400).send({ ok: false, error: 'Account already activated. Use the existing password for this email or reset it first.' })
        } else {
          account = await prisma.account.update({ where: { id: account.id }, data: { ...(body.name && !account.name ? { name: body.name.trim() } : {}), passwordHash: await hashPassword(password) } })
        }
      }
      const existingMembership = await prisma.workspaceMembership.findFirst({ where: { workspaceId: invite.workspaceId, accountId: account.id } })
      if (!existingMembership) {
        await prisma.workspaceMembership.create({ data: { workspaceId: invite.workspaceId, accountId: account.id, role: invite.role } })
      }
      await prisma.accountInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), accountId: account.id } })
      const sessionToken = generateSessionToken()
      const session = await prisma.accountSession.create({ data: { accountId: account.id, token: sessionToken, expiresAt: getSessionExpiry() } })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceSlug: membership.workspace.slug, workspaceName: membership.workspace.name, workspaceArchivedAt: membership.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
      }
    })

    app.post('/auth/request-password-reset', async (request, reply) => {
      const body = request.body as { email?: string; inviteToken?: string }
      const email = body.email?.trim().toLowerCase()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      const account = await prisma.account.findFirst({ where: { email } })
      if (!account) return { ok: true }
      if (isConfiguredSuperadminEmail(email) && superadminPasswordResetDisabled()) return { ok: true }
      const resetToken = generateSessionToken()
      const reset = await prisma.passwordReset.create({ data: { accountId: account.id, token: resetToken, expiresAt: getResetExpiry() } })
      const mailResult = await sendPasswordResetEmail({ email, resetToken: reset.token, inviteToken: body.inviteToken?.trim() || undefined, expiresAt: reset.expiresAt })
      if (!mailResult.ok) {
        request.log.warn({ err: mailResult.reason }, 'Failed to send password reset email')
      } else {
        request.log.info({ email }, 'Password reset email sent')
      }
      return { ok: true, expiresAt: reset.expiresAt.toISOString() }
    })

    app.post('/auth/reset-password', async (request, reply) => {
      const body = request.body as { token?: string; password?: string; inviteToken?: string }
      const token = body.token?.trim()
      const password = body.password?.trim()
      const inviteToken = body.inviteToken?.trim()
      if (!token) return reply.code(400).send({ ok: false, error: 'token is required' })
      if (!password) return reply.code(400).send({ ok: false, error: 'password is required' })
      if (!validateStrongPassword(password)) return reply.code(400).send({ ok: false, error: STRONG_PASSWORD_HINT })
      const reset = await prisma.passwordReset.findFirst({ where: { token, usedAt: null, expiresAt: { gt: new Date() } } })
      if (!reset) return reply.code(400).send({ ok: false, error: 'Reset token is invalid or expired' })
      const resetAccount = await prisma.account.findFirst({ where: { id: reset.accountId } })
      if (!resetAccount) return reply.code(404).send({ ok: false, error: 'Account not found' })
      if (isConfiguredSuperadminEmail(resetAccount.email) && superadminPasswordResetDisabled()) return reply.code(403).send({ ok: false, error: 'Password reset is disabled for the superadmin account' })
      const account = await prisma.account.update({ where: { id: reset.accountId }, data: { passwordHash: await hashPassword(password) } })
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
      if (inviteToken) {
        const invite = await prisma.accountInvite.findFirst({ where: { token: inviteToken, acceptedAt: null, expiresAt: { gt: new Date() } } })
        if (invite && invite.email.toLowerCase() === account.email.toLowerCase()) {
          const existingMembership = await prisma.workspaceMembership.findFirst({ where: { workspaceId: invite.workspaceId, accountId: account.id } })
          if (!existingMembership) {
            await prisma.workspaceMembership.create({ data: { workspaceId: invite.workspaceId, accountId: account.id, role: normalizeWorkspaceRole(invite.role ?? WorkspaceRole.MEMBER) } })
          }
          await prisma.accountInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), accountId: account.id } })
        }
      }
      const sessionToken = generateSessionToken()
      const session = await prisma.accountSession.create({ data: { accountId: account.id, token: sessionToken, expiresAt: getSessionExpiry() } })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceSlug: membership.workspace.slug, workspaceName: membership.workspace.name, workspaceArchivedAt: membership.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
      }
    })


    app.get('/agents', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const query = request.query as { role?: string; enabled?: string }
      const where: any = { workspaceId: workspace.id }
      if (query.role?.trim()) where.role = normalizeAgentRole(query.role)
      if (query.enabled === 'true') where.enabled = true
      if (query.enabled === 'false') where.enabled = false
      return prisma.agentIdentity.findMany({ where, orderBy: [{ role: 'asc' }, { name: 'asc' }] })
    })

    app.post('/agents', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const body = request.body as {
        name?: string
        role?: string
        principalType?: string
        accountId?: string | null
        hermesProfile?: string | null
        allowedProjects?: unknown
        allowedTaskKinds?: unknown
        capabilities?: Array<string | null | undefined> | null
        enabled?: boolean
      }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      let role: string
      try { role = normalizeAgentRole(body.role) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      if (body.allowedProjects !== undefined) assertNoSecretLikeJson(body.allowedProjects, 'allowedProjects')
      if (body.allowedTaskKinds !== undefined) assertNoSecretLikeJson(body.allowedTaskKinds, 'allowedTaskKinds')
      const agent = await prisma.agentIdentity.create({
        data: {
          workspaceId: workspace.id,
          accountId: body.accountId?.trim() || null,
          name,
          role,
          principalType: body.principalType === 'HUMAN' ? PrincipalType.HUMAN : PrincipalType.AGENT,
          hermesProfile: normalizeHermesProfile(body.hermesProfile),
          allowedProjects: body.allowedProjects === undefined ? undefined : body.allowedProjects as any,
          allowedTaskKinds: body.allowedTaskKinds === undefined ? undefined : body.allowedTaskKinds as any,
          capabilities: normalizeCapabilityNames(body.capabilities) as any,
          enabled: body.enabled ?? true,
        },
      })
      await logActivity({ workspaceId: workspace.id, ...actorFromRequest(request), type: 'agent.created', summary: `Created agent ${agent.name}`, payload: { agentId: agent.id, role: agent.role } })
      return { ok: true, agent }
    })

    app.get('/agents/:agentId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { agentId } = request.params as { agentId: string }
      const agent = await prisma.agentIdentity.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
      if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found' })
      return agent
    })

    app.patch('/agents/:agentId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { agentId } = request.params as { agentId: string }
      const body = request.body as { name?: string; role?: string; accountId?: string | null; hermesProfile?: string | null; allowedProjects?: unknown; allowedTaskKinds?: unknown; capabilities?: Array<string | null | undefined> | null; enabled?: boolean }
      const existing = await prisma.agentIdentity.findFirst({ where: { id: agentId, workspaceId: workspace.id } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Agent not found' })
      const data: any = {}
      if (body.name !== undefined) data.name = body.name.trim()
      if (body.role !== undefined) data.role = normalizeAgentRole(body.role)
      if (body.accountId !== undefined) data.accountId = body.accountId?.trim() || null
      if (body.hermesProfile !== undefined) data.hermesProfile = normalizeHermesProfile(body.hermesProfile)
      if (body.allowedProjects !== undefined) { assertNoSecretLikeJson(body.allowedProjects, 'allowedProjects'); data.allowedProjects = body.allowedProjects as any }
      if (body.allowedTaskKinds !== undefined) { assertNoSecretLikeJson(body.allowedTaskKinds, 'allowedTaskKinds'); data.allowedTaskKinds = body.allowedTaskKinds as any }
      if (body.capabilities !== undefined) data.capabilities = normalizeCapabilityNames(body.capabilities) as any
      if (body.enabled !== undefined) data.enabled = !!body.enabled
      const agent = await prisma.agentIdentity.update({ where: { id: agentId }, data })
      await logActivity({ workspaceId: workspace.id, ...actorFromRequest(request), type: 'agent.updated', summary: `Updated agent ${agent.name}`, payload: { agentId: agent.id, role: agent.role } })
      return { ok: true, agent }
    })

    app.post('/agents/:agentId/enable', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { agentId } = request.params as { agentId: string }
      const agent = await prisma.agentIdentity.updateMany({ where: { id: agentId, workspaceId: workspace.id }, data: { enabled: true } })
      if (!agent.count) return reply.code(404).send({ ok: false, error: 'Agent not found' })
      return { ok: true }
    })

    app.post('/agents/:agentId/disable', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { agentId } = request.params as { agentId: string }
      const agent = await prisma.agentIdentity.updateMany({ where: { id: agentId, workspaceId: workspace.id }, data: { enabled: false } })
      if (!agent.count) return reply.code(404).send({ ok: false, error: 'Agent not found' })
      return { ok: true }
    })

    app.get('/agent-connections', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const connections = await prisma.agentConnection.findMany({ where: { workspaceId: workspace.id, revokedAt: null }, orderBy: { updatedAt: 'desc' }, take: 100 })
      return connections.map((connection) => redactAgentConnection(connection as any))
    })

    app.post('/agent-connections/pairing-code', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const body = request.body as { projectId?: string | null; agentId?: string | null; name?: string | null; runtimeType?: string | null; ttlMinutes?: number | null }
      const projectId = body.projectId?.trim() || null
      if (projectId) {
        const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null }, select: { id: true } })
        if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      }
      const agentId = body.agentId?.trim() || null
      if (agentId) {
        const agent = await prisma.agentIdentity.findFirst({ where: { id: agentId, workspaceId: workspace.id, enabled: true } })
        if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found or disabled' })
      }
      const code = generatePairingCode()
      const ttlMinutes = Math.min(Math.max(Number(body.ttlMinutes || 10), 1), 30)
      const pairing = await prisma.agentPairingCode.create({ data: {
        workspaceId: workspace.id,
        projectId,
        agentId,
        codeHash: hashAgentWorkerToken(code),
        name: body.name?.trim() || 'Connected agent',
        runtimeType: normalizeRuntimeType(body.runtimeType),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      } })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'agent_connection.pairing_code.created', summary: 'Created agent pairing code', payload: { pairingId: pairing.id, projectId, agentId, runtimeType: pairing.runtimeType, expiresAt: pairing.expiresAt.toISOString() } })
      return { ok: true, pairingCode: code, expiresAt: pairing.expiresAt.toISOString(), pairingId: pairing.id }
    })

    app.post('/agent-connections/complete-pairing', async (request, reply) => {
      const body = request.body as { code?: string; runtimeVersion?: string | null; profileRef?: string | null; capabilities?: Array<string | null | undefined> | null; metadata?: unknown }
      const code = body.code?.trim().toUpperCase()
      if (!code) return reply.code(400).send({ ok: false, error: 'pairing code is required' })
      let patch: Record<string, unknown>
      try { patch = buildAgentConnectionPatch({ runtimeVersion: body.runtimeVersion, profileRef: body.profileRef, capabilities: body.capabilities, metadata: body.metadata }) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const pairing = await prisma.agentPairingCode.findFirst({ where: { codeHash: hashAgentWorkerToken(code), usedAt: null, expiresAt: { gt: new Date() } } })
      if (!pairing) return reply.code(404).send({ ok: false, error: 'Pairing code not found or expired' })
      const token = createAgentWorkerToken()
      const connection = await prisma.$transaction(async (tx) => {
        await tx.agentPairingCode.update({ where: { id: pairing.id }, data: { usedAt: new Date() } })
        const latestVisibleEvent = await tx.agentEvent.findFirst({
          where: {
            workspaceId: pairing.workspaceId,
            ...(pairing.agentId ? { OR: [{ agentId: null }, { agentId: pairing.agentId }] } : {}),
          },
          orderBy: { id: 'desc' },
          select: { id: true },
        })
        const created = await tx.agentConnection.create({ data: {
          workspaceId: pairing.workspaceId,
          projectId: pairing.projectId,
          agentId: pairing.agentId,
          name: pairing.name,
          runtimeType: pairing.runtimeType,
          runtimeVersion: patch.runtimeVersion as string | null | undefined,
          profileRef: patch.profileRef as string | null | undefined,
          capabilities: patch.capabilities as any,
          metadata: patch.metadata as any,
          tokenPrefix: token.slice(0, 14),
          tokenHash: hashAgentWorkerToken(token),
          status: AgentConnectionStatus.ONLINE,
          lastSeenAt: new Date(),
        } })
        await tx.agentEventAck.create({ data: { workspaceId: pairing.workspaceId, connectionId: created.id, lastEventId: latestVisibleEvent?.id ?? null } })
        return created
      })
      await emitAgentEvent({ workspaceId: connection.workspaceId, agentId: connection.agentId, type: 'connection.paired', payload: { connectionId: connection.id, projectId: connection.projectId ?? null, runtimeType: connection.runtimeType } })
      return { ok: true, token, connection: redactAgentConnection(connection as any) }
    })

    app.post('/agent-connections/:connectionId/revoke', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { connectionId } = request.params as { connectionId: string }
      const connection = await prisma.agentConnection.findFirst({ where: { id: connectionId, workspaceId: workspace.id, revokedAt: null }, select: { id: true, projectId: true } })
      if (!connection) return reply.code(404).send({ ok: false, error: 'Connection not found' })
      const clearQueue = (request.body as { clearQueue?: boolean } | null)?.clearQueue !== false
      const { cancelledJobs, cancelledRuns } = await prisma.$transaction(async (tx) => {
        let cancelledJobs = { count: 0 }
        let cancelledRuns = { count: 0 }
        if (clearQueue) {
          const activeWorkWhere = { workspaceId: workspace.id, ...(connection.projectId ? { projectId: connection.projectId } : {}), status: { in: [AgentJobStatus.QUEUED, AgentJobStatus.CLAIMED, AgentJobStatus.RUNNING] } }
          const activeRunWhere = { workspaceId: workspace.id, ...(connection.projectId ? { projectId: connection.projectId } : {}), status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] } }
          cancelledJobs = await tx.agentJob.updateMany({ where: activeWorkWhere, data: { status: AgentJobStatus.CANCELLED, finishedAt: new Date(), error: 'Cancelled because the connected agent was disconnected.' } })
          cancelledRuns = await tx.agentRun.updateMany({ where: activeRunWhere, data: { status: AgentRunStatus.CANCELLED, finishedAt: new Date(), error: 'Cancelled because the connected agent was disconnected.' } })
        }
        await tx.agentConnection.delete({ where: { id: connection.id } })
        return { cancelledJobs, cancelledRuns }
      })
      await emitAgentEvent({ workspaceId: workspace.id, type: 'connection.revoked', payload: { connectionId, projectId: connection.projectId ?? null, clearQueue, cancelledJobs: cancelledJobs.count, cancelledRuns: cancelledRuns.count } })
      return { ok: true, clearQueue, cancelledJobs: cancelledJobs.count, cancelledRuns: cancelledRuns.count }
    })

    app.get('/agent-worker/me', async (request) => {
      const connection = (request as any).agentConnection
      return { ok: true, connection: redactAgentConnection(connection as any) }
    })

    app.post('/agent-worker/heartbeat', async (request) => {
      const connection = (request as any).agentConnection
      const body = request.body as { runtimeVersion?: string | null; capabilities?: Array<string | null | undefined> | null; metadata?: unknown }
      const patch = buildAgentConnectionPatch({ runtimeVersion: body?.runtimeVersion, capabilities: body?.capabilities, metadata: body?.metadata })
      const updated = await prisma.agentConnection.update({ where: { id: connection.id }, data: { ...patch, status: AgentConnectionStatus.ONLINE, lastSeenAt: new Date() } })
      return { ok: true, connection: redactAgentConnection(updated as any) }
    })

    app.post('/agent-worker/reconcile-event', async (request, reply) => {
      const connection = (request as any).agentConnection
      const body = request.body as { eventId?: string | null; type?: string | null; payload?: { projectId?: string | null; taskId?: string | null; status?: string | null; jobId?: string | null; role?: string | null; workflowRunId?: string | null; workflowStep?: number | null; maxSteps?: number | null } | null }
      const type = body.type?.trim().toLowerCase()
      if (!type || !['approval.resolved', 'blocker.resolved', 'job.finished'].includes(type)) return reply.code(400).send({ ok: false, error: 'Unsupported reconciliation event type' })
      const payload = body.payload ?? {}
      return reconcileWorkflowResolution({ workspaceId: connection.workspaceId, projectId: payload.projectId ?? null, taskId: payload.taskId ?? null, eventId: body.eventId ?? null, type, status: payload.status ?? null, jobId: payload.jobId ?? null, role: payload.role ?? null, workflowRunId: payload.workflowRunId ?? null, workflowStep: payload.workflowStep ?? null, maxSteps: payload.maxSteps ?? null })
    })

    app.get('/agent-worker/events', async (request) => {
      const connection = (request as any).agentConnection
      const query = request.query as { cursor?: string; limit?: string }
      const ack = await prisma.agentEventAck.findUnique({ where: { connectionId: connection.id }, select: { lastEventId: true } })
      const cursor = chooseAgentEventCursor({ queryCursor: query.cursor, ackLastEventId: ack?.lastEventId })
      const where: any = { workspaceId: connection.workspaceId }
      if (connection.agentId) where.OR = [{ agentId: null }, { agentId: connection.agentId }]
      if (cursor) where.id = { gt: cursor }
      const events = await prisma.agentEvent.findMany({ where, orderBy: { id: 'asc' }, take: Math.min(Number(query.limit || 50), 100) })
      return { ok: true, events }
    })

    app.get('/agent-worker/events/stream', async (request, reply) => {
      const connection = (request as any).agentConnection
      const query = request.query as { cursor?: string }
      const ack = await prisma.agentEventAck.findUnique({ where: { connectionId: connection.id }, select: { lastEventId: true } })
      let cursor = chooseAgentEventCursor({ queryCursor: query.cursor, ackLastEventId: ack?.lastEventId })
      let closed = false
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return
        if (id) reply.raw.write(`id: ${id}\n`)
        reply.raw.write(`event: ${event}\n`)
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }
      const pump = async () => {
        const where: any = { workspaceId: connection.workspaceId }
        if (connection.agentId) where.OR = [{ agentId: null }, { agentId: connection.agentId }]
        if (cursor) where.id = { gt: cursor }
        const events = await prisma.agentEvent.findMany({ where, orderBy: { id: 'asc' }, take: 50 })
        for (const event of events) {
          cursor = event.id
          send(event.type, event, event.id)
        }
      }
      await pump()
      send('ping', { ok: true, connectionId: connection.id })
      const interval = setInterval(() => { void pump().catch((err) => send('error', { error: err instanceof Error ? err.message : 'stream error' })) }, 2000)
      const timeout = setTimeout(() => {
        closed = true
        clearInterval(interval)
        reply.raw.end()
      }, 30000)
      request.raw.on('close', () => {
        closed = true
        clearInterval(interval)
        clearTimeout(timeout)
      })
      return reply
    })

    app.post('/agent-worker/events/ack', async (request) => {
      const connection = (request as any).agentConnection
      const body = request.body as { eventId?: string | null }
      const ack = await prisma.agentEventAck.upsert({ where: { connectionId: connection.id }, update: { lastEventId: body.eventId?.trim() || null }, create: { workspaceId: connection.workspaceId, connectionId: connection.id, lastEventId: body.eventId?.trim() || null } })
      return { ok: true, ack }
    })

    app.get('/agent-jobs', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const query = request.query as { status?: string; projectId?: string; taskId?: string; role?: string }
      const where: any = { workspaceId: workspace.id }
      const connection = (request as any).agentConnection as { projectId?: string | null } | undefined
      if (connection?.projectId) where.projectId = connection.projectId
      if (query.status?.trim()) where.status = query.status.trim().toUpperCase()
      if (query.projectId?.trim()) {
        if (connection?.projectId && query.projectId.trim() !== connection.projectId) return []
        where.projectId = query.projectId.trim()
      }
      if (query.taskId?.trim()) where.taskId = query.taskId.trim()
      if (query.role?.trim()) where.role = normalizeAgentRole(query.role)
      return prisma.agentJob.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { agent: true } })
    })

    app.post('/agent-jobs', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const account = (request as any).account as { id: string } | undefined
      const body = request.body as { projectId?: string | null; taskId?: string | null; agentId?: string | null; role?: string; mode?: string; triggerType?: string; workflowRunId?: string | null; workflowStep?: number | null; maxSteps?: number | null; workItemRefId?: string | null; workItemRef?: WorkItemRefBody | null; payload?: unknown }
      const connection = (request as any).agentConnection as { projectId?: string | null } | undefined
      let role: string
      try { role = normalizeAgentRole(body.role) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      if (body.payload !== undefined) assertNoSecretLikeJson(body.payload, 'payload')
      const projectId = body.projectId?.trim() || null
      if (connection?.projectId && projectId !== connection.projectId) return reply.code(403).send({ ok: false, error: 'Worker connection is scoped to a different project' })
      const taskId = body.taskId?.trim() || null
      if (projectId) {
        const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
        if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      }
      if (taskId) {
        const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: workspace.id } } })
        if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      }
      if (body.agentId) {
        const agent = await prisma.agentIdentity.findFirst({ where: { id: body.agentId, workspaceId: workspace.id, enabled: true } })
        if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found or disabled' })
      }
      let resolvedWorkItemRefId: string | null = null
      try {
        resolvedWorkItemRefId = await resolveWorkItemRef({ workspaceId: workspace.id, projectId, taskId, workItemRefId: body.workItemRefId, workItemRef: body.workItemRef })
      } catch (err: any) {
        return reply.code(err.message === 'Work item ref not found' || err.message === 'Task not found' ? 404 : 400).send({ ok: false, error: err.message })
      }
      const job = await prisma.agentJob.create({
        data: {
          workspaceId: workspace.id,
          projectId,
          taskId,
          agentId: body.agentId?.trim() || null,
          createdById: account?.id ?? null,
          role,
          mode: body.mode?.trim() || 'task',
          triggerType: body.triggerType?.trim() || 'manual',
          workflowRunId: body.workflowRunId?.trim() || null,
          workflowStep: body.workflowStep ?? null,
          maxSteps: body.maxSteps ?? null,
          workItemRefId: resolvedWorkItemRefId,
          payload: body.payload === undefined ? undefined : body.payload as any,
        },
      })
      await logActivity({ workspaceId: workspace.id, projectId, taskId, ...actorFromRequest(request), type: 'agent_job.created', summary: `Queued ${role} agent job`, payload: { jobId: job.id, role } })
      await writeAuditLog({ workspaceId: workspace.id, actorAccountId: account?.id ?? null, projectId, taskId, agentId: job.agentId, agentJobId: job.id, action: 'audit.agentJob.created', targetType: 'agentJob', targetId: job.id, summary: `Queued ${role} agent job`, metadata: { role, mode: job.mode, triggerType: job.triggerType } })
      if (projectId && job.mode === 'workflow') {
        await prisma.projectAutomationConfig.updateMany({
          where: { workspaceId: workspace.id, projectId, workflowEnabled: true },
          data: { automationState: 'queued', currentStage: role === 'architect' ? 'ARCHITECTURE' : role === 'reviewer' ? 'REVIEW' : role === 'tester' ? 'TESTING' : role === 'coder' ? 'EXECUTION' : role === 'pm' ? 'INTAKE' : 'EXECUTION', nextRole: role },
        })
      }
      await emitAgentEvent({ workspaceId: workspace.id, agentId: job.agentId, type: 'job.created', payload: { jobId: job.id, projectId, taskId, role, mode: job.mode, workflowRunId: job.workflowRunId, workflowStep: job.workflowStep, maxSteps: job.maxSteps } })
      return { ok: true, job }
    })

    app.post('/agent-jobs/:jobId/claim', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { jobId } = request.params as { jobId: string }
      const body = request.body as { agentId?: string | null }
      const connection = (request as any).agentConnection as { projectId?: string | null } | undefined
      const agentId = body.agentId?.trim() || null
      if (agentId) {
        const agent = await prisma.agentIdentity.findFirst({ where: { id: agentId, workspaceId: workspace.id, enabled: true } })
        if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found or disabled' })
      }
      const claimed = await prisma.$transaction(async (tx) => {
        const updated = await tx.agentJob.updateMany({ where: { id: jobId, workspaceId: workspace.id, ...(connection?.projectId ? { projectId: connection.projectId } : {}), status: AgentJobStatus.QUEUED }, data: { status: AgentJobStatus.CLAIMED, agentId, lockedAt: new Date(), startedAt: new Date() } })
        if (!updated.count) return null
        return tx.agentJob.findUnique({ where: { id: jobId }, include: { agent: true } })
      })
      if (!claimed) return reply.code(409).send({ ok: false, error: 'Job is not queued or is unavailable' })
      if (claimed.projectId && claimed.mode === 'workflow') {
        const targetType = targetStatusTypeForWorkflowJob(claimed.role, claimed.status)
        if (targetType) await moveTaskForWorkflow({ workspaceId: workspace.id, projectId: claimed.projectId, taskId: claimed.taskId, targetType, reason: 'job_claimed', actor: actorFromRequest(request) })
        await prisma.projectAutomationConfig.updateMany({
          where: { workspaceId: workspace.id, projectId: claimed.projectId, workflowEnabled: true },
          data: { automationState: 'running', currentStage: claimed.role === 'architect' ? 'ARCHITECTURE' : claimed.role === 'reviewer' ? 'REVIEW' : claimed.role === 'tester' ? 'TESTING' : claimed.role === 'coder' ? 'EXECUTION' : claimed.role === 'pm' ? 'INTAKE' : 'EXECUTION', nextRole: claimed.role },
        })
      }
      return { ok: true, job: claimed }
    })

    app.patch('/agent-jobs/:jobId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { jobId } = request.params as { jobId: string }
      const body = request.body as { status?: string; error?: string | null; payload?: unknown }
      const existing = await prisma.agentJob.findFirst({ where: { id: jobId, workspaceId: workspace.id } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Job not found' })
      const data: any = {}
      if (body.status) {
        const status = body.status.trim().toUpperCase() as AgentJobStatus
        if (!Object.values(AgentJobStatus).includes(status)) return reply.code(400).send({ ok: false, error: 'invalid job status' })
        data.status = status
        if (['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'].includes(status)) data.finishedAt = new Date()
      }
      if (body.error !== undefined) data.error = body.error?.trim() || null
      if (body.payload !== undefined) { assertNoSecretLikeJson(body.payload, 'payload'); data.payload = body.payload as any }
      const job = await prisma.agentJob.update({ where: { id: jobId }, data })
      const workflowMoveTarget = job.projectId && job.mode === 'workflow' ? targetStatusTypeForWorkflowJob(job.role, data.status) : null
      if (workflowMoveTarget) await moveTaskForWorkflow({ workspaceId: workspace.id, projectId: job.projectId, taskId: job.taskId, targetType: workflowMoveTarget, reason: `job_${String(data.status).toLowerCase()}`, actor: actorFromRequest(request) })
      const finishedStatus = data.status && ['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'].includes(data.status) ? String(data.status) : null
      if (finishedStatus && job.projectId && job.mode === 'workflow') {
        await emitAgentEvent({ workspaceId: workspace.id, agentId: job.agentId, type: 'job.finished', payload: { jobId: job.id, projectId: job.projectId, taskId: job.taskId, role: job.role, mode: job.mode, status: finishedStatus, workflowRunId: job.workflowRunId, workflowStep: job.workflowStep, maxSteps: job.maxSteps } })
        if (finishedStatus !== 'SUCCEEDED' || job.role !== 'pm') {
          await reconcileWorkflowResolution({ workspaceId: workspace.id, projectId: job.projectId, taskId: job.taskId, type: 'job.finished', status: finishedStatus, jobId: job.id, role: job.role, workflowRunId: job.workflowRunId, workflowStep: job.workflowStep, maxSteps: job.maxSteps, actor: actorFromRequest(request) })
        }
      }
      return { ok: true, job }
    })

    app.post('/agent-runs', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const body = request.body as { projectId?: string | null; taskId?: string | null; jobId?: string | null; agentId?: string | null; role?: string; status?: string; triggerType?: string; provider?: string | null; model?: string | null; workflowRunId?: string | null; workflowStep?: number | null; workItemRefId?: string | null; workItemRef?: WorkItemRefBody | null; summary?: string | null; logUrl?: string | null; evidenceUrl?: string | null; metadata?: unknown }
      const connection = (request as any).agentConnection as { projectId?: string | null } | undefined
      if (connection?.projectId && body.projectId?.trim() !== connection.projectId) return reply.code(403).send({ ok: false, error: 'Worker connection is scoped to a different project' })
      let role: string
      try { role = normalizeAgentRole(body.role) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      if (body.metadata !== undefined) assertNoSecretLikeJson(body.metadata, 'metadata')
      const status = body.status ? body.status.trim().toUpperCase() as AgentRunStatus : AgentRunStatus.QUEUED
      if (!Object.values(AgentRunStatus).includes(status)) return reply.code(400).send({ ok: false, error: 'invalid run status' })
      let resolvedWorkItemRefId: string | null = null
      try {
        resolvedWorkItemRefId = await resolveWorkItemRef({ workspaceId: workspace.id, projectId: body.projectId, taskId: body.taskId, workItemRefId: body.workItemRefId, workItemRef: body.workItemRef })
      } catch (err: any) {
        return reply.code(err.message === 'Work item ref not found' || err.message === 'Task not found' ? 404 : 400).send({ ok: false, error: err.message })
      }
      const run = await prisma.agentRun.create({
        data: {
          workspaceId: workspace.id,
          projectId: body.projectId?.trim() || null,
          taskId: body.taskId?.trim() || null,
          jobId: body.jobId?.trim() || null,
          agentId: body.agentId?.trim() || null,
          role,
          status,
          triggerType: body.triggerType?.trim() || 'manual',
          provider: body.provider?.trim() || null,
          model: body.model?.trim() || null,
          workflowRunId: body.workflowRunId?.trim() || null,
          workflowStep: body.workflowStep ?? null,
          workItemRefId: resolvedWorkItemRefId,
          startedAt: status === AgentRunStatus.RUNNING ? new Date() : null,
          summary: body.summary?.trim() || null,
          logUrl: body.logUrl?.trim() || null,
          evidenceUrl: body.evidenceUrl?.trim() || null,
          metadata: body.metadata === undefined ? undefined : body.metadata as any,
        },
      })
      await writeAuditLog({ workspaceId: workspace.id, actorAccountId: (request as any).account?.id ?? null, projectId: run.projectId, taskId: run.taskId, agentId: run.agentId, agentRunId: run.id, action: 'audit.agentRun.created', targetType: 'agentRun', targetId: run.id, summary: `Created ${role} agent run`, metadata: { role, status: run.status, triggerType: run.triggerType } })
      return { ok: true, run }
    })

    app.patch('/agent-runs/:runId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { runId } = request.params as { runId: string }
      const body = request.body as { status?: string; summary?: string | null; error?: string | null; logUrl?: string | null; evidenceUrl?: string | null; metadata?: unknown }
      const existing = await prisma.agentRun.findFirst({ where: { id: runId, workspaceId: workspace.id } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Run not found' })
      const data: any = {}
      if (body.status) {
        const status = body.status.trim().toUpperCase() as AgentRunStatus
        if (!Object.values(AgentRunStatus).includes(status)) return reply.code(400).send({ ok: false, error: 'invalid run status' })
        data.status = status
        if (status === AgentRunStatus.RUNNING && !existing.startedAt) data.startedAt = new Date()
        if (['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'TIMED_OUT'].includes(status)) data.finishedAt = new Date()
      }
      if (body.summary !== undefined) data.summary = body.summary?.trim() || null
      if (body.error !== undefined) data.error = body.error?.trim() || null
      if (body.logUrl !== undefined) data.logUrl = body.logUrl?.trim() || null
      if (body.evidenceUrl !== undefined) data.evidenceUrl = body.evidenceUrl?.trim() || null
      if (body.metadata !== undefined) { assertNoSecretLikeJson(body.metadata, 'metadata'); data.metadata = body.metadata as any }
      const run = await prisma.agentRun.update({ where: { id: runId }, data })
      return { ok: true, run }
    })

    app.post('/agent-runs/:runId/heartbeat', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { runId } = request.params as { runId: string }
      const run = await prisma.agentRun.updateMany({ where: { id: runId, workspaceId: workspace.id }, data: { latestHeartbeatAt: new Date() } })
      if (!run.count) return reply.code(404).send({ ok: false, error: 'Run not found' })
      return { ok: true }
    })

    app.get('/blockers', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const query = request.query as { projectId?: string; taskId?: string; status?: string }
      const blockers = await prisma.blocker.findMany({
        where: { workspaceId: workspace.id, projectId: query.projectId || undefined, taskId: query.taskId || undefined, status: query.status ? query.status.trim().toUpperCase() as any : undefined },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return blockers
    })

    app.post('/blockers', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      let payload: ReturnType<typeof buildBlockerPayload>
      try { payload = buildBlockerPayload(request.body as Record<string, unknown>) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const blocker = await prisma.blocker.create({ data: { workspaceId: workspace.id, projectId: payload.projectId, taskId: payload.taskId, ownerAgentId: payload.ownerAgentId, type: payload.type, summary: payload.summary, requiredInput: payload.requiredInput } })
      await moveTaskForWorkflow({ workspaceId: workspace.id, projectId: blocker.projectId, taskId: blocker.taskId, targetType: TaskStatusType.BLOCKED, reason: 'blocker_created', actor: actorFromRequest(request) })
      await emitAgentEvent({ workspaceId: workspace.id, agentId: payload.ownerAgentId, type: 'blocker.created', payload: { blockerId: blocker.id, projectId: blocker.projectId, taskId: blocker.taskId, type: blocker.type } })
      await logActivity({ workspaceId: workspace.id, projectId: blocker.projectId, taskId: blocker.taskId, ...actorFromRequest(request), type: 'blocker.created', summary: blocker.summary, payload: { blockerId: blocker.id, type: blocker.type } })
      return { ok: true, blocker }
    })

    app.patch('/blockers/:blockerId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { blockerId } = request.params as { blockerId: string }
      let patch: ReturnType<typeof buildBlockerResolutionPatch>
      try { patch = buildBlockerResolutionPatch(request.body as Record<string, unknown>) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const existing = await prisma.blocker.findFirst({ where: { id: blockerId, workspaceId: workspace.id } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Blocker not found' })
      const blocker = await prisma.blocker.update({ where: { id: blockerId }, data: { status: patch.status, resolvedAt: new Date() } })
      await emitAgentEvent({ workspaceId: workspace.id, agentId: blocker.ownerAgentId, type: 'blocker.resolved', payload: { blockerId: blocker.id, projectId: blocker.projectId, taskId: blocker.taskId, status: blocker.status } })
      await logActivity({ workspaceId: workspace.id, projectId: blocker.projectId, taskId: blocker.taskId, ...actorFromRequest(request), type: 'blocker.resolved', summary: `${blocker.status === BlockerStatus.CANCELLED ? 'Cancelled' : 'Resolved'} blocker: ${blocker.summary}`, payload: { blockerId: blocker.id, status: blocker.status } })
      return { ok: true, blocker }
    })

    app.get('/approval-requests', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const query = request.query as { projectId?: string; taskId?: string; status?: string }
      const approvals = await prisma.approvalRequest.findMany({
        where: { workspaceId: workspace.id, projectId: query.projectId || undefined, taskId: query.taskId || undefined, status: query.status ? query.status.trim().toUpperCase() as any : undefined },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return approvals
    })

    app.post('/approval-requests', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      let payload: ReturnType<typeof buildApprovalRequestPayload>
      try { payload = buildApprovalRequestPayload(request.body as Record<string, unknown>) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const approval = await prisma.approvalRequest.create({ data: { workspaceId: workspace.id, projectId: payload.projectId, taskId: payload.taskId, requestedByAgentId: payload.requestedByAgentId, type: payload.type, question: payload.question, options: payload.options as any, recommendation: payload.recommendation } })
      await emitAgentEvent({ workspaceId: workspace.id, agentId: payload.requestedByAgentId, type: 'approval_request.created', payload: { approvalRequestId: approval.id, projectId: approval.projectId, taskId: approval.taskId, type: approval.type } })
      await logActivity({ workspaceId: workspace.id, projectId: approval.projectId, taskId: approval.taskId, ...actorFromRequest(request), type: 'approval_request.created', summary: approval.question, payload: { approvalRequestId: approval.id, type: approval.type } })
      return { ok: true, approvalRequest: approval }
    })

    app.patch('/approval-requests/:approvalRequestId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const account = (request as any).account as { id: string } | undefined
      const { approvalRequestId } = request.params as { approvalRequestId: string }
      let patch: ReturnType<typeof buildApprovalDecisionPatch>
      try { patch = buildApprovalDecisionPatch(request.body as Record<string, unknown>) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const existing = await prisma.approvalRequest.findFirst({ where: { id: approvalRequestId, workspaceId: workspace.id } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Approval request not found' })
      const approval = await prisma.approvalRequest.update({ where: { id: approvalRequestId }, data: { status: patch.status, decisionNote: patch.decisionNote, decidedAt: new Date(), decidedByAccountId: account?.id ?? null } })
      await emitAgentEvent({ workspaceId: workspace.id, agentId: approval.requestedByAgentId, type: 'approval.resolved', payload: { approvalRequestId: approval.id, projectId: approval.projectId, taskId: approval.taskId, status: approval.status } })
      await logActivity({ workspaceId: workspace.id, projectId: approval.projectId, taskId: approval.taskId, ...actorFromRequest(request), type: 'approval.resolved', summary: `${approval.status === ApprovalStatus.APPROVED ? 'Approved' : approval.status === ApprovalStatus.REJECTED ? 'Denied' : 'Cancelled'} approval: ${approval.question}`, payload: { approvalRequestId: approval.id, status: approval.status } })
      return { ok: true, approvalRequest: approval }
    })

    app.get('/workspaces', async (request) => {
      const account = (request as any).account as { id: string } | undefined
      const includeArchived = String((request.query as { archived?: string } | undefined)?.archived || '').toLowerCase() === 'true'
      const archiveFilter = includeArchived ? {} : { archivedAt: null }
      const workspaces = isPlatformAdmin(request)
        ? await prisma.workspace.findMany({ where: archiveFilter, orderBy: { createdAt: 'asc' } })
        : await prisma.workspace.findMany({ where: account ? { ...archiveFilter, memberships: { some: { accountId: account.id } } } : archiveFilter, orderBy: { createdAt: 'asc' } })
      return workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt.toISOString(),
        archivedAt: workspace.archivedAt?.toISOString() ?? null,
      }))
    })

    const readInstalledLicenseForFeature = () => readInstalledLicenseWithAutoRefresh(prisma)

    app.get('/audit-log', { preHandler: requireFeature('security.auditLog', readInstalledLicenseForFeature) }, async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const query = request.query as { action?: string; targetType?: string; actorAccountId?: string; workspaceId?: string; from?: string; to?: string; limit?: string; export?: string }
      const limit = Math.min(Math.max(Number(query.limit || 100), 1), 1000)
      const createdAt: any = {}
      if (query.from?.trim()) createdAt.gte = new Date(query.from.trim())
      if (query.to?.trim()) createdAt.lte = new Date(query.to.trim())
      const events = await prisma.auditLogEvent.findMany({
        where: {
          ...(query.action?.trim() ? { action: query.action.trim() } : {}),
          ...(query.targetType?.trim() ? { targetType: query.targetType.trim() } : {}),
          ...(query.actorAccountId?.trim() ? { actorAccountId: query.actorAccountId.trim() } : {}),
          ...(query.workspaceId?.trim() ? { workspaceId: query.workspaceId.trim() } : {}),
          ...(Object.keys(createdAt).length ? { createdAt } : {}),
        },
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      const formatted = events.map(formatAuditLogEvent)
      if (query.export === 'csv') {
        const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
        const rows = [
          ['createdAt', 'action', 'actorEmail', 'targetType', 'targetId', 'workspaceId', 'projectId', 'taskId', 'summary'],
          ...formatted.map((event) => [event.createdAt, event.action, event.actor?.email ?? 'system', event.targetType ?? '', event.targetId ?? '', event.workspaceId ?? '', event.projectId ?? '', event.taskId ?? '', event.summary ?? '']),
        ]
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', 'attachment; filename="sally-audit-log.csv"')
        return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
      }
      return formatted
    })

    app.post('/workspaces', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const body = request.body as { name: string; slug?: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const desiredSlug = body.slug?.trim() ? slugify(body.slug) : slugify(name)
      let slug = desiredSlug
      let suffix = 1
      while (await prisma.workspace.findFirst({ where: { slug } })) {
        suffix += 1
        slug = `${desiredSlug}-${suffix}`
      }
      const account = (request as any).account as { id: string } | undefined
      const workspace = await prisma.workspace.create({ data: { name, slug, ...(account ? { memberships: { create: { accountId: account.id, role: WorkspaceRole.OWNER } } } : {}) } })
      await writeAuditLog({ workspaceId: workspace.id, actorAccountId: account?.id ?? null, action: 'audit.workspace.created', targetType: 'workspace', targetId: workspace.id, summary: `Created workspace ${workspace.name}` })
      return { ok: true, workspaceId: workspace.id }
    })

    app.post('/workspaces/:workspaceId/archive', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { workspaceId } = request.params as { workspaceId: string }
      const body = request.body as { archived?: boolean }
      const archived = body.archived !== false
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      const updated = await prisma.workspace.update({ where: { id: workspaceId }, data: { archivedAt: archived ? new Date() : null } })
      await writeAuditLog({ workspaceId: updated.id, actorAccountId: (request as any).account?.id ?? null, action: archived ? 'audit.workspace.archived' : 'audit.workspace.restored', targetType: 'workspace', targetId: updated.id, summary: `${archived ? 'Archived' : 'Restored'} workspace ${updated.name}` })
      return { ok: true, workspace: { id: updated.id, archivedAt: updated.archivedAt?.toISOString() ?? null } }
    })

    app.delete('/workspaces/:workspaceId', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { workspaceId } = request.params as { workspaceId: string }
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      await writeAuditLog({ workspaceId: workspace.id, actorAccountId: (request as any).account?.id ?? null, action: 'audit.workspace.deleted', targetType: 'workspace', targetId: workspace.id, summary: `Deleted workspace ${workspace.name}` })
      await prisma.workspace.delete({ where: { id: workspaceId } })
      return { ok: true }
    })

    app.get('/accounts', async (request, reply) => {
      if (!isSuperadmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const accounts = await prisma.account.findMany({
        orderBy: { createdAt: 'asc' },
        include: { memberships: { include: { workspace: true } } },
      })
      return accounts.map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        platformRole: account.platformRole,
        memberships: account.memberships.map((membership) => ({
          id: membership.id,
          workspaceId: membership.workspaceId,
          workspaceName: membership.workspace.name,
          role: membership.role,
        })),
      }))
    })

    app.post('/accounts', async (request, reply) => {
      const existingCount = await prisma.account.count()
      if (existingCount > 0 && !isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const body = request.body as { name?: string; email: string }
      const email = body.email?.trim().toLowerCase()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      const existing = await prisma.account.findFirst({ where: { email } })
      if (existing) return { ok: true, accountId: existing.id, existing: true }
      const account = await prisma.account.create({ data: { email, name: body.name?.trim() || null, platformRole: await getInitialPlatformRole(email) } })
      await syncConfiguredSuperadmin()
      return { ok: true, accountId: account.id }
    })

    app.patch('/accounts/:accountId/platform-role', async (request, reply) => {
      if (!isSuperadmin(request)) return reply.code(403).send({ ok: false, error: 'Only the superadmin can change platform roles' })
      const { accountId } = request.params as { accountId: string }
      const requestAccountId = (request as any).account?.id
      const body = request.body as { platformRole?: string | null }
      const role = normalizePlatformRole(body.platformRole)
      if (!role) return reply.code(400).send({ ok: false, error: 'platformRole is invalid' })
      if (accountId === requestAccountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own platform role' })
      const target = await prisma.account.findUnique({ where: { id: accountId } })
      if (!target) return reply.code(404).send({ ok: false, error: 'Account not found' })
      if (isConfiguredSuperadminEmail(target.email) && role !== PlatformRole.SUPERADMIN) {
        return reply.code(403).send({ ok: false, error: 'The configured superadmin cannot be demoted' })
      }
      const updated = await prisma.account.update({ where: { id: accountId }, data: { platformRole: role } })
      await writeAuditLog({ actorAccountId: requestAccountId ?? null, action: 'audit.platformRole.updated', targetType: 'account', targetId: updated.id, summary: `Updated platform role for ${updated.email}`, metadata: { platformRole: updated.platformRole } })
      return { ok: true, account: { id: updated.id, name: updated.name, email: updated.email, avatarUrl: updated.avatarUrl, platformRole: updated.platformRole } }
    })

    app.get('/team/accounts', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const [accounts, workspaces, projects] = await Promise.all([
        prisma.account.findMany({
          orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
          include: {
            memberships: { include: { workspace: true }, orderBy: { createdAt: 'asc' } },
            projectMemberships: { include: { project: { include: { workspace: true } } }, orderBy: { createdAt: 'asc' } },
          },
        }),
        prisma.workspace.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } }),
        prisma.project.findMany({ where: { archivedAt: null, workspace: { archivedAt: null } }, include: { workspace: true }, orderBy: { name: 'asc' } }),
      ])
      return {
        ok: true,
        workspaceMemberships: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, slug: workspace.slug, archivedAt: workspace.archivedAt?.toISOString() ?? null })),
        projectMemberships: projects.map((project) => ({ id: project.id, name: project.name, workspaceId: project.workspaceId, workspaceName: project.workspace.name, projectWorkspaceArchivedAt: project.workspace.archivedAt?.toISOString() ?? null })),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          avatarUrl: account.avatarUrl ?? null,
          platformRole: account.platformRole,
          archivedAt: account.archivedAt?.toISOString() ?? null,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
          memberships: account.memberships.filter((membership) => !membership.workspace.archivedAt).map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, workspaceSlug: membership.workspace.slug, workspaceArchivedAt: membership.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
          projectMemberships: account.projectMemberships.filter((membership) => !membership.project.workspace.archivedAt).map((membership) => ({ id: membership.id, projectId: membership.projectId, projectName: membership.project.name, workspaceId: membership.project.workspaceId, workspaceName: membership.project.workspace.name, projectWorkspaceArchivedAt: membership.project.workspace.archivedAt?.toISOString() ?? null, role: membership.role })),
        })),
      }
    })

    app.post('/team/accounts', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const body = request.body as { name?: string | null; email?: string | null }
      const email = body.email?.trim().toLowerCase()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      const account = await prisma.account.upsert({
        where: { email },
        update: { ...(body.name?.trim() ? { name: body.name.trim() } : {}), archivedAt: null },
        create: { email, name: body.name?.trim() || null, platformRole: await getInitialPlatformRole(email) },
      })
      await syncConfiguredSuperadmin()
      return { ok: true, accountId: account.id, existing: account.createdAt.getTime() !== account.updatedAt.getTime() }
    })

    app.post('/team/accounts/:accountId/archive', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId } = request.params as { accountId: string }
      const body = request.body as { archived?: boolean | null }
      const archived = body.archived !== false
      const target = await prisma.account.findUnique({ where: { id: accountId } })
      if (!target) return reply.code(404).send({ ok: false, error: 'Account not found' })
      const requestAccountId = (request as any).account?.id as string | undefined
      if (target.id === requestAccountId && archived) return reply.code(403).send({ ok: false, error: 'You cannot archive yourself' })
      if (target.platformRole === PlatformRole.SUPERADMIN && archived) return reply.code(403).send({ ok: false, error: 'Superadmin accounts cannot be archived' })
      if (isConfiguredSuperadminEmail(target.email) && archived) return reply.code(403).send({ ok: false, error: 'The configured superadmin cannot be archived' })
      const updated = await prisma.account.update({ where: { id: accountId }, data: { archivedAt: archived ? new Date() : null } })
      if (archived) await prisma.accountSession.updateMany({ where: { accountId }, data: { revokedAt: new Date() } })
      return { ok: true, account: { id: updated.id, archivedAt: updated.archivedAt?.toISOString() ?? null } }
    })

    app.delete('/team/accounts/:accountId', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId } = request.params as { accountId: string }
      const target = await prisma.account.findUnique({ where: { id: accountId } })
      if (!target) return reply.code(404).send({ ok: false, error: 'Account not found' })
      const requestAccountId = (request as any).account?.id as string | undefined
      if (target.id === requestAccountId) return reply.code(403).send({ ok: false, error: 'You cannot delete yourself' })
      if (target.platformRole === PlatformRole.SUPERADMIN || isConfiguredSuperadminEmail(target.email)) return reply.code(403).send({ ok: false, error: 'Superadmin accounts cannot be deleted' })
      if (!target.archivedAt) return reply.code(400).send({ ok: false, error: 'Archive the user before deleting them' })
      await prisma.account.delete({ where: { id: accountId } })
      await writeAuditLog({ actorAccountId: requestAccountId ?? null, action: 'audit.account.deleted', targetType: 'account', targetId: accountId, summary: `Deleted account ${target.email}`, metadata: { email: target.email } })
      return { ok: true }
    })

    app.post('/team/accounts/:accountId/avatar', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId } = request.params as { accountId: string }
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      if (!body.base64) return reply.code(400).send({ ok: false, error: 'base64 is required' })
      const target = await prisma.account.findUnique({ where: { id: accountId } })
      if (!target) return reply.code(404).send({ ok: false, error: 'Account not found' })
      const saved = saveProfileImage(accountId, { fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 })
      const updated = await prisma.account.update({ where: { id: accountId }, data: { avatarUrl: saved.url } })
      return { ok: true, url: saved.url, account: { id: updated.id, name: updated.name, email: updated.email, avatarUrl: updated.avatarUrl, platformRole: updated.platformRole } }
    })

    app.post('/team/accounts/:accountId/workspaces', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId } = request.params as { accountId: string }
      const body = request.body as { workspaceId?: string | null; role?: string | null }
      const role = normalizeWorkspaceRole(body.role ?? undefined)
      const workspaceId = body.workspaceId?.trim()
      if (!workspaceId) return reply.code(400).send({ ok: false, error: 'workspaceId is required' })
      if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
      const [account, workspace] = await Promise.all([prisma.account.findUnique({ where: { id: accountId } }), prisma.workspace.findUnique({ where: { id: workspaceId } })])
      if (!account) return reply.code(404).send({ ok: false, error: 'Account not found' })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      if (workspace.archivedAt) return reply.code(409).send({ ok: false, error: 'Workspace archived' })
      const membership = await prisma.workspaceMembership.upsert({
        where: { workspaceId_accountId: { workspaceId: workspace.id, accountId } },
        update: { role },
        create: { workspaceId: workspace.id, accountId, role },
      })
      return { ok: true, membershipId: membership.id }
    })

    app.delete('/team/accounts/:accountId/workspaces/:membershipId', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId, membershipId } = request.params as { accountId: string; membershipId: string }
      const membership = await prisma.workspaceMembership.findFirst({ where: { id: membershipId, accountId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      if (membership.role === WorkspaceRole.OWNER) {
        const ownerCount = await prisma.workspaceMembership.count({ where: { workspaceId: membership.workspaceId, role: WorkspaceRole.OWNER } })
        if (ownerCount <= 1) return reply.code(400).send({ ok: false, error: 'Workspace must have at least one owner' })
      }
      await prisma.workspaceMembership.delete({ where: { id: membershipId } })
      return { ok: true }
    })

    app.post('/team/accounts/:accountId/projects', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId } = request.params as { accountId: string }
      const body = request.body as { projectId?: string | null; role?: string | null }
      const role = normalizeProjectRole(body.role ?? undefined)
      const projectId = body.projectId?.trim()
      if (!projectId) return reply.code(400).send({ ok: false, error: 'projectId is required' })
      if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
      const [account, project] = await Promise.all([prisma.account.findUnique({ where: { id: accountId } }), prisma.project.findUnique({ where: { id: projectId } })])
      if (!account) return reply.code(404).send({ ok: false, error: 'Account not found' })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const projectWorkspace = await prisma.workspace.findUnique({ where: { id: project.workspaceId } })
      if (projectWorkspace?.archivedAt) return reply.code(409).send({ ok: false, error: 'Workspace archived' })
      const workspaceMembership = await prisma.workspaceMembership.findFirst({ where: { accountId, workspaceId: project.workspaceId } })
      if (!workspaceMembership) await prisma.workspaceMembership.create({ data: { accountId, workspaceId: project.workspaceId, role: WorkspaceRole.MEMBER } })
      const membership = await prisma.projectMembership.upsert({
        where: { projectId_accountId: { projectId: project.id, accountId } },
        update: { role },
        create: { projectId: project.id, accountId, role },
      })
      return { ok: true, membershipId: membership.id }
    })

    app.delete('/team/accounts/:accountId/projects/:membershipId', async (request, reply) => {
      if (!isPlatformAdmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const { accountId, membershipId } = request.params as { accountId: string; membershipId: string }
      const membership = await prisma.projectMembership.findFirst({ where: { id: membershipId, accountId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      if (membership.role === PROJECT_ROLE.OWNER) {
        const ownerCount = await prisma.projectMembership.count({ where: { projectId: membership.projectId, role: PROJECT_ROLE.OWNER } })
        if (ownerCount <= 1) return reply.code(400).send({ ok: false, error: 'Project must have at least one owner' })
      }
      await prisma.projectMembership.delete({ where: { id: membershipId } })
      return { ok: true }
    })

    app.patch('/workspaces/:workspaceId', async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const body = request.body as { name?: string }
      const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      if (!ensureWorkspaceIsActive(workspace, reply)) return
      const nextName = body.name?.trim()
      if (!nextName) return reply.code(400).send({ ok: false, error: 'name is required' })
      await prisma.workspace.update({ where: { id: workspaceId }, data: { name: nextName } })
      if (nextName !== workspace.name) {
        await logActivity({ workspaceId, ...actorFromRequest(request), type: 'workspace.updated', summary: `Updated workspace ${workspace.name}.`, payload: { details: [activityChange('name', workspace.name, nextName)] } })
      }
      return { ok: true }
    })

    app.get('/workspaces/:workspaceId/members', async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      const [memberships, invites] = await Promise.all([
        prisma.workspaceMembership.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'asc' },
          include: { account: true },
        }),
        prisma.accountInvite.findMany({
          where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'asc' },
        }),
      ])
      return [
        ...memberships.map((membership) => ({
          id: membership.id,
          accountId: membership.accountId,
          name: membership.account.name,
          email: membership.account.email,
          avatarUrl: membership.account.avatarUrl ?? null,
          role: membership.role,
          platformRole: membership.account.platformRole,
          createdAt: membership.createdAt.toISOString(),
          invited: false,
          inviteId: null,
          inviteAcceptedAt: null,
          inviteExpiresAt: null,
        })),
        ...invites
          .filter((invite) => !memberships.some((membership) => membership.account.email.toLowerCase() === invite.email.toLowerCase()))
          .map((invite) => ({
            id: `invite:${invite.id}`,
            accountId: invite.accountId ?? `invite:${invite.email.toLowerCase()}`,
            name: null,
            email: invite.email,
            role: invite.role,
            platformRole: 'NONE',
            createdAt: invite.createdAt.toISOString(),
            invited: true,
            inviteId: invite.id,
            inviteAcceptedAt: null,
            inviteExpiresAt: invite.expiresAt.toISOString(),
          })),
      ]
    })

    app.post('/workspaces/:workspaceId/members', async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const body = request.body as { accountId?: string; email?: string; name?: string; role?: string }
      const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      let accountId = body.accountId
      if (!accountId) {
        const email = body.email?.trim().toLowerCase()
        if (!email) return reply.code(400).send({ ok: false, error: 'accountId or email is required' })
        const account = await prisma.account.upsert({
          where: { email },
          update: { ...(body.name ? { name: body.name.trim() } : {}) },
          create: { email, name: body.name?.trim() || null },
        })
        accountId = account.id
      } else {
        const account = await prisma.account.findFirst({ where: { id: accountId } })
        if (!account) return reply.code(404).send({ ok: false, error: 'Account not found' })
      }
      const role = normalizeWorkspaceRole(body.role)
      if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
      const requester = (request as any).membership as { role: WorkspaceRole; accountId: string } | undefined
      if (!isPlatformAdmin(request)) {
        if (!requester) return reply.code(403).send({ ok: false, error: 'Workspace access denied' })
        if (accountId === requester.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
        if (!canManageWorkspaceRole(requester.role, requester.role === WorkspaceRole.OWNER ? WorkspaceRole.MEMBER : requester.role, role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
      }
      const existing = await prisma.workspaceMembership.findFirst({ where: { workspaceId, accountId } })
      if (existing) return { ok: true, membershipId: existing.id, existing: true }
      const membership = await prisma.workspaceMembership.create({ data: { workspaceId, accountId, role } })
      return { ok: true, membershipId: membership.id }
    })

    app.patch('/workspaces/:workspaceId/members/:membershipId', async (request, reply) => {
      const { workspaceId, membershipId } = request.params as { workspaceId: string; membershipId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const body = request.body as { role?: string }
      const membership = await prisma.workspaceMembership.findFirst({ where: { id: membershipId, workspaceId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      const requester = (request as any).membership as { role: WorkspaceRole; accountId: string } | undefined
      if (body.role !== undefined) {
        const role = normalizeWorkspaceRole(body.role)
        if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
        if (!isPlatformAdmin(request)) {
          if (!requester) return reply.code(403).send({ ok: false, error: 'Workspace access denied' })
          if (membership.accountId === requester.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
          if (!canManageWorkspaceRole(requester.role, membership.role, role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
        }
        await prisma.workspaceMembership.update({ where: { id: membershipId }, data: { role } })
      }
      return { ok: true }
    })

    app.delete('/workspaces/:workspaceId/members/:membershipId', async (request, reply) => {
      const { workspaceId, membershipId } = request.params as { workspaceId: string; membershipId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const membership = await prisma.workspaceMembership.findFirst({ where: { id: membershipId, workspaceId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      const requester = (request as any).membership as { role: WorkspaceRole; accountId: string } | undefined
      if (!isPlatformAdmin(request)) {
        if (!requester) return reply.code(403).send({ ok: false, error: 'Workspace access denied' })
        if (membership.accountId === requester.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
        if (!canManageWorkspaceRole(requester.role, membership.role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
      }
      if (membership.role === WorkspaceRole.OWNER) {
        const ownerCount = await prisma.workspaceMembership.count({ where: { workspaceId, role: WorkspaceRole.OWNER } })
        if (ownerCount <= 1) {
          return reply.code(400).send({ ok: false, error: 'Workspace must have at least one owner' })
        }
      }
      await prisma.workspaceMembership.delete({ where: { id: membershipId } })
      return { ok: true }
    })

    app.post('/workspaces/:workspaceId/invites/:inviteId/resend', async (request, reply) => {
      const { workspaceId, inviteId } = request.params as { workspaceId: string; inviteId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'Workspace not found' })
      const existing = await prisma.accountInvite.findFirst({ where: { id: inviteId, workspaceId, acceptedAt: null } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Invite not found' })

      let invite = existing
      if (existing.expiresAt <= new Date()) {
        invite = await prisma.accountInvite.create({
          data: {
            email: existing.email,
            workspaceId,
            role: existing.role,
            token: generateSessionToken(),
            expiresAt: getInviteExpiry(),
          },
        })
      }

      const mailResult = await sendInviteEmail({
        email: invite.email,
        inviteToken: invite.token,
        expiresAt: invite.expiresAt,
        workspaceName: workspace.name,
        role: invite.role,
      })
      if (!mailResult.ok) {
        request.log.warn({ err: mailResult.reason }, 'Failed to resend invite email')
      }
      return { ok: true, emailed: mailResult.ok, inviteId: invite.id, expiresAt: invite.expiresAt.toISOString() }
    })

    app.delete('/workspaces/:workspaceId/invites/:inviteId', async (request, reply) => {
      const { workspaceId, inviteId } = request.params as { workspaceId: string; inviteId: string }
      if (!(await requireWorkspaceRoleForWorkspaceId(request, reply, workspaceId, [WorkspaceRole.OWNER]))) return
      const invite = await prisma.accountInvite.findFirst({ where: { id: inviteId, workspaceId, acceptedAt: null } })
      if (!invite) return reply.code(404).send({ ok: false, error: 'Invite not found' })
      const email = invite.email
      await prisma.accountInvite.delete({ where: { id: inviteId } })
      const deletedPlaceholderAccount = await deleteOrphanPlaceholderAccountByEmail(email)
      return { ok: true, deletedPlaceholderAccount }
    })

    app.get('/projects/:projectId/members', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const requesterAccountId = ((request as any).account as { id: string } | undefined)?.id ?? null
      return getEffectiveProjectMembers(workspace.id, projectId, requesterAccountId)
    })

    app.post('/projects/:projectId/members', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const body = request.body as { accountId?: string; email?: string; name?: string; role?: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      let accountId = body.accountId
      if (!accountId) {
        const email = body.email?.trim().toLowerCase()
        if (!email) return reply.code(400).send({ ok: false, error: 'accountId or email is required' })
        const account = await prisma.account.upsert({
          where: { email },
          update: { ...(body.name ? { name: body.name.trim() } : {}) },
          create: { email, name: body.name?.trim() || null },
        })
        accountId = account.id
      } else {
        const account = await prisma.account.findFirst({ where: { id: accountId } })
        if (!account) return reply.code(404).send({ ok: false, error: 'Account not found' })
      }
      const role = normalizeProjectRole(body.role)
      if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
      const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
      const requesterProjectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: ((request as any).account as { id: string } | undefined)?.id } })
      if (!isPlatformAdmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
        if (!requesterProjectMembership) return reply.code(403).send({ ok: false, error: 'Project access denied' })
        if (accountId === requesterProjectMembership.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
        if (!canManageProjectRole(requesterProjectMembership.role, PROJECT_ROLE.MEMBER, role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
      }
      const existing = await prisma.projectMembership.findFirst({ where: { projectId, accountId } })
      if (existing) return { ok: true, membershipId: existing.id, existing: true }
      const membership = await prisma.projectMembership.create({ data: { projectId, accountId, role } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'project.member.added', summary: `Added account ${accountId} to project as ${role}.`, payload: { accountId, role } })
      return { ok: true, membershipId: membership.id }
    })

    app.patch('/projects/:projectId/members/:membershipId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId, membershipId } = request.params as { projectId: string; membershipId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const body = request.body as { role?: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const membership = await prisma.projectMembership.findFirst({ where: { id: membershipId, projectId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
      const requesterProjectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: ((request as any).account as { id: string } | undefined)?.id } })
      if (body.role !== undefined) {
        const role = normalizeProjectRole(body.role)
        if (!role) return reply.code(400).send({ ok: false, error: 'role is invalid' })
        if (!isPlatformAdmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
          if (!requesterProjectMembership) return reply.code(403).send({ ok: false, error: 'Project access denied' })
          if (membership.accountId === requesterProjectMembership.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
          if (!canManageProjectRole(requesterProjectMembership.role, membership.role, role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
        }
        if (membership.role === PROJECT_ROLE.OWNER && role !== PROJECT_ROLE.OWNER) {
          const ownerCount = await prisma.projectMembership.count({ where: { projectId, role: PROJECT_ROLE.OWNER } })
          if (ownerCount <= 1) {
            return reply.code(400).send({ ok: false, error: 'Project must have at least one owner' })
          }
        }
        await prisma.projectMembership.update({ where: { id: membershipId }, data: { role } })
      }
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'project.member.updated', summary: `Updated project member role to ${body.role}.`, payload: { membershipId, role: body.role } })
      return { ok: true }
    })

    app.delete('/projects/:projectId/members/:membershipId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId, membershipId } = request.params as { projectId: string; membershipId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const membership = await prisma.projectMembership.findFirst({ where: { id: membershipId, projectId } })
      if (!membership) return reply.code(404).send({ ok: false, error: 'Membership not found' })
      const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
      const requesterProjectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: ((request as any).account as { id: string } | undefined)?.id } })
      if (!isPlatformAdmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
        if (!requesterProjectMembership) return reply.code(403).send({ ok: false, error: 'Project access denied' })
        if (membership.accountId === requesterProjectMembership.accountId) return reply.code(403).send({ ok: false, error: 'You cannot change your own role' })
        if (!canManageProjectRole(requesterProjectMembership.role, membership.role)) return reply.code(403).send({ ok: false, error: 'Role change not allowed' })
      }
      if (membership.role === PROJECT_ROLE.OWNER) {
        const ownerCount = await prisma.projectMembership.count({ where: { projectId, role: PROJECT_ROLE.OWNER } })
        if (ownerCount <= 1) {
          return reply.code(400).send({ ok: false, error: 'Project must have at least one owner' })
        }
      }
      await prisma.projectMembership.delete({ where: { id: membershipId } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'project.member.removed', summary: `Removed project member (${membership.accountId}) from project.`, payload: { membershipId } })
      return { ok: true }
    })

    app.get('/projects/summary', async (request) => {
      const workspace = (request as any).workspace
      const projectIds = await getVisibleProjectIds(request, workspace.id)
      const projectWhere = { workspaceId: workspace.id, archivedAt: null, ...visibleProjectWhere(projectIds) }
      const [activeProjects, openTasks, inReview] = await Promise.all([
        prisma.project.count({ where: projectWhere }),
        prisma.task.count({ where: { archivedAt: null, project: projectWhere, status: { type: { in: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW'] } } } }),
        prisma.task.count({ where: { archivedAt: null, project: projectWhere, status: { type: 'REVIEW' } } }),
      ])
      return { activeProjects, openTasks, cycleHealth: inReview > 3 ? 'Needs review' : 'Good' }
    })

    app.get('/projects', async (request) => {
      const workspace = (request as any).workspace
      const query = request.query as { archived?: string }
      const archivedFilter = query.archived === 'true'
      const projectIds = await getVisibleProjectIds(request, workspace.id)
      const projects = await prisma.project.findMany({ where: { workspaceId: workspace.id, ...visibleProjectWhere(projectIds), ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }) }, orderBy: { createdAt: 'asc' }, include: { client: true, tasks: { where: { archivedAt: null }, include: { status: true } } } })
      return projects.map((project) => {
        const reviewCount = project.tasks.filter((task) => task.status.type === 'REVIEW').length
        return { id: project.id, name: project.name, client: project.client ? { id: project.client.id, name: project.client.name } : null, lead: project.tasks[0]?.assignee ?? 'Unassigned', tasks: project.tasks.length, status: reviewCount > 0 ? 'Review' : 'Active', createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(), archivedAt: project.archivedAt?.toISOString() ?? null }
      })
    })

    app.get('/clients', async (request) => {
      const workspace = (request as any).workspace
      const projectIds = await getVisibleProjectIds(request, workspace.id)
      const clients = await prisma.client.findMany({
        where: { workspaceId: workspace.id, ...(projectIds === null ? {} : { projects: { some: { id: { in: projectIds } } } }) },
        orderBy: { name: 'asc' },
        include: {
          projects: { where: projectIds === null ? {} : { id: { in: projectIds } }, select: { id: true } },
        },
      })
      return clients.map((client) => ({ id: client.id, name: client.name, notes: client.notes, projectCount: client.projects.length }))
    })

    app.post('/clients', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const body = request.body as { name: string; notes?: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const existing = await prisma.client.findFirst({ where: { workspaceId: workspace.id, name } })
      if (existing) return { ok: true, clientId: existing.id, existing: true }
      const client = await prisma.client.create({ data: { workspaceId: workspace.id, name, notes: body.notes?.trim() || null } })
      return { ok: true, clientId: client.id }
    })

    app.get('/clients/:clientId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { clientId } = request.params as { clientId: string }
      const projectIds = await getVisibleProjectIds(request, workspace.id)
      const client = await prisma.client.findFirst({
        where: { id: clientId, workspaceId: workspace.id, ...(projectIds === null ? {} : { projects: { some: { id: { in: projectIds } } } }) },
        include: {
          projects: {
            where: projectIds === null ? {} : { id: { in: projectIds } },
            orderBy: { createdAt: 'asc' },
            include: { tasks: { where: { archivedAt: null }, include: { status: true } } },
          },
        },
      })
      if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
      return {
        id: client.id,
        name: client.name,
        notes: client.notes,
        createdAt: client.createdAt.toISOString(),
        projectCount: client.projects.length,
        projects: client.projects.map((project) => {
          const reviewCount = project.tasks.filter((task) => task.status.type === 'REVIEW').length
          return {
            id: project.id,
            name: project.name,
            lead: project.tasks[0]?.assignee ?? 'Unassigned',
            tasks: project.tasks.length,
            status: reviewCount > 0 ? 'Review' : 'Active',
            archivedAt: project.archivedAt?.toISOString() ?? null,
          }
        }),
      }
    })

    app.patch('/clients/:clientId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { clientId } = request.params as { clientId: string }
      const body = request.body as { name?: string; notes?: string | null }
      const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId: workspace.id } })
      if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
      const data: { name?: string; notes?: string | null } = {}
      if (body.name !== undefined) {
        const nextName = body.name.trim()
        if (!nextName) return reply.code(400).send({ ok: false, error: 'name is required' })
        const existing = await prisma.client.findFirst({ where: { workspaceId: workspace.id, name: nextName, id: { not: clientId } } })
        if (existing) return reply.code(400).send({ ok: false, error: 'Client name already exists' })
        data.name = nextName
      }
      if (body.notes !== undefined) data.notes = body.notes?.trim() || null
      if (!Object.keys(data).length) return reply.code(400).send({ ok: false, error: 'No editable fields provided' })
      await prisma.client.update({ where: { id: clientId }, data })
      return { ok: true }
    })

    app.delete('/clients/:clientId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { clientId } = request.params as { clientId: string }
      const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId: workspace.id }, include: { _count: { select: { projects: true } } } })
      if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
      if (client._count.projects > 0) return reply.code(400).send({ ok: false, error: 'Client cannot be deleted while projects are still linked to it' })
      await prisma.client.delete({ where: { id: clientId } })
      return { ok: true }
    })

    app.get('/projects/:projectId/automation', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const [config, agents, jobs, runs, connections, blockers, approvalRequests] = await Promise.all([
        prisma.projectAutomationConfig.findUnique({ where: { projectId } }),
        prisma.agentIdentity.findMany({ where: { workspaceId: workspace.id, enabled: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
        prisma.agentJob.findMany({ where: { workspaceId: workspace.id, projectId }, include: { agent: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.agentRun.findMany({ where: { workspaceId: workspace.id, projectId }, include: { agent: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.agentConnection.findMany({ where: { workspaceId: workspace.id, projectId, revokedAt: null }, orderBy: { updatedAt: 'desc' }, take: 20 }),
        prisma.blocker.findMany({ where: { workspaceId: workspace.id, projectId, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.approvalRequest.findMany({ where: { workspaceId: workspace.id, projectId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ])
      return { config, agents, jobs, runs, connections: connections.map((connection) => redactAgentConnection(connection as any)), blockers, approvalRequests }
    })

    app.patch('/projects/:projectId/automation', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const body = request.body as Parameters<typeof buildProjectAutomationPatch>[0]
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      let data: Record<string, unknown>
      try { data = buildProjectAutomationPatch(body) } catch (err: any) { return reply.code(400).send({ ok: false, error: err.message }) }
      const agentIds = new Set<string>()
      if (data.defaultPmAgentId) agentIds.add(String(data.defaultPmAgentId))
      for (const value of Object.values((data.roleAgents as Record<string, string> | undefined) ?? {})) agentIds.add(value)
      if (agentIds.size) {
        const count = await prisma.agentIdentity.count({ where: { id: { in: [...agentIds] }, workspaceId: workspace.id, enabled: true } })
        if (count !== agentIds.size) return reply.code(404).send({ ok: false, error: 'One or more agents were not found or disabled' })
      }
      const config = await prisma.projectAutomationConfig.upsert({
        where: { projectId },
        create: { workspaceId: workspace.id, projectId, ...data } as any,
        update: data as any,
      })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'project_automation.updated', summary: 'Updated project automation config', payload: { projectId, workflowEnabled: config.workflowEnabled } })
      return { ok: true, config }
    })

    app.post('/projects/:projectId/automation/start-workflow', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id }, select: { id: true } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const config = await prisma.projectAutomationConfig.findUnique({ where: { projectId } })
      if (!config?.workflowEnabled) return reply.code(400).send({ ok: false, error: 'Project automation is not enabled' })
      const workflowRunId = randomUUID()
      const payload = buildStartProjectWorkflowJobPayload({ projectId, pmAgentId: config.defaultPmAgentId, workflowRunId })
      const body = request.body as { maxSteps?: number | null } | undefined
      if (body?.maxSteps) payload.maxSteps = body.maxSteps
      const job = await prisma.agentJob.create({
        data: {
          workspaceId: workspace.id,
          projectId,
          agentId: payload.agentId,
          createdById: ((request as any).account as { id: string } | undefined)?.id ?? null,
          role: payload.role,
          mode: payload.mode,
          triggerType: payload.triggerType,
          workflowRunId: payload.workflowRunId,
          workflowStep: payload.workflowStep,
          maxSteps: payload.maxSteps,
          payload: payload.payload as any,
        },
        include: { agent: true },
      })
      await prisma.projectAutomationConfig.update({ where: { projectId }, data: { automationState: 'queued', currentStage: 'PLANNING', nextRole: 'pm' } })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'agent_job.created', summary: 'Started project audit and planning workflow', payload: { jobId: job.id, workflowRunId, planningFirst: true } })
      await emitAgentEvent({ workspaceId: workspace.id, agentId: job.agentId, type: 'job.created', payload: { jobId: job.id, projectId, taskId: null, role: job.role, mode: job.mode, workflowRunId: job.workflowRunId, workflowStep: job.workflowStep, maxSteps: job.maxSteps } })
      return { ok: true, job, workflowRunId }
    })

    app.get('/projects/:projectId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { archived?: string }
      const archivedFilter = query.archived === 'true'
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }) }, include: { client: true, tasks: { where: { archivedAt: null }, include: { status: true, labels: { include: { label: true } }, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, collaborators: true, todos: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, statuses: { orderBy: [{ position: 'asc' }] }, labels: { orderBy: [{ name: 'asc' }] }, dependencies: { include: { dependsOn: { select: { id: true, name: true } } } }, dependedOnBy: { include: { project: { select: { id: true, name: true } } } }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 20 } } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, projectId)
      const visibleTasks = project.tasks.filter((task) => {
        const people = getResolvedTaskPeople(task)
        return canAccessTaskAssignee(taskScope, people.assignee, people.collaborators, people.owner, people.participants.map((participant) => participant.participant))
      })
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, visibleTasks.flatMap((task) => getResolvedTaskPeople(task).participants.map((participant) => participant.participant)))
      const timesheetScope = await resolveTimesheetScope(request, workspace.id, projectId)
      const visibleTimesheets = timesheetScope.elevated || !timesheetScope.userId ? project.timesheets : project.timesheets.filter((entry) => entry.userId === timesheetScope.userId)
      const openTasks = visibleTasks.filter((t) => t.status.type !== 'DONE').length
      const reviewTasks = visibleTasks.filter((t) => t.status.type === 'REVIEW').length
      const statusTaskCounts = new Map<string, number>()
      visibleTasks.forEach((task) => {
        statusTaskCounts.set(task.statusId, (statusTaskCounts.get(task.statusId) ?? 0) + 1)
      })
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        client: project.client ? { id: project.client.id, name: project.client.name } : null,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        taskCount: visibleTasks.length,
        openTasks,
        reviewTasks,
        statuses: project.statuses.map((s) => ({ id: s.id, name: s.name, type: s.type, position: s.position, color: s.color, taskCount: statusTaskCounts.get(s.id) ?? 0 })),
        labels: project.labels.map((l) => ({ id: l.id, name: l.name })),
        timesheetSummary: summarizeTimesheets(visibleTimesheets),
        timesheetUsers: Array.from(new Map(visibleTimesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()),
        recentTimesheets: visibleTimesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })),
        dependencies: project.dependencies.map((d) => ({ projectId: d.dependsOn.id, name: d.dependsOn.name })),
        dependedOnBy: project.dependedOnBy.map((d) => ({ projectId: d.project.id, name: d.project.name })),
        recentTasks: visibleTasks.slice(0, 8).map((t) => ({
          id: t.id,
          number: t.number,
          position: t.position,
          title: t.title,
          ...formatTaskPeopleForResponse(t, assigneeAvatars),
          priority: t.priority,
          status: t.status.name,
          statusId: t.statusId,
          statusColor: t.status.color,
          dueDate: t.dueDate?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          labels: t.labels.map((l) => l.label.name),
          todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null,
        })),
      }
    })

    app.get('/projects/:projectId/tasks', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { status?: string; assignee?: string; search?: string; label?: string; archived?: string }
      const archivedFilter = query.archived === 'true'
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, projectId)
      const taskWhere: Prisma.TaskWhereInput = {
        projectId,
        ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(query.assignee ? { OR: [{ owner: { contains: query.assignee, mode: 'insensitive' } }, { participants: { some: { participant: { contains: query.assignee, mode: 'insensitive' } } } }, { assignee: { contains: query.assignee, mode: 'insensitive' } }, { collaborators: { some: { collaborator: { contains: query.assignee, mode: 'insensitive' } } } }] } : {}),
        ...(query.status ? { status: { name: query.status } } : {}),
        ...(query.label ? { labels: { some: { label: { name: query.label } } } } : {}),
      }
      const and: Prisma.TaskWhereInput[] = []
      const visibilityWhere = taskVisibilityWhere(taskScope)
      if (Object.keys(visibilityWhere).length) and.push(visibilityWhere)
      if (query.search) and.push({ OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] })
      if (and.length) taskWhere.AND = and
      const tasks = await prisma.task.findMany({
        where: taskWhere,
        include: { status: true, labels: { include: { label: true } }, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, collaborators: true, todos: true },
        orderBy: [{ position: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
      })
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, tasks.flatMap((task) => getResolvedTaskPeople(task).participants.map((participant) => participant.participant)))
      return tasks.map((t) => ({
        id: t.id,
        number: t.number,
        position: t.position,
        title: t.title,
        ...formatTaskPeopleForResponse(t, assigneeAvatars),
        priority: t.priority,
        status: t.status.name,
        statusId: t.statusId,
        statusColor: t.status.color,
        dueDate: t.dueDate?.toISOString() ?? null,
        labels: t.labels.map((l) => l.label.name),
        todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        archivedAt: t.archivedAt?.toISOString() ?? null,
      }))
    })

    app.get('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { project: { include: { client: true } }, status: true, comments: { orderBy: { createdAt: 'asc' } }, labels: { include: { label: true } }, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, collaborators: true, todos: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, dependencies: { include: { dependsOn: { select: { id: true, number: true, title: true } } } }, dependedOnBy: { include: { task: { select: { id: true, number: true, title: true } } } }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 20 } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      const visibleTaskPeople = getResolvedTaskPeople(task)
      if (!canAccessTaskAssignee(taskScope, visibleTaskPeople.assignee, visibleTaskPeople.collaborators, visibleTaskPeople.owner, visibleTaskPeople.participants.map((participant) => participant.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, visibleTaskPeople.participants.map((participant) => participant.participant))
      const commentAvatars = await getAssigneeAvatarMap(workspace.id, task.comments.map((comment) => comment.author))
      const timesheetScope = await resolveTimesheetScope(request, workspace.id, task.projectId)
      const visibleTimesheets = timesheetScope.elevated || !timesheetScope.userId ? task.timesheets : task.timesheets.filter((entry) => entry.userId === timesheetScope.userId)
      return { id: task.id, number: task.number, position: task.position, title: task.title, description: task.description ?? 'No description yet.', ...formatTaskPeopleForResponse(task, assigneeAvatars), priority: task.priority, status: task.status.name, statusId: task.statusId, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), labels: task.labels.map((l) => l.label.name), dependencies: task.dependencies.map((d) => ({ taskId: d.dependsOn.id, number: d.dependsOn.number, title: d.dependsOn.title })), dependedOnBy: task.dependedOnBy.map((d) => ({ taskId: d.task.id, number: d.task.number, title: d.task.title })), todos: task.todos.map((t) => ({ id: t.id, text: t.text, done: t.done, position: t.position })), timesheetSummary: summarizeTimesheets(visibleTimesheets), timesheetUsers: Array.from(new Map(visibleTimesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()), timesheets: visibleTimesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: task.project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })), project: { id: task.project.id, name: task.project.name, client: task.project.client ? { id: task.project.client.id, name: task.project.client.name } : null }, comments: task.comments.map((c) => ({ id: c.id, author: c.author, authorAvatarUrl: commentAvatars.get(c.author) ?? null, body: c.body, createdAt: c.createdAt })) }
    })

    app.post('/tasks/:taskId/todos', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { text: string }
      const text = body.text?.trim()
      if (!text) return reply.code(400).send({ ok: false, error: 'text is required' })
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const maxPos = await prisma.taskTodo.aggregate({ where: { taskId }, _max: { position: true } })
      const todo = await prisma.taskTodo.create({ data: { taskId, text, position: (maxPos._max.position ?? -1) + 1 } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.todo.created', summary: `Updated checklist for task ${task.title}.`, payload: { todoId: todo.id, details: ['checklist item added'] } })
      return { ok: true, todoId: todo.id }
    })

    app.patch('/tasks/:taskId/todos/:todoId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId, todoId } = request.params as { taskId: string; todoId: string }
      const body = request.body as { text?: string; done?: boolean }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const todo = await prisma.taskTodo.findFirst({ where: { id: todoId, taskId } })
      if (!todo) return reply.code(404).send({ ok: false, error: 'Todo not found' })
      const details: string[] = []
      if (body.text !== undefined && body.text.trim() !== todo.text) details.push('checklist item renamed')
      if (body.done !== undefined && body.done !== todo.done) details.push(body.done ? 'checklist item completed' : 'checklist item reopened')
      await prisma.taskTodo.update({ where: { id: todoId }, data: { ...(body.text !== undefined ? { text: body.text.trim() } : {}), ...(body.done !== undefined ? { done: body.done } : {}) } })
      if (details.length) await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.todo.updated', summary: `Updated checklist for task ${task.title}.`, payload: { todoId, details } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/todos/:todoId/delete', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId, todoId } = request.params as { taskId: string; todoId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const todo = await prisma.taskTodo.findFirst({ where: { id: todoId, taskId } })
      if (!todo) return reply.code(404).send({ ok: false, error: 'Todo not found' })
      await prisma.taskTodo.delete({ where: { id: todoId } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.todo.deleted', summary: `Updated checklist for task ${task.title}.`, payload: { todoId, details: ['checklist item removed'] } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/todos/reorder', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { orderedTodoIds: string[] }
      if (!Array.isArray(body.orderedTodoIds) || !body.orderedTodoIds.length) return reply.code(400).send({ ok: false, error: 'orderedTodoIds is required' })
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const todos = await prisma.taskTodo.findMany({ where: { taskId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
      if (!todos.length) return reply.code(404).send({ ok: false, error: 'No todos found' })
      if (!hasExactTodoOrder(todos.map((todo) => todo.id), body.orderedTodoIds)) {
        return reply.code(400).send({ ok: false, error: 'orderedTodoIds must exactly match task todos' })
      }
      await prisma.$transaction(body.orderedTodoIds.map((id, index) => prisma.taskTodo.update({ where: { id }, data: { position: index } })))
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.todo.reordered', summary: `Updated checklist for task ${task.title}.`, payload: { details: ['checklist reordered'] } })
      return { ok: true }
    })

    app.post('/projects/:projectId/labels', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const label = await prisma.label.upsert({ where: { projectId_name: { projectId, name } }, update: {}, create: { projectId, name } })
      return { ok: true, labelId: label.id }
    })

    app.patch('/tasks/:taskId/labels', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { labels: string[] }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const labels = Array.from(new Set((body.labels || []).map((s) => s.trim()).filter(Boolean)))
      await prisma.$transaction(async (tx) => {
        const ids: string[] = []
        for (const name of labels) {
          const label = await tx.label.upsert({ where: { projectId_name: { projectId: task.projectId, name } }, update: {}, create: { projectId: task.projectId, name } })
          ids.push(label.id)
        }
        await tx.taskLabel.deleteMany({ where: { taskId } })
        if (ids.length) await tx.taskLabel.createMany({ data: ids.map((labelId) => ({ taskId, labelId })) })
      })
      return { ok: true }
    })

    app.get('/projects/:projectId/activity', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const events = await prisma.activityLog.findMany({ where: { workspaceId: workspace.id, projectId }, orderBy: { createdAt: 'desc' }, take: 100 })
      return events.map((event) => ({
        id: event.id,
        type: event.type,
        summary: event.summary,
        actorName: event.actorName,
        actorEmail: event.actorEmail,
        actorApiKeyLabel: event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? ((event.payload as Record<string, unknown>).actorApiKeyLabel as string | null | undefined) ?? null : null,
        actorMcpKeyLabel: event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? ((event.payload as Record<string, unknown>).actorMcpKeyLabel as string | null | undefined) ?? null : null,
        details: event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) && Array.isArray((event.payload as Record<string, unknown>).details)
          ? ((event.payload as Record<string, unknown>).details as unknown[]).filter((value): value is string => typeof value === 'string')
          : [],
        createdAt: event.createdAt.toISOString(),
      }))
    })

    app.post('/projects/:projectId/statuses', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name: string; type: TaskStatusType }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      if (!body.type || !['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'].includes(body.type)) return reply.code(400).send({ ok: false, error: 'valid type is required' })
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const maxPos = await prisma.taskStatus.aggregate({ where: { projectId }, _max: { position: true } })
      const status = await prisma.taskStatus.create({ data: { projectId, name, type: body.type, position: (maxPos._max.position ?? -1) + 1, color: '#1F2937' } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.created', summary: `Created status ${name}.`, payload: { statusId: status.id, name, semanticType: body.type } })
      return { ok: true, statusId: status.id }
    })

    app.patch('/projects/:projectId/statuses/:statusId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId, statusId } = request.params as { projectId: string; statusId: string }
      const body = request.body as { name?: string; type?: TaskStatusType; color?: string }
      const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId, project: { workspaceId: workspace.id } } })
      if (!status) return reply.code(404).send({ ok: false, error: 'Status not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      if (body.type !== undefined && !['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'].includes(body.type)) return reply.code(400).send({ ok: false, error: 'valid type is required' })
      const nextName = body.name !== undefined ? body.name.trim() : status.name
      if (!nextName) return reply.code(400).send({ ok: false, error: 'name is required' })
      const nextType = body.type !== undefined ? body.type : status.type
      const nextColor = body.color !== undefined ? (body.color.trim() || '#1F2937') : status.color
      const details: string[] = []
      if (nextName !== status.name) details.push(activityChange('name', status.name, nextName))
      if (nextType !== status.type) details.push(activityChange('type', status.type, nextType))
      if ((nextColor || null) !== (status.color || null)) details.push(activityChange('color', status.color, nextColor))
      await prisma.taskStatus.update({ where: { id: statusId }, data: { ...(body.name !== undefined ? { name: nextName } : {}), ...(body.type !== undefined ? { type: nextType } : {}), ...(body.color !== undefined ? { color: nextColor } : {}) } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.updated', summary: `Updated status ${status.name}.`, payload: { statusId, name: body.name, type: body.type, color: body.color, details } })
      return { ok: true }
    })

    app.post('/projects/:projectId/statuses/reorder', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { orderedStatusIds?: string[] }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const statuses = await prisma.taskStatus.findMany({ where: { projectId }, orderBy: { position: 'asc' } })
      const pinned = statuses[0]
      if (!pinned) return reply.code(400).send({ ok: false, error: 'No statuses found' })
      const movable = statuses.slice(1)
      const orderedStatusIds = Array.isArray(body.orderedStatusIds) ? body.orderedStatusIds : []
      if (orderedStatusIds.length !== movable.length) return reply.code(400).send({ ok: false, error: 'orderedStatusIds must include all movable statuses exactly once' })
      if (orderedStatusIds.includes(pinned.id)) return reply.code(400).send({ ok: false, error: 'The first status is pinned and cannot be reordered' })
      const movableIds = new Set(movable.map((status) => status.id))
      if (new Set(orderedStatusIds).size !== orderedStatusIds.length || orderedStatusIds.some((id) => !movableIds.has(id))) {
        return reply.code(400).send({ ok: false, error: 'orderedStatusIds must match the movable project statuses exactly' })
      }
      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < statuses.length; index += 1) {
          await tx.taskStatus.update({ where: { id: statuses[index].id }, data: { position: -(index + 1) } })
        }
        await tx.taskStatus.update({ where: { id: pinned.id }, data: { position: 0 } })
        for (let index = 0; index < orderedStatusIds.length; index += 1) {
          await tx.taskStatus.update({ where: { id: orderedStatusIds[index] }, data: { position: index + 1 } })
        }
      })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.reordered', summary: `Reordered statuses for ${project.name}.`, payload: { orderedStatusIds } })
      return { ok: true }
    })

    app.post('/projects/:projectId/statuses/:statusId/delete', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId, statusId } = request.params as { projectId: string; statusId: string }
      const body = request.body as { targetStatusId?: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const statuses = await prisma.taskStatus.findMany({ where: { projectId }, orderBy: { position: 'asc' } })
      if (body.targetStatusId && !statuses.some((s) => s.id === body.targetStatusId)) {
        return reply.code(400).send({ ok: false, error: 'Target status must belong to the same project' })
      }
      const status = statuses.find((s) => s.id === statusId)
      if (!status) return reply.code(404).send({ ok: false, error: 'Status not found' })
      if (statuses.length <= 1) return reply.code(400).send({ ok: false, error: 'Cannot delete the last status' })
      const remainingStatuses = statuses.filter((s) => s.id !== statusId)
      if (remainingStatuses.length === 0) return reply.code(400).send({ ok: false, error: 'Cannot delete the last status' })
      if (status.type === 'BACKLOG' && !remainingStatuses.some((s) => s.type === 'BACKLOG')) {
        return reply.code(400).send({ ok: false, error: 'Cannot delete the last backlog status' })
      }
      const taskCount = await prisma.task.count({ where: { statusId } })
      const fallbackTarget = remainingStatuses.find((s) => s.type === status.type) || remainingStatuses.find((s) => s.type === 'BACKLOG') || remainingStatuses[0]
      const targetStatusId = body.targetStatusId || fallbackTarget?.id
      if (taskCount > 0 && !targetStatusId) return reply.code(400).send({ ok: false, error: 'Target status required' })
      if (targetStatusId === statusId) return reply.code(400).send({ ok: false, error: 'Target status must differ' })
      await prisma.$transaction(async (tx) => {
        if (taskCount > 0 && targetStatusId) await tx.task.updateMany({ where: { statusId }, data: { statusId: targetStatusId } })
        await tx.taskStatus.delete({ where: { id: statusId } })
      })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.deleted', summary: `Deleted status ${status.name}.`, payload: { statusId, targetStatusId } })
      return { ok: true }
    })

    app.patch('/projects/:projectId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name?: string; description?: string; clientId?: string | null }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      let nextSlug = project.slug
      if (body.name && body.name.trim() && body.name.trim() != project.name) {
        let base = slugify(body.name), slug = base, suffix = 1
        while (await prisma.project.findFirst({ where: { workspaceId: project.workspaceId, slug, id: { not: projectId } } })) { suffix += 1; slug = `${base}-${suffix}` }
        nextSlug = slug
      }
      let nextClientId: string | null | undefined = undefined
      let nextClientName: string | null | undefined = undefined
      const currentClient = project.clientId ? await prisma.client.findFirst({ where: { id: project.clientId, workspaceId: project.workspaceId } }) : null
      if (body.clientId !== undefined) {
        if (!body.clientId) {
          nextClientId = null
          nextClientName = null
        } else {
          const client = await prisma.client.findFirst({ where: { id: body.clientId, workspaceId: project.workspaceId } })
          if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
          nextClientId = client.id
          nextClientName = client.name
        }
      }
      const nextName = body.name !== undefined ? body.name.trim() : project.name
      const nextDescription = body.description !== undefined ? (body.description.trim() || null) : project.description
      const details: string[] = []
      if (nextName !== project.name) details.push(activityChange('name', project.name, nextName))
      if ((nextDescription || null) !== (project.description || null)) details.push('description changed')
      if (body.clientId !== undefined && (nextClientId || null) !== (project.clientId || null)) details.push(activityChange('client', currentClient?.name || null, nextClientName))
      await prisma.project.update({ where: { id: projectId }, data: { ...(body.name !== undefined ? { name: nextName } : {}), ...(body.description !== undefined ? { description: nextDescription } : {}), ...(body.clientId !== undefined ? { clientId: nextClientId ?? null } : {}), slug: nextSlug } })
      if (body.description !== undefined) cleanupRemovedProjectDescriptionImages(project.description, nextDescription)
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'project.updated', summary: `Updated project ${project.name}.`, payload: { projectId, details } })
      return { ok: true }
    })

    app.post('/projects/:projectId/image-upload', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      if (!body.base64) return reply.code(400).send({ ok: false, error: 'base64 is required' })
      const saved = saveProjectImage(projectId, { fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 })
      return { ok: true, url: saved.url }
    })

    app.post('/projects/:projectId/archive', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { archived?: boolean }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const archived = body.archived !== false
      await prisma.project.update({ where: { id: projectId }, data: { archivedAt: archived ? new Date() : null } })
      return { ok: true }
    })

    app.delete('/projects/:projectId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { projectId } = request.params as { projectId: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      await prisma.project.delete({ where: { id: projectId } })
      return { ok: true }
    })

    app.post('/projects/:projectId/dependencies', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { dependsOnId: string }
      if (!body.dependsOnId) return reply.code(400).send({ ok: false, error: 'dependsOnId is required' })
      if (projectId === body.dependsOnId) return reply.code(400).send({ ok: false, error: 'A project cannot depend on itself' })
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const dependsOn = await prisma.project.findFirst({ where: { id: body.dependsOnId, workspaceId: workspace.id, archivedAt: null } })
      if (!dependsOn) return reply.code(404).send({ ok: false, error: 'Dependency target project not found in the same workspace' })
      const existing = await prisma.projectDependency.findUnique({ where: { projectId_dependsOnId: { projectId, dependsOnId: body.dependsOnId } } })
      if (existing) return reply.code(409).send({ ok: false, error: 'Dependency already exists' })
      if (await wouldCreateProjectDependencyCycle(projectId, body.dependsOnId)) return reply.code(400).send({ ok: false, error: 'Adding this dependency would create a cycle' })
      await prisma.projectDependency.create({ data: { projectId, dependsOnId: body.dependsOnId } })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'project.dependency.added', summary: `Added dependency: "${project.name}" depends on "${dependsOn.name}".`, payload: { dependsOnId: body.dependsOnId } })
      return { ok: true }
    })

    app.delete('/projects/:projectId/dependencies/:dependsOnId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId, dependsOnId } = request.params as { projectId: string; dependsOnId: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const dep = await prisma.projectDependency.findUnique({ where: { projectId_dependsOnId: { projectId, dependsOnId } } })
      if (!dep) return reply.code(404).send({ ok: false, error: 'Dependency not found' })
      const dependsOnProject = await prisma.project.findFirst({ where: { id: dependsOnId }, select: { name: true } })
      await prisma.projectDependency.delete({ where: { projectId_dependsOnId: { projectId, dependsOnId } } })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'project.dependency.removed', summary: `Removed dependency: "${project.name}" no longer depends on "${dependsOnProject?.name ?? dependsOnId}".`, payload: { dependsOnId } })
      return { ok: true }
    })

    app.post('/projects', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const account = (request as any).account as { id: string } | undefined
      const body = request.body as { name: string; description?: string; clientId?: string | null }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      let slug = slugify(name), suffix = 1
      while (await prisma.project.findFirst({ where: { workspaceId: workspace.id, slug } })) { suffix += 1; slug = `${slugify(name)}-${suffix}` }
      let clientId: string | null = null
      if (body.clientId) {
        const client = await prisma.client.findFirst({ where: { id: body.clientId, workspaceId: workspace.id } })
        if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
        clientId = client.id
      }
      const workspaceOwners = await prisma.workspaceMembership.findMany({ where: { workspaceId: workspace.id, role: WorkspaceRole.OWNER }, select: { accountId: true } })
      const configuredSuperadminEmail = getConfiguredSuperadminEmail()
      const configuredSuperadmin = configuredSuperadminEmail ? await prisma.account.findFirst({ where: { email: configuredSuperadminEmail, platformRole: PlatformRole.SUPERADMIN }, select: { id: true } }) : null
      const defaultOwnerIds = Array.from(new Set([...(account ? [account.id] : []), ...workspaceOwners.map((membership) => membership.accountId), ...(configuredSuperadmin ? [configuredSuperadmin.id] : [])]))
      const project = await prisma.project.create({
        data: {
          workspaceId: workspace.id,
          clientId,
          name,
          slug,
          description: body.description?.trim() || null,
          statuses: { create: [
            { name: 'Backlog', type: 'BACKLOG', position: 0, color: '#1F2937' },
            { name: 'In Progress', type: 'IN_PROGRESS', position: 1, color: '#172554' },
            { name: 'Blocked', type: 'BLOCKED', position: 2, color: '#7f1d1d' },
            { name: 'Review', type: 'REVIEW', position: 3, color: '#422006' },
            { name: 'Done', type: 'DONE', position: 4, color: '#14532D' },
          ] },
          ...(defaultOwnerIds.length ? { memberships: { create: defaultOwnerIds.map((accountId) => ({ accountId, role: PROJECT_ROLE.OWNER })) } } : {}),
        },
      })
      return { ok: true, projectId: project.id }
    })

    app.get('/board', async (request) => {
      const workspace = (request as any).workspace
      const query = request.query as { projectId?: string }
      return getBoardData(request, workspace.id, query.projectId)
    })

    app.post('/tasks', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const body = request.body as { projectId: string; title: string; owner?: string; participants?: string[]; assignee?: string; collaborators?: string[]; description?: string; priority?: TaskPriority; status?: string; statusId?: string; dueDate?: string | null; labels?: string[]; todos?: { text: string }[] }
      if (!body.projectId || !body.title?.trim()) return reply.code(400).send({ ok: false, error: 'projectId and title are required' })
      const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, body.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      let targetStatus = null
      if (body.statusId) targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.statusId, projectId: body.projectId } })
      if (!targetStatus && body.status) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId, name: body.status } })
      if (!targetStatus) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId }, orderBy: { position: 'asc' } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found for project' })
      const maxPositionTask = await prisma.task.findFirst({ where: { projectId: body.projectId, archivedAt: null }, orderBy: [{ position: 'desc' }], select: { position: true } })
      const labels = normalizeTaskLabels(body.labels)
      const todos = normalizeTaskTodoTexts(body.todos)
      const requestAccountEmail = ((request as any).account as { email?: string } | undefined)?.email ?? null
      const peopleWrite = buildTaskParticipantWrites({
        owner: body.owner !== undefined ? body.owner : body.assignee !== undefined ? body.assignee : body.participants !== undefined ? undefined : requestAccountEmail,
        participants: body.participants !== undefined ? body.participants : body.collaborators,
        assignee: body.assignee,
        collaborators: body.collaborators,
      })
      if (peopleWrite.assignee) {
        const allowedAssignee = await ensureProjectMembershipForAssignee(workspace.id, body.projectId, peopleWrite.assignee)
        if (!allowedAssignee) return reply.code(400).send({ ok: false, error: 'Assignee must already be a member of this project' })
      }
      for (const collaborator of peopleWrite.collaborators) {
        const allowedCollaborator = await ensureProjectMembershipForAssignee(workspace.id, body.projectId, collaborator)
        if (!allowedCollaborator) return reply.code(400).send({ ok: false, error: 'Collaborators must already be members of this project' })
      }
      const task = await prisma.$transaction(async (tx) => {
        const updatedProject = await tx.project.update({ where: { id: body.projectId }, data: { taskCounter: { increment: 1 } } })
        const createdTask = await tx.task.create({ data: { projectId: body.projectId, statusId: targetStatus.id, number: updatedProject.taskCounter, title: body.title.trim(), description: body.description?.trim() || null, owner: peopleWrite.owner, assignee: peopleWrite.assignee, priority: body.priority ?? 'P2', dueDate: toIsoOrNull(body.dueDate), position: (maxPositionTask?.position ?? -1) + 1 } })
        if (peopleWrite.participantRows.length) {
          await tx.taskParticipant.createMany({ data: peopleWrite.participantRows.map((participant) => ({ taskId: createdTask.id, participant: participant.participant, role: participant.role, position: participant.position })) })
        }
        if (peopleWrite.collaborators.length) {
          await tx.taskCollaborator.createMany({ data: peopleWrite.collaborators.map((collaborator) => ({ taskId: createdTask.id, collaborator })) })
        }
        if (labels.length) {
          const labelIds: string[] = []
          for (const name of labels) {
            const label = await tx.label.upsert({ where: { projectId_name: { projectId: body.projectId, name } }, update: {}, create: { projectId: body.projectId, name } })
            labelIds.push(label.id)
          }
          await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: createdTask.id, labelId })) })
        }
        if (todos.length) {
          await tx.taskTodo.createMany({ data: todos.map((text, index) => ({ taskId: createdTask.id, text, position: index })) })
        }
        return createdTask
      })
      for (const participant of peopleWrite.participantRows) await ensureProjectMembershipForAssignee(workspace.id, task.projectId, participant.participant)
      for (const participant of peopleWrite.participantRows) {
        await notifyTaskAssignment({ workspaceId: workspace.id, projectId: task.projectId, taskId: task.id, taskTitle: task.title, assignee: participant.participant, actorAccountId: ((request as any).account as { id: string } | undefined)?.id ?? null })
      }
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId: task.id, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.created', summary: `Created task ${task.title}.`, payload: { taskId: task.id } })
      return { ok: true, taskId: task.id }
    })

    app.patch('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const params = request.params as { taskId: string }
      const body = request.body as { title?: string; description?: string; owner?: string; participants?: string[]; assignee?: string; collaborators?: string[]; priority?: TaskPriority; dueDate?: string | null; statusId?: string }
      const existing = await prisma.task.findFirst({ where: { id: params.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, existing.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, existing.projectId)
      if (!canAccessTaskAssignee(taskScope, existing.assignee, existing.collaborators.map((item) => item.collaborator), existing.owner, existing.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const currentStatus = await prisma.taskStatus.findFirst({ where: { id: existing.statusId }, select: { id: true, name: true } })
      let targetStatusName: string | null = null
      if (body.statusId) {
        const targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.statusId, projectId: existing.projectId } })
        if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found for task project' })
        targetStatusName = targetStatus.name
      }
      const existingPeople = getResolvedTaskPeople(existing)
      const nextTitle = body.title !== undefined ? body.title : existing.title
      const nextDescription = body.description !== undefined ? body.description : existing.description
      const peopleWrite = buildTaskParticipantWrites({
        owner: body.owner !== undefined ? body.owner : body.assignee !== undefined ? body.assignee : existingPeople.owner,
        participants: body.participants !== undefined ? body.participants : body.collaborators !== undefined ? body.collaborators : existingPeople.participants.map((participant) => participant.participant),
      })
      const nextPriority = body.priority !== undefined ? body.priority : existing.priority
      const nextDueDate = body.dueDate !== undefined ? toIsoOrNull(body.dueDate) : existing.dueDate
      const nextStatusId = body.statusId !== undefined ? body.statusId : existing.statusId
      const details: string[] = []
      if (nextTitle !== existing.title) details.push(activityChange('title', existing.title, nextTitle))
      if ((nextDescription || null) !== (existing.description || null)) details.push('description changed')
      if ((peopleWrite.owner || null) !== (existingPeople.owner || null)) details.push(activityChange('owner', existingPeople.owner, peopleWrite.owner))
      if (JSON.stringify(peopleWrite.collaborators) !== JSON.stringify(existingPeople.collaborators)) details.push('participants changed')
      if (nextPriority !== existing.priority) details.push(activityChange('priority', existing.priority, nextPriority))
      if ((nextDueDate || null)?.toString() !== (existing.dueDate || null)?.toString()) details.push(activityChange('due date', existing.dueDate, nextDueDate))
      if (nextStatusId !== existing.statusId) details.push(activityChange('status', currentStatus?.name || existing.statusId, targetStatusName || nextStatusId))
      if (peopleWrite.assignee) {
        const allowedAssignee = await ensureProjectMembershipForAssignee(workspace.id, existing.projectId, peopleWrite.assignee)
        if (!allowedAssignee) return reply.code(400).send({ ok: false, error: 'Assignee must already be a member of this project' })
      }
      for (const collaborator of peopleWrite.collaborators) {
        const allowedCollaborator = await ensureProjectMembershipForAssignee(workspace.id, existing.projectId, collaborator)
        if (!allowedCollaborator) return reply.code(400).send({ ok: false, error: 'Collaborators must already be members of this project' })
      }
      await prisma.$transaction(async (tx) => {
        await tx.task.update({ where: { id: params.taskId }, data: { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.description !== undefined ? { description: body.description } : {}), owner: peopleWrite.owner, assignee: peopleWrite.assignee, ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.dueDate !== undefined ? { dueDate: toIsoOrNull(body.dueDate) } : {}), ...(body.statusId !== undefined ? { statusId: body.statusId } : {}) } })
        await tx.taskParticipant.deleteMany({ where: { taskId: params.taskId } })
        if (peopleWrite.participantRows.length) {
          await tx.taskParticipant.createMany({ data: peopleWrite.participantRows.map((participant) => ({ taskId: params.taskId, participant: participant.participant, role: participant.role, position: participant.position })) })
        }
        await tx.taskCollaborator.deleteMany({ where: { taskId: params.taskId } })
        if (peopleWrite.collaborators.length) {
          await tx.taskCollaborator.createMany({ data: peopleWrite.collaborators.map((collaborator) => ({ taskId: params.taskId, collaborator })) })
        }
      })
      const existingParticipantNames = existingPeople.participants.map((participant) => participant.participant)
      for (const participant of peopleWrite.participantRows) await ensureProjectMembershipForAssignee(workspace.id, existing.projectId, participant.participant)
      for (const participant of peopleWrite.participantRows.filter((value) => !existingParticipantNames.includes(value.participant))) {
        await notifyTaskAssignment({ workspaceId: workspace.id, projectId: existing.projectId, taskId: existing.id, taskTitle: nextTitle, assignee: participant.participant, actorAccountId: ((request as any).account as { id: string } | undefined)?.id ?? null })
      }
      if (body.description !== undefined) cleanupRemovedDescriptionImages(existing.description, nextDescription)
      await logActivity({ workspaceId: workspace.id, projectId: existing.projectId, taskId: existing.id, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.updated', summary: `Updated task ${existing.title}.`, payload: { taskId: existing.id, details } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/archive', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { archived?: boolean }
      const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: workspace.id } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const archived = body.archived !== false
      await prisma.task.update({ where: { id: taskId }, data: { archivedAt: archived ? new Date() : null } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: archived ? 'task.archived' : 'task.unarchived', summary: `${archived ? 'Archived' : 'Unarchived'} task ${task.title}.`, payload: { taskId } })
      return { ok: true }
    })

    app.delete('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      await prisma.task.delete({ where: { id: taskId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/dependencies', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { dependsOnId: string }
      if (!body.dependsOnId) return reply.code(400).send({ ok: false, error: 'dependsOnId is required' })
      if (taskId === body.dependsOnId) return reply.code(400).send({ ok: false, error: 'A task cannot depend on itself' })
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const dependsOn = await prisma.task.findFirst({ where: { id: body.dependsOnId, projectId: task.projectId, archivedAt: null } })
      if (!dependsOn) return reply.code(404).send({ ok: false, error: 'Dependency target task not found in the same project' })
      const existing = await prisma.taskDependency.findUnique({ where: { taskId_dependsOnId: { taskId, dependsOnId: body.dependsOnId } } })
      if (existing) return reply.code(409).send({ ok: false, error: 'Dependency already exists' })
      if (await wouldCreateDependencyCycle(taskId, body.dependsOnId)) return reply.code(400).send({ ok: false, error: 'Adding this dependency would create a cycle' })
      await prisma.taskDependency.create({ data: { taskId, dependsOnId: body.dependsOnId } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, ...actorFromRequest(request), type: 'task.dependency.added', summary: `Added dependency: "${task.title}" depends on "${dependsOn.title}".`, payload: { dependsOnId: body.dependsOnId } })
      return { ok: true }
    })

    app.delete('/tasks/:taskId/dependencies/:dependsOnId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId, dependsOnId } = request.params as { taskId: string; dependsOnId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const dep = await prisma.taskDependency.findUnique({ where: { taskId_dependsOnId: { taskId, dependsOnId } } })
      if (!dep) return reply.code(404).send({ ok: false, error: 'Dependency not found' })
      const dependsOn = await prisma.task.findFirst({ where: { id: dependsOnId }, select: { title: true } })
      await prisma.taskDependency.delete({ where: { taskId_dependsOnId: { taskId, dependsOnId } } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, ...actorFromRequest(request), type: 'task.dependency.removed', summary: `Removed dependency: "${task.title}" no longer depends on "${dependsOn?.title ?? dependsOnId}".`, payload: { dependsOnId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/image-upload', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      if (!body.base64) return reply.code(400).send({ ok: false, error: 'base64 is required' })
      const saved = saveTaskImage(taskId, { fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 })
      return { ok: true, url: saved.url }
    })

    app.get('/projects/:projectId/timesheets', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { from?: string; to?: string }
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const timesheetScope = await resolveTimesheetScope(request, workspace.id, projectId)
      const where: any = { projectId }
      if (!timesheetScope.elevated && timesheetScope.userId) where.userId = timesheetScope.userId
      if (query.from || query.to) {
        where.date = {}
        if (query.from) where.date.gte = new Date(`${query.from}T00:00:00.000Z`)
        if (query.to) where.date.lte = new Date(`${query.to}T23:59:59.999Z`)
      }
      const entries = await prisma.timesheetEntry.findMany({ where, include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] })
      return { summary: summarizeTimesheets(entries), entries: entries.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: entry.projectId, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })) }
    })

    app.get('/tasks/:taskId/timesheets', async (request, reply) => {
      const workspace = (request as any).workspace
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: workspace.id } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const timesheetScope = await resolveTimesheetScope(request, workspace.id, task.projectId)
      const where: any = { taskId }
      if (!timesheetScope.elevated && timesheetScope.userId) where.userId = timesheetScope.userId
      const entries = await prisma.timesheetEntry.findMany({ where, include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] })
      return { summary: summarizeTimesheets(entries), entries: entries.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: entry.projectId, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })) }
    })

    app.get('/timesheets/users', async (request, reply) => {
      const workspace = (request as any).workspace
      const query = request.query as { projectId?: string }
      const scope = await resolveTimesheetScope(request, workspace.id, query.projectId)
      if (!scope.elevated && scope.userId) {
        const user = await prisma.user.findFirst({ where: { id: scope.userId, workspaceId: workspace.id } })
        if (user) return [{ id: user.id, name: user.name }]
        return []
      }
      if (!query.projectId) {
        const users = await prisma.user.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: 'asc' } })
        return users.map((user) => ({ id: user.id, name: user.name }))
      }
      const project = await prisma.project.findFirst({ where: { id: query.projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, project.id, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const memberships = await prisma.projectMembership.findMany({
        where: { projectId: query.projectId },
        include: { account: true },
      })
      const desiredNames = Array.from(new Set(memberships.map((membership) => (membership.account.name || membership.account.email).trim()).filter(Boolean)))
      if (!desiredNames.length) {
        const users = await prisma.user.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: 'asc' } })
        return users.map((user) => ({ id: user.id, name: user.name }))
      }
      const existing = await prisma.user.findMany({ where: { workspaceId: workspace.id, name: { in: desiredNames } }, orderBy: { name: 'asc' } })
      const existingNames = new Set(existing.map((user) => user.name))
      const missingNames = desiredNames.filter((name) => !existingNames.has(name))
      if (missingNames.length) {
        await prisma.user.createMany({
          data: missingNames.map((name) => ({ workspaceId: workspace.id, name })),
          skipDuplicates: true,
        })
      }
      const users = await prisma.user.findMany({ where: { workspaceId: workspace.id, name: { in: desiredNames } }, orderBy: { name: 'asc' } })
      return users.map((user) => ({ id: user.id, name: user.name }))
    })

    app.get('/timesheets/report', async (request, reply) => {
      const workspace = (request as any).workspace
      const query = request.query as { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; userId?: string; showValidated?: string }
      let scopeProjectId = query.projectId
      if (!scopeProjectId && query.taskId) {
        const task = await prisma.task.findFirst({ where: { id: query.taskId, project: { workspaceId: workspace.id } }, select: { projectId: true } })
        if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
        scopeProjectId = task.projectId
      }
      const scope = await resolveTimesheetScope(request, workspace.id, scopeProjectId)
      const where: any = { project: { workspaceId: workspace.id } }
      if (query.projectId) where.projectId = query.projectId
      if (query.taskId) where.taskId = query.taskId
      if (query.userId) where.userId = query.userId
      if (query.clientId) where.project = { workspaceId: workspace.id, clientId: query.clientId }
      if (!scope.elevated && scope.userId) where.userId = scope.userId
      if (query.showValidated !== 'true') where.validated = false
      if (query.from || query.to) {
        where.date = {}
        if (query.from) where.date.gte = new Date(`${query.from}T00:00:00.000Z`)
        if (query.to) where.date.lte = new Date(`${query.to}T23:59:59.999Z`)
      }
      const entries = await prisma.timesheetEntry.findMany({
        where,
        include: {
          user: true,
          task: { select: { title: true } },
          project: { include: { client: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      })
      return {
        summary: summarizeTimesheets(entries),
        entries: entries.map((entry) => ({
          id: entry.id,
          userId: entry.userId,
          userName: entry.user.name,
          projectId: entry.projectId,
          projectName: entry.project.name,
          clientId: entry.project.client?.id ?? null,
          clientName: entry.project.client?.name ?? null,
          taskId: entry.taskId ?? null,
          taskTitle: entry.task?.title ?? null,
          date: entry.date.toISOString(),
          minutes: entry.minutes,
          description: entry.description,
          billable: entry.billable,
          validated: entry.validated,
          createdAt: entry.createdAt.toISOString(),
        })),
      }
    })

    app.post('/timesheets', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const body = request.body as { userName?: string; userId?: string; projectId: string; taskId?: string | null; date?: string; minutes: number; description?: string; billable?: boolean; validated?: boolean }
      if (!body.projectId || !body.minutes || body.minutes <= 0) return reply.code(400).send({ ok: false, error: 'projectId and positive minutes are required' })
      if (body.validated !== undefined && body.validated) {
        if (!(await requireProjectRole(request, reply, body.projectId, [PROJECT_ROLE.OWNER]))) return
      }
      const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, body.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      if (body.taskId) {
        const task = await prisma.task.findFirst({ where: { id: body.taskId, projectId: body.projectId } })
        if (!task) return reply.code(404).send({ ok: false, error: 'Task not found for project' })
      }
      const scope = await resolveTimesheetScope(request, workspace.id, body.projectId)
      let userId = chooseCreateTimesheetUserId({ elevated: scope.elevated, requestedUserId: body.userId, currentUserId: scope.userId })
      if (!userId) return reply.code(403).send({ ok: false, error: 'Timesheet user unavailable' })
      if (userId) {
        const user = await prisma.user.findFirst({ where: { id: userId, workspaceId: project.workspaceId } })
        if (!user) return reply.code(404).send({ ok: false, error: 'User not found for project workspace' })
      } else {
        const userName = body.userName?.trim() || 'Alex'
        const user = await prisma.user.upsert({ where: { workspaceId_name: { workspaceId: project.workspaceId, name: userName } }, update: {}, create: { workspaceId: project.workspaceId, name: userName } })
        userId = user.id
      }
      const entry = await prisma.timesheetEntry.create({ data: { userId, projectId: body.projectId, taskId: body.taskId || null, date: new Date(body.date || new Date().toISOString()), minutes: Math.round(body.minutes), description: body.description?.trim() || null, billable: body.billable ?? true, validated: body.validated ?? false } })
      return { ok: true, timesheetId: entry.id }
    })

    app.patch('/timesheets/:timesheetId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { timesheetId } = request.params as { timesheetId: string }
      const body = request.body as { minutes?: number; description?: string | null; date?: string; billable?: boolean; validated?: boolean; taskId?: string | null; userId?: string }
      const entry = await prisma.timesheetEntry.findFirst({ where: { id: timesheetId, project: { workspaceId: workspace.id } }, select: { id: true, projectId: true, userId: true, taskId: true, minutes: true, description: true, date: true, billable: true, validated: true } })
      if (!entry) return reply.code(404).send({ ok: false, error: 'Timesheet entry not found' })
      if (!(await requireProjectRole(request, reply, entry.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const scope = await resolveTimesheetScope(request, workspace.id, entry.projectId)
      if (!scope.elevated && scope.userId && entry.userId !== scope.userId) return reply.code(403).send({ ok: false, error: 'Timesheet access denied' })
      if (body.validated !== undefined || body.userId !== undefined) {
        if (!(await requireProjectRole(request, reply, entry.projectId, [PROJECT_ROLE.OWNER]))) return
      }
      const data: Record<string, any> = {}
      if (body.minutes !== undefined) {
        const minutes = Math.round(Number(body.minutes))
        if (!minutes || minutes <= 0) return reply.code(400).send({ ok: false, error: 'minutes must be > 0' })
        data.minutes = minutes
      }
      if (body.description !== undefined) data.description = body.description?.trim() || null
      if (body.date !== undefined) {
        const dateValue = new Date(body.date)
        if (Number.isNaN(dateValue.getTime())) return reply.code(400).send({ ok: false, error: 'date is invalid' })
        data.date = dateValue
      }
      if (body.billable !== undefined) data.billable = body.billable
      if (body.validated !== undefined) data.validated = body.validated
      let nextUserName: string | null = null
      let previousUserName: string | null = null
      if (body.userId !== undefined) {
        if (!body.userId) return reply.code(400).send({ ok: false, error: 'userId is required' })
        const user = await prisma.user.findFirst({ where: { id: body.userId, workspaceId: workspace.id } })
        if (!user) return reply.code(404).send({ ok: false, error: 'User not found for workspace' })
        data.userId = user.id
        nextUserName = user.name
      }
      let nextTaskTitle: string | null = null
      let previousTaskTitle: string | null = null
      if (body.taskId !== undefined) {
        if (!body.taskId) {
          data.taskId = null
          nextTaskTitle = null
        } else {
          const task = await prisma.task.findFirst({ where: { id: body.taskId, projectId: entry.projectId } })
          if (!task) return reply.code(404).send({ ok: false, error: 'Task not found for entry project' })
          data.taskId = task.id
          nextTaskTitle = task.title
        }
      }
      if (!Object.keys(data).length) return reply.code(400).send({ ok: false, error: 'No editable fields provided' })
      if (body.userId !== undefined || entry.userId) {
        const currentUser = await prisma.user.findFirst({ where: { id: entry.userId, workspaceId: workspace.id } })
        previousUserName = currentUser?.name ?? null
      }
      if (body.taskId !== undefined || entry.taskId) {
        const currentTask = entry.taskId ? await prisma.task.findFirst({ where: { id: entry.taskId, projectId: entry.projectId } }) : null
        previousTaskTitle = currentTask?.title ?? null
      }
      const details: string[] = []
      if (data.minutes !== undefined && data.minutes !== entry.minutes) details.push(activityChange('minutes', entry.minutes, data.minutes))
      if (data.description !== undefined && (data.description || null) !== (entry.description || null)) details.push('description changed')
      if (data.date !== undefined && String(data.date) !== String(entry.date)) details.push(activityChange('date', entry.date, data.date))
      if (data.billable !== undefined && data.billable !== entry.billable) details.push(activityChange('billable', entry.billable, data.billable))
      if (data.validated !== undefined && data.validated !== entry.validated) details.push(activityChange('validated', entry.validated, data.validated))
      if (data.userId !== undefined && data.userId !== entry.userId) details.push(activityChange('user', previousUserName, nextUserName))
      if (data.taskId !== undefined && (data.taskId || null) !== (entry.taskId || null)) details.push(activityChange('task', previousTaskTitle, nextTaskTitle))
      await prisma.timesheetEntry.update({ where: { id: timesheetId }, data })
      await logActivity({ workspaceId: workspace.id, projectId: entry.projectId, taskId: entry.taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'timesheet.updated', summary: `Updated timesheet entry (${entry.minutes} minutes).`, payload: { timesheetId, details } })
      return { ok: true }
    })

    app.delete('/timesheets/:timesheetId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { timesheetId } = request.params as { timesheetId: string }
      const entry = await prisma.timesheetEntry.findFirst({ where: { id: timesheetId, project: { workspaceId: workspace.id } } })
      if (!entry) return reply.code(404).send({ ok: false, error: 'Timesheet entry not found' })
      if (!(await requireProjectRole(request, reply, entry.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const scope = await resolveTimesheetScope(request, workspace.id, entry.projectId)
      if (!scope.elevated && scope.userId && entry.userId !== scope.userId) return reply.code(403).send({ ok: false, error: 'Timesheet access denied' })
      await prisma.timesheetEntry.delete({ where: { id: timesheetId } })
      await logActivity({ workspaceId: workspace.id, projectId: entry.projectId, taskId: entry.taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'timesheet.deleted', summary: `Deleted a timesheet entry (${entry.minutes} minutes).`, payload: { timesheetId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/comments', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { body: string; author?: string; mentions?: string[] }
      const commentBody = body.body?.trim()
      if (!commentBody) return reply.code(400).send({ ok: false, error: 'comment body is required' })
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const authorAccount = (request as any).account as { id: string; name?: string | null; email?: string | null } | undefined
      const comment = await prisma.comment.create({ data: { taskId, body: commentBody, author: body.author?.trim() || authorAccount?.name || authorAccount?.email || 'Alex', authorAccountId: authorAccount?.id ?? null } })
      const mentionedIds = Array.from(new Set((body.mentions || []).filter(Boolean)))
      if (mentionedIds.length) {
        const validMentions = await prisma.workspaceMembership.findMany({ where: { workspaceId: workspace.id, accountId: { in: mentionedIds } }, select: { accountId: true } })
        const validMentionIds = validMentions.map((membership) => membership.accountId).filter((accountId) => accountId !== authorAccount?.id)
        if (validMentionIds.length) {
          await prisma.commentMention.createMany({ data: validMentionIds.map((mentionedAccountId) => ({ commentId: comment.id, mentionedAccountId })), skipDuplicates: true })
          for (const mentionedAccountId of validMentionIds) {
            await createNotification({ workspaceId: workspace.id, recipientAccountId: mentionedAccountId, actorAccountId: authorAccount?.id ?? null, projectId: task.projectId, taskId, type: 'comment.mentioned', title: 'You were mentioned in a task comment', body: task.title, data: { commentId: comment.id, taskTitle: task.title } })
          }
        }
      }
      return { ok: true, commentId: comment.id }
    })

    app.post('/tasks/reorder', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const body = request.body as { taskId: string; targetStatusId: string; orderedTaskIds: string[] }
      if (!body.taskId || !body.targetStatusId || !Array.isArray(body.orderedTaskIds)) return reply.code(400).send({ ok: false, error: 'Invalid reorder payload' })
      const task = await prisma.task.findFirst({ where: { id: body.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.targetStatusId, projectId: task.projectId } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found' })
      const tasks = await prisma.task.findMany({ where: { id: { in: body.orderedTaskIds }, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, select: { id: true, projectId: true, owner: true, assignee: true, participants: { select: { participant: true } }, collaborators: { select: { collaborator: true } } } })
      if (tasks.length !== body.orderedTaskIds.length) return reply.code(400).send({ ok: false, error: 'One or more tasks in ordered list were not found' })
      if (tasks.some((item) => item.projectId !== task.projectId)) return reply.code(400).send({ ok: false, error: 'Ordered tasks must belong to the same project' })
      if (tasks.some((item) => !canAccessTaskAssignee(taskScope, item.assignee, item.collaborators.map((entry) => entry.collaborator), item.owner, item.participants.map((entry) => entry.participant)))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      await prisma.$transaction(async (tx) => {
        await tx.task.update({ where: { id: body.taskId }, data: { statusId: targetStatus.id } })
        for (const [index, id] of body.orderedTaskIds.entries()) await tx.task.update({ where: { id }, data: { statusId: targetStatus.id, position: index } })
      })
      return { ok: true }
    })

    app.post('/projects/:projectId/tasks/reorder', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { orderedTaskIds: string[] }
      if (!Array.isArray(body.orderedTaskIds) || body.orderedTaskIds.length === 0) return reply.code(400).send({ ok: false, error: 'orderedTaskIds is required' })
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, archivedAt: null } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, projectId)
      const tasks = await prisma.task.findMany({ where: { id: { in: body.orderedTaskIds }, projectId, archivedAt: null }, select: { id: true, owner: true, assignee: true, participants: { select: { participant: true } }, collaborators: { select: { collaborator: true } } } })
      if (tasks.length !== body.orderedTaskIds.length) return reply.code(400).send({ ok: false, error: 'One or more tasks in ordered list were not found in this project' })
      if (tasks.some((item) => !canAccessTaskAssignee(taskScope, item.assignee, item.collaborators.map((entry) => entry.collaborator), item.owner, item.participants.map((entry) => entry.participant)))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      await prisma.$transaction(async (tx) => {
        for (const [index, id] of body.orderedTaskIds.entries()) await tx.task.update({ where: { id }, data: { position: index } })
      })
      await logActivity({ workspaceId: workspace.id, projectId, ...actorFromRequest(request), type: 'tasks.reordered', summary: `Updated project task order for ${project.name}.`, payload: { orderedTaskIds: body.orderedTaskIds } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/move', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const params = request.params as { taskId: string }
      const body = request.body as { targetStatus: string }
      const task = await prisma.task.findFirst({ where: { id: params.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { collaborators: true, participants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee, task.collaborators.map((item) => item.collaborator), task.owner, task.participants.map((item) => item.participant))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: task.projectId, name: body.targetStatus } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found' })
      await prisma.task.update({ where: { id: params.taskId }, data: { statusId: targetStatus.id } })
      return { ok: true }
    })

    await syncConfiguredSuperadmin()
    void processPendingNotificationDeliveries().catch((err) => app.log.error(err))
    setInterval(() => {
      void processPendingNotificationDeliveries().catch((err) => app.log.error(err))
    }, 60_000)
    await app.listen({ port: 4000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
