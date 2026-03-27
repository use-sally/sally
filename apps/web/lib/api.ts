import type { BoardColumn, Client, ClientDetail, Health, McpKey, MentionableUser, Notification, NotificationPreference, Project, ProjectDetail, ProjectMember, ProjectsSummary, ProjectTaskListItem, TaskDetail, TimesheetEntry, TimesheetReport, TimesheetSummary, TimesheetUser, WorkspaceInfo, WorkspaceMember } from '@sally/types/src'
import { getSessionToken, getWorkspaceId } from './auth'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN
const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID
const WORKSPACE_SLUG = process.env.NEXT_PUBLIC_WORKSPACE_SLUG

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  const sessionToken = getSessionToken()
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`
  else if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`
  const workspaceId = getWorkspaceId()
  if (workspaceId) headers['x-workspace-id'] = workspaceId
  else if (WORKSPACE_ID) headers['x-workspace-id'] = WORKSPACE_ID
  else if (WORKSPACE_SLUG) headers['x-workspace-slug'] = WORKSPACE_SLUG
  if (init?.body !== undefined && init.body !== null) headers['Content-Type'] = 'application/json'
  const initHeaders = init?.headers ? Object.fromEntries(new Headers(init.headers as HeadersInit)) : {}
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { ...headers, ...initHeaders },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (detail) {
      let message = detail
      try {
        const parsed = JSON.parse(detail) as { error?: string; message?: string }
        message = parsed.error || parsed.message || detail
      } catch {}
      throw new Error(message)
    }
    throw new Error(`Failed to fetch ${path} (${res.status})`)
  }
  return res.json()
}

