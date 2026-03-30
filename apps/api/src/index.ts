import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient, TaskStatusType, TaskPriority, WorkspaceRole, PlatformRole } from '@prisma/client'
import { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { hasExactTodoOrder, normalizeTaskLabels, normalizeTaskTodoTexts } from './task-helpers.js'
import { serveProfileImage, saveProfileImage } from './profile-images.js'
import { cleanupRemovedDescriptionImages, saveTaskImage, serveTaskImage } from './task-description-images.js'
import { sendEmailChangeConfirmationEmail, sendInviteEmail, sendNotificationEmail, sendPasswordResetEmail } from './mailer.js'
import { appBuildTime, appGitSha, appVersion } from './version.js'

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

const prisma = new PrismaClient()
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

function generateApiKeyToken() {
  return `atpm_${crypto.randomBytes(24).toString('base64url')}`
}

function generateMcpKeyToken() {
  return `sallymcp_${crypto.randomBytes(24).toString('base64url')}`
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
      ;(request as any).account = session.account
      ;(request as any).session = session
      return true
    }
    const apiKey = await prisma.accountApiKey.findFirst({
      where: { tokenHash: hashApiToken(token), revokedAt: null },
      include: { account: true },
    })
    if (apiKey) {
      await prisma.accountApiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      ;(request as any).account = apiKey.account
      ;(request as any).apiKey = { id: apiKey.id, label: apiKey.label }
      return true
    }
    const mcpKey = await prisma.accountMcpKey.findFirst({
      where: { tokenHash: hashApiToken(token), revokedAt: null },
      include: { account: true, workspace: true },
    })
    if (mcpKey) {
      await prisma.accountMcpKey.update({ where: { id: mcpKey.id }, data: { lastUsedAt: new Date() } })
      ;(request as any).account = mcpKey.account
      ;(request as any).mcpKey = { id: mcpKey.id, label: mcpKey.label, workspaceId: mcpKey.workspaceId, workspaceSlug: mcpKey.workspace?.slug ?? null }
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
    if ((workspaceId && String(workspaceId) !== mcpKey.workspaceId) || (workspaceSlug && String(workspaceSlug) !== restrictedWorkspace.slug)) {
      reply.code(403).send({ ok: false, error: 'Workspace access denied by MCP key restriction' })
      return null
    }
    return restrictedWorkspace
  }
  let workspace = null

  if (account) {
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
    ;(request as any).membership = membership
    return membership.workspace
  }

  if (workspaceId) {
    workspace = await prisma.workspace.findUnique({ where: { id: String(workspaceId) } })
  } else if (workspaceSlug) {
    workspace = await prisma.workspace.findUnique({ where: { slug: String(workspaceSlug) } })
  } else {
    const count = await prisma.workspace.count()
    if (count === 1) {
      workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } })
    } else {
      reply.code(400).send({ ok: false, error: 'workspace selector required' })
      return null
    }
  }
  if (!workspace) {
    reply.code(404).send({ ok: false, error: 'Workspace not found' })
    return null
  }
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

async function requireWorkspaceRole(request: any, reply: any, roles: WorkspaceRole[]) {
  const account = (request as any).account as { id: string } | undefined
  if (!account) return true
  if (isSuperadmin(request)) return true
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
  if (!account) return true
  if (isSuperadmin(request)) return true
  const membership = await prisma.workspaceMembership.findFirst({ where: { workspaceId, accountId: account.id }, include: { workspace: true } })
  if (!membership) {
    reply.code(403).send({ ok: false, error: 'Workspace access denied' })
    return false
  }
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
  if (isSuperadmin(request)) return true
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
  if (isSuperadmin(request)) return null as string[] | null
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
  if (isSuperadmin(request) || workspaceMembership?.role === WorkspaceRole.OWNER) {
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
  return { assignee: { in: scope.allowedAssignees } }
}

function canAccessTaskAssignee(scope: { restricted: boolean; allowedAssignees: string[] }, assignee?: string | null) {
  if (!scope.restricted) return true
  if (!assignee) return false
  return scope.allowedAssignees.includes(assignee)
}

async function logActivity(input: { workspaceId: string; projectId?: string | null; taskId?: string | null; actorName?: string | null; actorEmail?: string | null; actorApiKeyLabel?: string | null; type: string; summary: string; payload?: any }) {
  const payload = input.actorApiKeyLabel
    ? { ...(input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {}), actorApiKeyLabel: input.actorApiKeyLabel }
    : input.payload
  await prisma.activityLog.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId ?? null, taskId: input.taskId ?? null, actorName: input.actorName ?? null, actorEmail: input.actorEmail ?? null, type: input.type, summary: input.summary, payload: payload ?? undefined } })
}

function actorFromRequest(request: any) {
  const account = (request as any).account as { name?: string | null; email?: string | null } | undefined
  const apiKey = (request as any).apiKey as { label?: string | null } | undefined
  return { actorName: account?.name ?? null, actorEmail: account?.email ?? null, actorApiKeyLabel: apiKey?.label ?? null }
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
  const workspaceMembership = (request as any).membership as { role: WorkspaceRole } | undefined
  if (isSuperadmin(request) || workspaceMembership?.role === WorkspaceRole.OWNER) return { elevated: true, userId: null as string | null }
  if (projectId) {
    const projectMembership = await prisma.projectMembership.findFirst({ where: { projectId, accountId: account.id } })
    if (projectMembership?.role === PROJECT_ROLE.OWNER) return { elevated: true, userId: null as string | null }
  }
  const user = await ensureTimesheetUser(workspaceId, account)
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
    include: { tasks: { where: { archivedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { labels: { include: { label: true } }, todos: true } } },
  })

  const projectIds = Array.from(new Set(statuses.map((status) => status.projectId)))
  const taskScopes = new Map<string, { restricted: boolean; allowedAssignees: string[] }>()
  for (const id of projectIds) taskScopes.set(id, await getTaskAccessScope(request, id))
  const assigneeAvatars = await getAssigneeAvatarMap(workspaceId, statuses.flatMap((status) => status.tasks.map((task) => task.assignee)))

  return statuses.map((status) => ({
    id: status.id,
    title: status.name,
    type: status.type,
    cards: status.tasks
      .filter((task) => canAccessTaskAssignee(taskScopes.get(status.projectId) || { restricted: false, allowedAssignees: [] }, task.assignee))
      .map((task) => ({
        id: task.id,
        title: task.title,
        meta: `${task.assignee ?? 'Unassigned'} · ${task.priority}`,
        description: task.description ?? 'No description yet.',
        assignee: task.assignee ?? 'Unassigned',
        assigneeAvatarUrl: task.assignee ? assigneeAvatars.get(task.assignee) ?? null : null,
        priority: task.priority,
        status: status.name,
        statusId: status.id,
        dueDate: task.dueDate?.toISOString() ?? null,
        labels: task.labels.map((l) => l.label.name),
        todoProgress: task.todos.length ? `${task.todos.filter((t) => t.done).length}/${task.todos.length}` : null,
      })), 
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
  { name: 'project.status.create', description: 'Create a project status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, name: { type: 'string' } }, required: ['projectId', 'name'], additionalProperties: false } },
  { name: 'project.status.update', description: 'Update a project status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, statusId: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'project.status.delete', description: 'Delete a project status, optionally moving tasks to a replacement status.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, statusId: { type: 'string' }, targetStatusId: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'workspace.invite', description: 'Invite a user into a workspace.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } }, required: ['email', 'role'], additionalProperties: false } },
  { name: 'project.member.list', description: 'List project members.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.member.add', description: 'Add a member to a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, accountId: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } }, required: ['projectId', 'role'], additionalProperties: false } },
  { name: 'project.member.update', description: 'Update a project member role.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, membershipId: { type: 'string' }, role: { type: 'string' } }, required: ['projectId', 'membershipId', 'role'], additionalProperties: false } },
  { name: 'project.member.remove', description: 'Remove a member from a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, membershipId: { type: 'string' } }, required: ['projectId', 'membershipId'], additionalProperties: false } },
  { name: 'task.list', description: 'List tasks for a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, status: { type: 'string' }, assignee: { type: 'string' }, search: { type: 'string' }, label: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'task.get', description: 'Get full task details.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.create', description: 'Create a task in a project.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, projectId: { type: 'string' }, title: { type: 'string' }, assignee: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' }, status: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: ['string','null'] }, labels: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } }, required: ['projectId', 'title'], additionalProperties: false } },
  { name: 'task.update', description: 'Update a task.', inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' }, workspaceSlug: { type: 'string' }, taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' }, priority: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: ['string','null'] } }, required: ['taskId'], additionalProperties: false } },
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
  await prisma.accountMcpKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  ;(request as any).account = key.account
  ;(request as any).mcpKey = { id: key.id, label: key.label, workspaceId: key.workspaceId, workspaceSlug: key.workspace?.slug ?? null }
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
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: request.account.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
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
      return await injectJson(request, { method: 'POST', url: '/tasks', args, payload: { projectId: args.projectId, title: args.title, assignee: args.assignee, description: args.description, priority: args.priority, status: args.status, statusId: args.statusId, dueDate: args.dueDate, labels: args.labels, todos: args.todos } })
    case 'task.update':
      return await injectJson(request, { method: 'PATCH', url: `/tasks/${args.taskId}`, args, payload: { title: args.title, description: args.description, assignee: args.assignee, priority: args.priority, statusId: args.statusId, dueDate: args.dueDate } })
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
      if (url.startsWith('/health') || url.startsWith('/mcp') || url.startsWith('/uploads/task-images/') || url.startsWith('/uploads/profile-images/')) return
      if (url.startsWith('/auth/login') || url.startsWith('/auth/accept-invite') || url.startsWith('/auth/request-password-reset') || url.startsWith('/auth/reset-password')) return
      if (!(await ensureAuth(request, reply))) return
      if (url.startsWith('/accounts') || url.startsWith('/workspaces') || url.startsWith('/auth')) return
      const workspace = await resolveWorkspace(request, reply)
      if (!workspace) return
      ;(request as any).workspace = workspace
    })

    app.get('/health', async () => ({ ok: true, service: 'api', timestamp: new Date().toISOString() }))

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
      if (!account || !effectivePasswordHash) return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
      const valid = await verifyPassword(password, effectivePasswordHash)
      if (!valid) return reply.code(401).send({ ok: false, error: 'Invalid credentials' })
      const sessionToken = generateSessionToken()
      const session = await prisma.accountSession.create({ data: { accountId: account.id, token: sessionToken, expiresAt: getSessionExpiry() } })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, role: membership.role })),
      }
    })

    app.post('/auth/logout', async (request, reply) => {
      const session = (request as any).session as { id: string } | undefined
      if (!session) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      await prisma.accountSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      return { ok: true }
    })

    app.get('/auth/me', async (request, reply) => {
      const account = (request as any).account as { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: PlatformRole | null } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, role: membership.role })),
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
      if (!isSuperadmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
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
      return keys.map((key) => ({ id: key.id, label: key.label, prefix: key.prefix, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null }))
    })

    app.post('/auth/api-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { label?: string }
      const label = body.label?.trim()
      if (!label) return reply.code(400).send({ ok: false, error: 'label is required' })
      const token = generateApiKeyToken()
      const created = await prisma.accountApiKey.create({
        data: {
          accountId: account.id,
          label,
          prefix: token.slice(0, 12),
          tokenHash: hashApiToken(token),
        },
      })
      return { ok: true, apiKeyId: created.id, token, key: token, prefix: created.prefix }
    })

    app.delete('/auth/api-keys/:apiKeyId', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const { apiKeyId } = request.params as { apiKeyId: string }
      const apiKey = await prisma.accountApiKey.findFirst({ where: { id: apiKeyId, accountId: account.id } })
      if (!apiKey) return reply.code(404).send({ ok: false, error: 'API key not found' })
      if (apiKey.revokedAt) {
        await prisma.accountApiKey.delete({ where: { id: apiKey.id } })
        return { ok: true, deleted: true }
      }
      await prisma.accountApiKey.update({ where: { id: apiKey.id }, data: { revokedAt: new Date() } })
      return { ok: true, revoked: true }
    })

    app.get('/auth/mcp-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const keys = await prisma.accountMcpKey.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'desc' } })
      return keys.map((key) => ({ id: key.id, label: key.label, prefix: key.prefix, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null, workspaceId: key.workspaceId, workspaceSlug: key.workspace?.slug ?? null, workspaceName: key.workspace?.name ?? null }))
    })

    app.post('/auth/mcp-keys', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const body = request.body as { label?: string; workspaceId?: string | null }
      const label = body.label?.trim()
      if (!label) return reply.code(400).send({ ok: false, error: 'label is required' })
      let workspaceId: string | null = null
      if (body.workspaceId) {
        const membership = await prisma.workspaceMembership.findFirst({ where: { accountId: account.id, workspaceId: body.workspaceId }, include: { workspace: true } })
        if (!membership) return reply.code(403).send({ ok: false, error: 'Workspace access denied' })
        workspaceId = membership.workspaceId
      }
      const token = generateMcpKeyToken()
      const created = await prisma.accountMcpKey.create({ data: { accountId: account.id, workspaceId, label, prefix: token.slice(0, 16), tokenHash: hashApiToken(token) }, include: { workspace: true } })
      return { ok: true, mcpKeyId: created.id, token, key: token, prefix: created.prefix, workspaceId: created.workspaceId, workspaceSlug: created.workspace?.slug ?? null }
    })

    app.delete('/auth/mcp-keys/:mcpKeyId', async (request, reply) => {
      const account = (request as any).account as { id: string } | undefined
      if (!account) return reply.code(401).send({ ok: false, error: 'Unauthorized' })
      const { mcpKeyId } = request.params as { mcpKeyId: string }
      const mcpKey = await prisma.accountMcpKey.findFirst({ where: { id: mcpKeyId, accountId: account.id } })
      if (!mcpKey) return reply.code(404).send({ ok: false, error: 'MCP key not found' })
      if (mcpKey.revokedAt) {
        await prisma.accountMcpKey.delete({ where: { id: mcpKey.id } })
        return { ok: true, deleted: true }
      }
      await prisma.accountMcpKey.update({ where: { id: mcpKey.id }, data: { revokedAt: new Date() } })
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
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, role: membership.role })),
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
      const memberships = await prisma.workspaceMembership.findMany({ where: { accountId: account.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } })
      return {
        ok: true,
        sessionToken,
        expiresAt: session.expiresAt.toISOString(),
        account: { id: account.id, name: account.name, email: account.email, avatarUrl: account.avatarUrl, platformRole: account.platformRole },
        memberships: memberships.map((membership) => ({ id: membership.id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, role: membership.role })),
      }
    })

    app.get('/workspaces', async (request) => {
      const account = (request as any).account as { id: string } | undefined
      const workspaces = isSuperadmin(request)
        ? await prisma.workspace.findMany({ orderBy: { createdAt: 'asc' } })
        : await prisma.workspace.findMany({ where: account ? { memberships: { some: { accountId: account.id } } } : undefined, orderBy: { createdAt: 'asc' } })
      return workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt.toISOString(),
      }))
    })

    app.post('/workspaces', async (request, reply) => {
      if (!isSuperadmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
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
      return { ok: true, workspaceId: workspace.id }
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
      if (existingCount > 0 && !isSuperadmin(request)) return reply.code(403).send({ ok: false, error: 'Insufficient permissions' })
      const body = request.body as { name?: string; email: string }
      const email = body.email?.trim().toLowerCase()
      if (!email) return reply.code(400).send({ ok: false, error: 'email is required' })
      const existing = await prisma.account.findFirst({ where: { email } })
      if (existing) return { ok: true, accountId: existing.id, existing: true }
      const account = await prisma.account.create({ data: { email, name: body.name?.trim() || null, platformRole: await getInitialPlatformRole(email) } })
      await syncConfiguredSuperadmin()
      return { ok: true, accountId: account.id }
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
      if (!isSuperadmin(request)) {
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
        if (!isSuperadmin(request)) {
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
      if (!isSuperadmin(request)) {
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
      if (!isSuperadmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
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
        if (!isSuperadmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
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
      if (!isSuperadmin(request) && workspaceMembership?.role !== WorkspaceRole.OWNER) {
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
        prisma.task.count({ where: { archivedAt: null, project: projectWhere, status: { type: { in: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW'] } } } }),
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
        return { id: project.id, name: project.name, client: project.client ? { id: project.client.id, name: project.client.name } : null, lead: project.tasks[0]?.assignee ?? 'Unassigned', tasks: project.tasks.length, status: reviewCount > 0 ? 'Review' : 'Active', archivedAt: project.archivedAt?.toISOString() ?? null }
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

    app.get('/projects/:projectId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { archived?: string }
      const archivedFilter = query.archived === 'true'
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }) }, include: { client: true, tasks: { where: { archivedAt: null }, include: { status: true, labels: { include: { label: true } }, todos: true }, orderBy: [{ createdAt: 'asc' }] }, statuses: { orderBy: [{ position: 'asc' }] }, labels: { orderBy: [{ name: 'asc' }] }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 12 } } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, projectId)
      const visibleTasks = project.tasks.filter((task) => canAccessTaskAssignee(taskScope, task.assignee))
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, visibleTasks.map((task) => task.assignee))
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
        taskCount: visibleTasks.length,
        openTasks,
        reviewTasks,
        statuses: project.statuses.map((s) => ({ id: s.id, name: s.name, type: s.type, position: s.position, color: s.color, taskCount: statusTaskCounts.get(s.id) ?? 0 })),
        labels: project.labels.map((l) => ({ id: l.id, name: l.name })),
        timesheetSummary: summarizeTimesheets(visibleTimesheets),
        timesheetUsers: Array.from(new Map(visibleTimesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()),
        recentTimesheets: visibleTimesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })),
        recentTasks: visibleTasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, assignee: t.assignee ?? 'Unassigned', assigneeAvatarUrl: t.assignee ? assigneeAvatars.get(t.assignee) ?? null : null, priority: t.priority, status: t.status.name, statusId: t.statusId, statusColor: t.status.color, dueDate: t.dueDate?.toISOString() ?? null, labels: t.labels.map((l) => l.label.name), todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null })),
      }
    })

    app.get('/projects/:projectId/tasks', async (request, reply) => {
      const workspace = (request as any).workspace
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { status?: string; assignee?: string; search?: string; label?: string; archived?: string }
      const archivedFilter = query.archived === 'true'
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id, ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }) } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, projectId)
      const tasks = await prisma.task.findMany({
        where: {
          projectId,
          ...(archivedFilter ? { archivedAt: { not: null } } : { archivedAt: null }),
          ...taskVisibilityWhere(taskScope),
          ...(query.assignee ? { assignee: { contains: query.assignee, mode: 'insensitive' } } : {}),
          ...(query.search ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] } : {}),
          ...(query.status ? { status: { name: query.status } } : {}),
          ...(query.label ? { labels: { some: { label: { name: query.label } } } } : {}),
        },
        include: { status: true, labels: { include: { label: true } }, todos: true },
        orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
      })
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, tasks.map((t) => t.assignee))
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        assignee: t.assignee ?? 'Unassigned',
        assigneeAvatarUrl: t.assignee ? assigneeAvatars.get(t.assignee) ?? null : null,
        priority: t.priority,
        status: t.status.name,
        statusId: t.statusId,
        statusColor: t.status.color,
        dueDate: t.dueDate?.toISOString() ?? null,
        labels: t.labels.map((l) => l.label.name),
        todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null,
        archivedAt: t.archivedAt?.toISOString() ?? null,
      }))
    })

    app.get('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, include: { project: { include: { client: true } }, status: true, comments: { orderBy: { createdAt: 'asc' } }, labels: { include: { label: true } }, todos: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 20 } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const assigneeAvatars = await getAssigneeAvatarMap(workspace.id, [task.assignee])
      const commentAvatars = await getAssigneeAvatarMap(workspace.id, task.comments.map((comment) => comment.author))
      const timesheetScope = await resolveTimesheetScope(request, workspace.id, task.projectId)
      const visibleTimesheets = timesheetScope.elevated || !timesheetScope.userId ? task.timesheets : task.timesheets.filter((entry) => entry.userId === timesheetScope.userId)
      return { id: task.id, title: task.title, description: task.description ?? 'No description yet.', assignee: task.assignee ?? 'Unassigned', assigneeAvatarUrl: task.assignee ? assigneeAvatars.get(task.assignee) ?? null : null, priority: task.priority, status: task.status.name, statusId: task.statusId, dueDate: task.dueDate?.toISOString() ?? null, labels: task.labels.map((l) => l.label.name), todos: task.todos.map((t) => ({ id: t.id, text: t.text, done: t.done, position: t.position })), timesheetSummary: summarizeTimesheets(visibleTimesheets), timesheetUsers: Array.from(new Map(visibleTimesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()), timesheets: visibleTimesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: task.project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })), project: { id: task.project.id, name: task.project.name, client: task.project.client ? { id: task.project.client.id, name: task.project.client.name } : null }, comments: task.comments.map((c) => ({ id: c.id, author: c.author, authorAvatarUrl: commentAvatars.get(c.author) ?? null, body: c.body, createdAt: c.createdAt })) }
    })

    app.post('/tasks/:taskId/todos', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { text: string }
      const text = body.text?.trim()
      if (!text) return reply.code(400).send({ ok: false, error: 'text is required' })
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
        details: event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) && Array.isArray((event.payload as Record<string, unknown>).details)
          ? ((event.payload as Record<string, unknown>).details as unknown[]).filter((value): value is string => typeof value === 'string')
          : [],
        createdAt: event.createdAt.toISOString(),
      }))
    })

    app.post('/projects/:projectId/statuses', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const maxPos = await prisma.taskStatus.aggregate({ where: { projectId }, _max: { position: true } })
      const status = await prisma.taskStatus.create({ data: { projectId, name, type: 'TODO', position: (maxPos._max.position ?? -1) + 1, color: '#1F2937' } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.created', summary: `Created status ${name}.`, payload: { statusId: status.id, name } })
      return { ok: true, statusId: status.id }
    })

    app.patch('/projects/:projectId/statuses/:statusId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { projectId, statusId } = request.params as { projectId: string; statusId: string }
      const body = request.body as { name?: string; color?: string }
      const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId, project: { workspaceId: workspace.id } } })
      if (!status) return reply.code(404).send({ ok: false, error: 'Status not found' })
      if (!(await requireProjectRole(request, reply, projectId, [PROJECT_ROLE.OWNER]))) return
      const nextName = body.name !== undefined ? body.name.trim() : status.name
      const nextColor = body.color !== undefined ? (body.color.trim() || '#1F2937') : status.color
      const details: string[] = []
      if (nextName !== status.name) details.push(activityChange('name', status.name, nextName))
      if ((nextColor || null) !== (status.color || null)) details.push(activityChange('color', status.color, nextColor))
      await prisma.taskStatus.update({ where: { id: statusId }, data: { ...(body.name !== undefined ? { name: nextName } : {}), ...(body.color !== undefined ? { color: nextColor } : {}) } })
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'status.updated', summary: `Updated status ${status.name}.`, payload: { statusId, name: body.name, color: body.color, details } })
      return { ok: true }
    })

    app.post('/projects/:projectId/statuses/:statusId/delete', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
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
      if (status.id === statuses[0]?.id) return reply.code(400).send({ ok: false, error: 'Cannot delete the default status' })
      if (statuses.length <= 1) return reply.code(400).send({ ok: false, error: 'Cannot delete the last status' })
      const taskCount = await prisma.task.count({ where: { statusId } })
      const fallbackTarget = statuses.find((s) => s.id !== statusId)
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
      await logActivity({ workspaceId: workspace.id, projectId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'project.updated', summary: `Updated project ${project.name}.`, payload: { projectId, details } })
      return { ok: true }
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
            { name: 'Review', type: 'REVIEW', position: 2, color: '#422006' },
            { name: 'Done', type: 'DONE', position: 3, color: '#14532D' },
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
      const body = request.body as { projectId: string; title: string; assignee?: string; description?: string; priority?: TaskPriority; status?: string; statusId?: string; dueDate?: string | null; labels?: string[]; todos?: { text: string }[] }
      if (!body.projectId || !body.title?.trim()) return reply.code(400).send({ ok: false, error: 'projectId and title are required' })
      const project = await prisma.project.findFirst({ where: { id: body.projectId, workspaceId: workspace.id } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (!(await requireProjectRole(request, reply, body.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      let targetStatus = null
      if (body.statusId) targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.statusId, projectId: body.projectId } })
      if (!targetStatus && body.status) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId, name: body.status } })
      if (!targetStatus) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId }, orderBy: { position: 'asc' } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found for project' })
      const count = await prisma.task.count({ where: { statusId: targetStatus.id } })
      const labels = normalizeTaskLabels(body.labels)
      const todos = normalizeTaskTodoTexts(body.todos)
      const defaultAssignee = body.assignee?.trim() || (((request as any).account as { email?: string } | undefined)?.email ?? null)
      if (defaultAssignee) {
        const allowedAssignee = await ensureProjectMembershipForAssignee(workspace.id, body.projectId, defaultAssignee)
        if (!allowedAssignee) return reply.code(400).send({ ok: false, error: 'Assignee must already be a member of this project' })
      }
      const task = await prisma.$transaction(async (tx) => {
        const createdTask = await tx.task.create({ data: { projectId: body.projectId, statusId: targetStatus.id, title: body.title.trim(), description: body.description?.trim() || null, assignee: defaultAssignee, priority: body.priority ?? 'P2', dueDate: toIsoOrNull(body.dueDate), position: count } })
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
      await ensureProjectMembershipForAssignee(workspace.id, task.projectId, task.assignee)
      await notifyTaskAssignment({ workspaceId: workspace.id, projectId: task.projectId, taskId: task.id, taskTitle: task.title, assignee: task.assignee, actorAccountId: ((request as any).account as { id: string } | undefined)?.id ?? null })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId: task.id, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: 'task.created', summary: `Created task ${task.title}.`, payload: { taskId: task.id } })
      return { ok: true, taskId: task.id }
    })

    app.patch('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const params = request.params as { taskId: string }
      const body = request.body as { title?: string; description?: string; assignee?: string; priority?: TaskPriority; dueDate?: string | null; statusId?: string }
      const existing = await prisma.task.findFirst({ where: { id: params.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, existing.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, existing.projectId)
      if (!canAccessTaskAssignee(taskScope, existing.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const currentStatus = await prisma.taskStatus.findFirst({ where: { id: existing.statusId }, select: { id: true, name: true } })
      let targetStatusName: string | null = null
      if (body.statusId) {
        const targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.statusId, projectId: existing.projectId } })
        if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found for task project' })
        targetStatusName = targetStatus.name
      }
      const nextTitle = body.title !== undefined ? body.title : existing.title
      const nextDescription = body.description !== undefined ? body.description : existing.description
      const nextAssignee = body.assignee !== undefined ? body.assignee : existing.assignee
      const nextPriority = body.priority !== undefined ? body.priority : existing.priority
      const nextDueDate = body.dueDate !== undefined ? toIsoOrNull(body.dueDate) : existing.dueDate
      const nextStatusId = body.statusId !== undefined ? body.statusId : existing.statusId
      const details: string[] = []
      if (nextTitle !== existing.title) details.push(activityChange('title', existing.title, nextTitle))
      if ((nextDescription || null) !== (existing.description || null)) details.push('description changed')
      if ((nextAssignee || null) !== (existing.assignee || null)) details.push(activityChange('assignee', existing.assignee, nextAssignee))
      if (nextPriority !== existing.priority) details.push(activityChange('priority', existing.priority, nextPriority))
      if ((nextDueDate || null)?.toString() !== (existing.dueDate || null)?.toString()) details.push(activityChange('due date', existing.dueDate, nextDueDate))
      if (nextStatusId !== existing.statusId) details.push(activityChange('status', currentStatus?.name || existing.statusId, targetStatusName || nextStatusId))
      if (nextAssignee) {
        const allowedAssignee = await ensureProjectMembershipForAssignee(workspace.id, existing.projectId, nextAssignee)
        if (!allowedAssignee) return reply.code(400).send({ ok: false, error: 'Assignee must already be a member of this project' })
      }
      await prisma.task.update({ where: { id: params.taskId }, data: { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.assignee !== undefined ? { assignee: body.assignee } : {}), ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.dueDate !== undefined ? { dueDate: toIsoOrNull(body.dueDate) } : {}), ...(body.statusId !== undefined ? { statusId: body.statusId } : {}) } })
      if (nextAssignee !== existing.assignee) {
        await ensureProjectMembershipForAssignee(workspace.id, existing.projectId, nextAssignee)
        await notifyTaskAssignment({ workspaceId: workspace.id, projectId: existing.projectId, taskId: existing.id, taskTitle: nextTitle, assignee: nextAssignee, actorAccountId: ((request as any).account as { id: string } | undefined)?.id ?? null })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: workspace.id } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const archived = body.archived !== false
      await prisma.task.update({ where: { id: taskId }, data: { archivedAt: archived ? new Date() : null } })
      await logActivity({ workspaceId: workspace.id, projectId: task.projectId, taskId, actorName: actorFromRequest(request).actorName, actorEmail: actorFromRequest(request).actorEmail, actorApiKeyLabel: actorFromRequest(request).actorApiKeyLabel, type: archived ? 'task.archived' : 'task.unarchived', summary: `${archived ? 'Archived' : 'Unarchived'} task ${task.title}.`, payload: { taskId } })
      return { ok: true }
    })

    app.delete('/tasks/:taskId', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER]))) return
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      await prisma.task.delete({ where: { id: taskId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/image-upload', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: taskId, project: { workspaceId: workspace.id } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      let userId = body.userId
      if (!scope.elevated) {
        if (!scope.userId) return reply.code(403).send({ ok: false, error: 'Timesheet user unavailable' })
        userId = scope.userId
      }
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
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
      const task = await prisma.task.findFirst({ where: { id: body.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      const targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.targetStatusId, projectId: task.projectId } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found' })
      const tasks = await prisma.task.findMany({ where: { id: { in: body.orderedTaskIds }, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } }, select: { id: true, projectId: true, assignee: true } })
      if (tasks.length !== body.orderedTaskIds.length) return reply.code(400).send({ ok: false, error: 'One or more tasks in ordered list were not found' })
      if (tasks.some((item) => item.projectId !== task.projectId)) return reply.code(400).send({ ok: false, error: 'Ordered tasks must belong to the same project' })
      if (tasks.some((item) => !canAccessTaskAssignee(taskScope, item.assignee))) return reply.code(403).send({ ok: false, error: 'Task access denied' })
      await prisma.$transaction(async (tx) => {
        await tx.task.update({ where: { id: body.taskId }, data: { statusId: targetStatus.id } })
        for (const [index, id] of body.orderedTaskIds.entries()) await tx.task.update({ where: { id }, data: { statusId: targetStatus.id, position: index } })
      })
      return { ok: true }
    })

    app.post('/tasks/:taskId/move', async (request, reply) => {
      const workspace = (request as any).workspace
      if (!(await requireWorkspaceRole(request, reply, [WorkspaceRole.OWNER, WorkspaceRole.MEMBER]))) return
      const params = request.params as { taskId: string }
      const body = request.body as { targetStatus: string }
      const task = await prisma.task.findFirst({ where: { id: params.taskId, archivedAt: null, project: { workspaceId: workspace.id, archivedAt: null } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!(await requireProjectRole(request, reply, task.projectId, [PROJECT_ROLE.OWNER, PROJECT_ROLE.MEMBER]))) return
      const taskScope = await getTaskAccessScope(request, task.projectId)
      if (!canAccessTaskAssignee(taskScope, task.assignee)) return reply.code(403).send({ ok: false, error: 'Task access denied' })
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