export function getHealth(): Promise<Health> { return getJson('/health') }
export function getNotifications(params?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
  const search = new URLSearchParams()
  if (params?.unreadOnly) search.set('unreadOnly', 'true')
  if (params?.limit) search.set('limit', String(params.limit))
  const q = search.toString()
  return getJson(`/notifications${q ? `?${q}` : ''}`)
}
export function readNotification(notificationId: string): Promise<{ ok: boolean }> { return getJson(`/notifications/${notificationId}/read`, { method: 'POST', body: JSON.stringify({}) }) }
export function readAllNotifications(): Promise<{ ok: boolean }> { return getJson('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }) }
export function getNotificationPreferences(): Promise<NotificationPreference[]> { return getJson('/notifications/preferences') }
export function updateNotificationPreferences(preferences: NotificationPreference[]): Promise<{ ok: boolean }> { return getJson('/notifications/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }) }
export function getProjectsSummary(): Promise<ProjectsSummary> { return getJson('/projects/summary') }
export function getProjects(filters?: { archived?: boolean }): Promise<Project[]> {
  const params = new URLSearchParams()
  if (filters?.archived) params.set('archived', 'true')
  const q = params.toString()
  return getJson(`/projects${q ? `?${q}` : ''}`)
}
export function getProject(projectId: string, options?: { archived?: boolean }): Promise<ProjectDetail> {
  const params = new URLSearchParams()
  if (options?.archived) params.set('archived', 'true')
  const q = params.toString()
  return getJson(`/projects/${projectId}${q ? `?${q}` : ''}`)
}
export function updateProject(projectId: string, payload: { name?: string; description?: string; clientId?: string | null }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function archiveProject(projectId: string, archived = true): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }) }
export function deleteProject(projectId: string): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}`, { method: 'DELETE' }) }
export function getProjectMembers(projectId: string): Promise<ProjectMember[]> { return getJson(`/projects/${projectId}/members`) }
export function getProjectActivity(projectId: string): Promise<{ id: string; type: string; summary: string; actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null; details: string[]; createdAt: string }[]> { return getJson(`/projects/${projectId}/activity`) }
export function addProjectMember(projectId: string, payload: { accountId?: string; email?: string; name?: string; role?: string }): Promise<{ ok: boolean; membershipId: string; existing?: boolean }> {
  return getJson(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(payload) })
}
export function updateProjectMember(projectId: string, membershipId: string, payload: { role?: string }): Promise<{ ok: boolean }> {
  return getJson(`/projects/${projectId}/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function removeProjectMember(projectId: string, membershipId: string): Promise<{ ok: boolean }> {
  return getJson(`/projects/${projectId}/members/${membershipId}`, { method: 'DELETE' })
}
export function getClients(): Promise<Client[]> { return getJson('/clients') }
export function getClient(clientId: string): Promise<ClientDetail> { return getJson(`/clients/${clientId}`) }
export function createClient(payload: { name: string; notes?: string }): Promise<{ ok: boolean; clientId: string; existing?: boolean }> { return getJson('/clients', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateClient(clientId: string, payload: { name?: string; notes?: string | null }): Promise<{ ok: boolean }> { return getJson(`/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteClient(clientId: string): Promise<{ ok: boolean }> { return getJson(`/clients/${clientId}`, { method: 'DELETE' }) }
export function createProjectStatus(projectId: string, payload: { name: string }): Promise<{ ok: boolean; statusId: string }> { return getJson(`/projects/${projectId}/statuses`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateProjectStatus(projectId: string, statusId: string, payload: { name?: string; color?: string }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}/statuses/${statusId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteProjectStatus(projectId: string, statusId: string, payload?: { targetStatusId?: string }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}/statuses/${statusId}/delete`, { method: 'POST', body: JSON.stringify(payload || {}) }) }
export function getProjectTasks(projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string; archived?: boolean }): Promise<ProjectTaskListItem[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.assignee) params.set('assignee', filters.assignee)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.label) params.set('label', filters.label)
  if (filters?.archived) params.set('archived', 'true')
  const q = params.toString()
  return getJson(`/projects/${projectId}/tasks${q ? `?${q}` : ''}`)
}
export function getTask(taskId: string): Promise<TaskDetail> { return getJson(`/tasks/${taskId}`) }
export function getBoard(projectId?: string): Promise<BoardColumn[]> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return getJson(`/board${q}`)
}
export function getProjectTimesheets(projectId: string): Promise<{ summary: TimesheetSummary; entries: TimesheetEntry[] }> { return getJson(`/projects/${projectId}/timesheets`) }
export function getTaskTimesheets(taskId: string): Promise<{ summary: TimesheetSummary; entries: TimesheetEntry[] }> { return getJson(`/tasks/${taskId}/timesheets`) }
export function getTimesheetUsers(projectId?: string): Promise<TimesheetUser[]> {
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  const q = params.toString()
  return getJson(`/timesheets/users${q ? `?${q}` : ''}`)
}
export function getTimesheetReport(filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; userId?: string; showValidated?: boolean }): Promise<TimesheetReport> {
  const params = new URLSearchParams()
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  if (filters?.projectId) params.set('projectId', filters.projectId)
  if (filters?.clientId) params.set('clientId', filters.clientId)
  if (filters?.taskId) params.set('taskId', filters.taskId)
  if (filters?.userId) params.set('userId', filters.userId)
  if (filters?.showValidated) params.set('showValidated', 'true')
  const q = params.toString()
  return getJson(`/timesheets/report${q ? `?${q}` : ''}`)
}
export function createTimesheetEntry(payload: { userName?: string; userId?: string; projectId: string; taskId?: string | null; date?: string; minutes: number; description?: string; billable?: boolean; validated?: boolean }): Promise<{ ok: boolean; timesheetId: string }> { return getJson('/timesheets', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTimesheetEntry(timesheetId: string, payload: { minutes?: number; description?: string | null; date?: string; billable?: boolean; validated?: boolean; taskId?: string | null; userId?: string }): Promise<{ ok: boolean }> {
  return getJson(`/timesheets/${timesheetId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function deleteTimesheetEntry(timesheetId: string): Promise<{ ok: boolean }> { return getJson(`/timesheets/${timesheetId}`, { method: 'DELETE' }) }
export function createProject(payload: { name: string; description?: string; clientId?: string | null }): Promise<{ ok: boolean; projectId: string }> { return getJson('/projects', { method: 'POST', body: JSON.stringify(payload) }) }
export function moveTask(taskId: string, targetStatus: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ targetStatus }) }) }
export function reorderTask(payload: { taskId: string; targetStatusId: string; orderedTaskIds: string[] }): Promise<{ ok: boolean }> { return getJson('/tasks/reorder', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTask(taskId: string, payload: { title?: string; description?: string; assignee?: string; priority?: 'P1'|'P2'|'P3'; dueDate?: string | null; statusId?: string }): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function archiveTask(taskId: string, archived = true): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }) }
export function deleteTask(taskId: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}`, { method: 'DELETE' }) }
export function createTask(payload: { projectId: string; title: string; assignee?: string; description?: string; priority?: 'P1'|'P2'|'P3'; status?: string; statusId?: string; dueDate?: string | null; labels?: string[]; todos?: { text: string }[] }): Promise<{ ok: boolean; taskId: string }> { return getJson('/tasks', { method: 'POST', body: JSON.stringify(payload) }) }
export function createComment(taskId: string, payload: { body: string; author?: string; mentions?: string[] }): Promise<{ ok: boolean; commentId: string }> { return getJson(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify(payload) }) }
export function getMentionableUsers(projectId: string, query: string): Promise<MentionableUser[]> {
  const search = new URLSearchParams({ projectId, query })
  return getJson(`/mentionable-users?${search.toString()}`)
}
export function createProjectLabel(projectId: string, payload: { name: string }): Promise<{ ok: boolean; labelId: string }> { return getJson(`/projects/${projectId}/labels`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTaskLabels(taskId: string, labels: string[]): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/labels`, { method: 'PATCH', body: JSON.stringify({ labels }) }) }
export function createTaskTodo(taskId: string, payload: { text: string }): Promise<{ ok: boolean; todoId: string }> { return getJson(`/tasks/${taskId}/todos`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTaskTodo(taskId: string, todoId: string, payload: { text?: string; done?: boolean }): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteTaskTodo(taskId: string, todoId: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/${todoId}/delete`, { method: 'POST', body: JSON.stringify({}) }) }
export function reorderTaskTodos(taskId: string, orderedTodoIds: string[]): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/reorder`, { method: 'POST', body: JSON.stringify({ orderedTodoIds }) }) }
export function uploadTaskDescriptionImage(taskId: string, payload: { fileName?: string; mimeType?: string; base64: string }): Promise<{ ok: boolean; url: string }> { return getJson(`/tasks/${taskId}/image-upload`, { method: 'POST', body: JSON.stringify(payload) }) }

export function login(payload: { email: string; password: string }): Promise<{ ok: boolean; sessionToken: string; expiresAt: string; account: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }; memberships: { id: string; workspaceId: string; workspaceName: string; role: string }[] }> {
  return getJson('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
}

export function requestPasswordReset(payload: { email: string; inviteToken?: string }): Promise<{ ok: boolean; expiresAt?: string }> {
  return getJson('/auth/request-password-reset', { method: 'POST', body: JSON.stringify(payload) })
}

export function resetPassword(payload: { token: string; password: string; inviteToken?: string }): Promise<{ ok: boolean; sessionToken: string; expiresAt: string; account: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }; memberships: { id: string; workspaceId: string; workspaceName: string; role: string }[] }> {
  return getJson('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) })
}

export function inviteWorkspaceMember(payload: { email: string; role?: string }): Promise<{ ok: boolean; existing?: boolean; emailed?: boolean; expiresAt?: string }> {
  return getJson('/auth/invite', { method: 'POST', body: JSON.stringify(payload) })
}

export function getInviteInfo(token: string): Promise<{ ok: boolean; invite: { email: string; workspaceId: string; role: string; expiresAt: string; accountExists: boolean; accountActivated: boolean } }> {
  return getJson(`/auth/invite-info?token=${encodeURIComponent(token)}`)
}

export function acceptInvite(payload: { token: string; name?: string; password: string }): Promise<{ ok: boolean; sessionToken: string; expiresAt: string; account: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }; memberships: { id: string; workspaceId: string; workspaceName: string; role: string }[] }> {
  return getJson('/auth/accept-invite', { method: 'POST', body: JSON.stringify(payload) })
}

export function logout(): Promise<{ ok: boolean }> { return getJson('/auth/logout', { method: 'POST', body: JSON.stringify({}) }) }
export function getProfile(): Promise<{ ok: boolean; profile: { id: string; name: string | null; email: string; avatarUrl: string | null; pendingEmail: string | null; platformRole?: 'NONE' | 'SUPERADMIN' } }> { return getJson('/auth/profile') }
export function updateProfile(payload: { name?: string; email?: string; avatarUrl?: string | null }): Promise<{ ok: boolean; profile: { id: string; name: string | null; email: string; avatarUrl: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }; emailChange?: { pendingEmail: string; emailed: boolean; reason?: string } | null }> { return getJson('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }) }
export function confirmEmailChange(payload: { token: string }): Promise<{ ok: boolean; account: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' } }> { return getJson('/auth/confirm-email-change', { method: 'POST', body: JSON.stringify(payload) }) }
export function uploadProfileImage(payload: { fileName?: string; mimeType?: string; base64: string }): Promise<{ ok: boolean; url: string }> { return getJson('/auth/profile/image-upload', { method: 'POST', body: JSON.stringify(payload) }) }
export function getApiKeys(): Promise<{ id: string; label: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[]> { return getJson('/auth/api-keys') }
export function createApiKey(payload: { label: string }): Promise<{ ok: boolean; apiKeyId: string; token: string; key: string; prefix: string }> { return getJson('/auth/api-keys', { method: 'POST', body: JSON.stringify(payload) }) }
export function revokeApiKey(apiKeyId: string): Promise<{ ok: boolean }> { return getJson(`/auth/api-keys/${apiKeyId}`, { method: 'DELETE' }) }

export function getMe(): Promise<{ ok: boolean; account: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }; memberships: { id: string; workspaceId: string; workspaceName: string; role: string }[] }> {
  return getJson('/auth/me')
}

export function getWorkspaces(): Promise<WorkspaceInfo[]> { return getJson('/workspaces') }
export function createWorkspace(payload: { name: string; slug?: string }): Promise<{ ok: boolean; workspaceId: string }> { return getJson('/workspaces', { method: 'POST', body: JSON.stringify(payload) }) }
export function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> { return getJson(`/workspaces/${workspaceId}/members`) }
export function addWorkspaceMember(workspaceId: string, payload: { email?: string; name?: string; role?: string; accountId?: string }): Promise<{ ok: boolean; membershipId: string; existing?: boolean }> {
  return getJson(`/workspaces/${workspaceId}/members`, { method: 'POST', body: JSON.stringify(payload) })
}
export function updateWorkspaceMember(workspaceId: string, membershipId: string, payload: { role?: string }): Promise<{ ok: boolean }> {
  return getJson(`/workspaces/${workspaceId}/members/${membershipId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function removeWorkspaceMember(workspaceId: string, membershipId: string): Promise<{ ok: boolean }> {
  return getJson(`/workspaces/${workspaceId}/members/${membershipId}`, { method: 'DELETE' })
}
export function resendWorkspaceInvite(workspaceId: string, inviteId: string): Promise<{ ok: boolean; emailed?: boolean; inviteId?: string; expiresAt?: string }> {
  return getJson(`/workspaces/${workspaceId}/invites/${inviteId}/resend`, { method: 'POST', body: JSON.stringify({}) })
}
export function cancelWorkspaceInvite(workspaceId: string, inviteId: string): Promise<{ ok: boolean; deletedPlaceholderAccount?: boolean }> {
  return getJson(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' })
}

export function apiUrl(path: string): string { return `${API_BASE_URL}${path}` }

export function getMcpKeys(): Promise<McpKey[]> { return getJson('/auth/mcp-keys') }
export function createMcpKey(payload: { label: string; workspaceId?: string | null }): Promise<{ ok: boolean; mcpKeyId: string; token: string; key: string; prefix: string; workspaceId: string | null; workspaceSlug: string | null }> { return getJson('/auth/mcp-keys', { method: 'POST', body: JSON.stringify(payload) }) }
export function revokeMcpKey(mcpKeyId: string): Promise<{ ok: boolean }> { return getJson(`/auth/mcp-keys/${mcpKeyId}`, { method: 'DELETE' }) }
