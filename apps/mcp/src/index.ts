import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

type Json = Record<string, unknown>
type JsonValue = string | number | boolean | null | Json | JsonValue[]
type ToolDefinition = {
  name: string
  description: string
  inputSchema: Json
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Json
  isError?: boolean
}

const SALLY_URL = (process.env.SALLY_URL || '').trim().replace(/\/+$/, '')
const API_BASE_URL = SALLY_URL.endsWith('/api') ? SALLY_URL : `${SALLY_URL}/api`
const API_TOKEN = process.env.SALLY_USER_API_KEY || process.env.SALLY_API_KEY || process.env.SALLY_TOKEN
const WORKSPACE_SLUG = process.env.SALLY_WORKSPACE_SLUG

if (!SALLY_URL) throw new Error('Missing SALLY_URL for MCP server target, e.g. https://yourdomain.com')
if (!API_TOKEN) throw new Error('Missing SALLY_USER_API_KEY for MCP server auth')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_TOKEN}`,
  }
  if (WORKSPACE_SLUG) headers['x-workspace-slug'] = WORKSPACE_SLUG
  if (init?.body !== undefined && init.body !== null) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ? Object.fromEntries(new Headers(init.headers)) : {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `HTTP ${response.status} for ${path}`)
  return text ? JSON.parse(text) as T : ({} as T)
}

function ok(data: Json): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function fail(error: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  }
}

function withWorkspace(path: string, workspaceId?: string, workspaceSlug?: string) {
  const params = new URLSearchParams()
  if (workspaceId) params.set('workspaceId', workspaceId)
  if (workspaceSlug) params.set('workspaceSlug', workspaceSlug)
  return `${path}${params.toString() ? `?${params.toString()}` : ''}`
}

function pathWithParams(path: string, paramsInput: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(paramsInput)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'boolean') {
      if (value) params.set(key, 'true')
      continue
    }
    params.set(key, String(value))
  }
  return `${path}${params.toString() ? `?${params.toString()}` : ''}`
}

function pick<T extends Record<string, any>>(input: T, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in input && input[key] !== undefined) out[key] = input[key]
  }
  return out
}

function workspaceFields() {
  return {
    workspaceId: { type: 'string', description: 'Optional workspace id. Needed only when the API key can access multiple workspaces.' },
    workspaceSlug: { type: 'string', description: 'Optional workspace slug alternative to workspaceId.' },
  }
}

const tools: ToolDefinition[] = [
  { name: 'workspace.list', description: 'List accessible workspaces.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'workspace.members.list', description: 'List members in a workspace.', inputSchema: { type: 'object', properties: { ...workspaceFields(), targetWorkspaceId: { type: 'string' } }, additionalProperties: false } },
  { name: 'workspace.members.add', description: 'Add a workspace member by accountId or by email/name.', inputSchema: { type: 'object', properties: { ...workspaceFields(), targetWorkspaceId: { type: 'string' }, accountId: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MEMBER'] } }, required: ['role'], additionalProperties: false } },
  { name: 'workspace.members.update', description: 'Change a workspace member role.', inputSchema: { type: 'object', properties: { ...workspaceFields(), targetWorkspaceId: { type: 'string' }, membershipId: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MEMBER'] } }, required: ['membershipId', 'role'], additionalProperties: false } },
  { name: 'workspace.members.remove', description: 'Remove a workspace member.', inputSchema: { type: 'object', properties: { ...workspaceFields(), targetWorkspaceId: { type: 'string' }, membershipId: { type: 'string' } }, required: ['membershipId'], additionalProperties: false } },
  { name: 'workspace.invite', description: 'Invite a user to the current workspace by email.', inputSchema: { type: 'object', properties: { ...workspaceFields(), email: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MEMBER'] } }, required: ['email', 'role'], additionalProperties: false } },
  { name: 'profile.get', description: 'Get the authenticated user profile and pending email state.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'profile.update', description: 'Update the authenticated user profile.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, avatarUrl: { type: ['string', 'null'] } }, additionalProperties: false } },
  { name: 'profile.image_upload', description: 'Upload a profile image using base64 content.', inputSchema: { type: 'object', properties: { fileName: { type: 'string' }, mimeType: { type: 'string' }, base64: { type: 'string' } }, required: ['base64'], additionalProperties: false } },
  { name: 'api_keys.list', description: 'List personal API keys for the authenticated account.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'api_keys.create', description: 'Create a new personal API key.', inputSchema: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'], additionalProperties: false } },
  { name: 'api_keys.revoke', description: 'Revoke a personal API key.', inputSchema: { type: 'object', properties: { apiKeyId: { type: 'string' } }, required: ['apiKeyId'], additionalProperties: false } },
  { name: 'notification.list', description: 'List notifications for the authenticated account.', inputSchema: { type: 'object', properties: { unreadOnly: { type: 'boolean' }, limit: { type: 'number' } }, additionalProperties: false } },
  { name: 'notification.read', description: 'Read and clear a single notification.', inputSchema: { type: 'object', properties: { notificationId: { type: 'string' } }, required: ['notificationId'], additionalProperties: false } },
  { name: 'notification.read_all', description: 'Read and clear all notifications.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'notification.preferences.get', description: 'Get notification preferences.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'notification.preferences.update', description: 'Update notification preferences.', inputSchema: { type: 'object', properties: { preferences: { type: 'array', items: { type: 'object', properties: { eventType: { type: 'string', enum: ['comment.mentioned', 'task.assigned'] }, inAppEnabled: { type: 'boolean' }, emailEnabled: { type: 'boolean' } }, required: ['eventType', 'inAppEnabled', 'emailEnabled'], additionalProperties: false } } }, required: ['preferences'], additionalProperties: false } },
  { name: 'mentionable_users.list', description: 'List users mentionable in a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, query: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'client.list', description: 'List visible clients.', inputSchema: { type: 'object', properties: { ...workspaceFields() }, additionalProperties: false } },
  { name: 'client.create', description: 'Create a client.', inputSchema: { type: 'object', properties: { ...workspaceFields(), name: { type: 'string' }, notes: { type: 'string' } }, required: ['name'], additionalProperties: false } },
  { name: 'client.get', description: 'Get full client details.', inputSchema: { type: 'object', properties: { ...workspaceFields(), clientId: { type: 'string' } }, required: ['clientId'], additionalProperties: false } },
  { name: 'client.update', description: 'Update a client.', inputSchema: { type: 'object', properties: { ...workspaceFields(), clientId: { type: 'string' }, name: { type: 'string' }, notes: { type: ['string', 'null'] } }, required: ['clientId'], additionalProperties: false } },
  { name: 'client.delete', description: 'Delete a client with no linked projects.', inputSchema: { type: 'object', properties: { ...workspaceFields(), clientId: { type: 'string' } }, required: ['clientId'], additionalProperties: false } },
  { name: 'project.summary', description: 'Get workspace project summary stats.', inputSchema: { type: 'object', properties: { ...workspaceFields() }, additionalProperties: false } },
  { name: 'project.list', description: 'List projects in the current workspace.', inputSchema: { type: 'object', properties: { ...workspaceFields(), archived: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'project.create', description: 'Create a new project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), name: { type: 'string' }, description: { type: 'string' }, clientId: { type: ['string', 'null'] } }, required: ['name'], additionalProperties: false } },
  { name: 'project.get', description: 'Get full project details.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.update', description: 'Update a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, clientId: { type: ['string', 'null'] } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.archive', description: 'Archive or unarchive a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.delete', description: 'Delete a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.members.list', description: 'List effective members for a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.members.add', description: 'Add a project member by accountId or email/name.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, accountId: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MEMBER'] } }, required: ['projectId', 'role'], additionalProperties: false } },
  { name: 'project.members.update', description: 'Change a project member role.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, membershipId: { type: 'string' }, role: { type: 'string', enum: ['OWNER', 'MEMBER'] } }, required: ['projectId', 'membershipId', 'role'], additionalProperties: false } },
  { name: 'project.members.remove', description: 'Remove a project member.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, membershipId: { type: 'string' } }, required: ['projectId', 'membershipId'], additionalProperties: false } },
  { name: 'project.activity', description: 'List recent project activity.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'project.labels.create', description: 'Create or ensure a project label exists.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, name: { type: 'string' } }, required: ['projectId', 'name'], additionalProperties: false } },
  { name: 'project.statuses.create', description: 'Create a project status.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, name: { type: 'string' } }, required: ['projectId', 'name'], additionalProperties: false } },
  { name: 'project.statuses.update', description: 'Update a project status.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, statusId: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'project.statuses.delete', description: 'Delete a project status, optionally moving tasks to another status.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, statusId: { type: 'string' }, targetStatusId: { type: 'string' } }, required: ['projectId', 'statusId'], additionalProperties: false } },
  { name: 'board.get', description: 'Get board columns/cards, optionally for one project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' } }, additionalProperties: false } },
  { name: 'task.list', description: 'List tasks for a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, status: { type: 'string' }, assignee: { type: 'string' }, search: { type: 'string' }, label: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'task.get', description: 'Get full task details.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.create', description: 'Create a task in a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, title: { type: 'string' }, assignee: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['P1', 'P2', 'P3'] }, status: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: ['string', 'null'] }, labels: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } }, required: ['projectId', 'title'], additionalProperties: false } },
  { name: 'task.update', description: 'Update a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' }, priority: { type: 'string', enum: ['P1', 'P2', 'P3'] }, statusId: { type: 'string' }, dueDate: { type: ['string', 'null'] } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.move', description: 'Move a task to a target status name.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, targetStatus: { type: 'string' } }, required: ['taskId', 'targetStatus'], additionalProperties: false } },
  { name: 'task.reorder', description: 'Move/reorder tasks within a target status using the ordered list of task ids.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, targetStatusId: { type: 'string' }, orderedTaskIds: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'targetStatusId', 'orderedTaskIds'], additionalProperties: false } },
  { name: 'task.archive', description: 'Archive or unarchive a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.delete', description: 'Delete a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'task.dependencies.add', description: 'Add a dependency: the task depends on another task. Both must be in the same project. Cycles are rejected.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string', description: 'The task that depends on another' }, dependsOnId: { type: 'string', description: 'The task it depends on' } }, required: ['taskId', 'dependsOnId'], additionalProperties: false } },
  { name: 'task.dependencies.remove', description: 'Remove a dependency between two tasks.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, dependsOnId: { type: 'string' } }, required: ['taskId', 'dependsOnId'], additionalProperties: false } },
  { name: 'task.comments', description: 'List comments for a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'comment.add', description: 'Add a comment to a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, body: { type: 'string' }, author: { type: 'string' }, mentions: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'body'], additionalProperties: false } },
  { name: 'task.labels.update', description: 'Replace a task label set, creating missing labels automatically.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'labels'], additionalProperties: false } },
  { name: 'task.todos.create', description: 'Add a checklist item to a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, text: { type: 'string' } }, required: ['taskId', 'text'], additionalProperties: false } },
  { name: 'task.todos.update', description: 'Update a checklist item on a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, todoId: { type: 'string' }, text: { type: 'string' }, done: { type: 'boolean' } }, required: ['taskId', 'todoId'], additionalProperties: false } },
  { name: 'task.todos.delete', description: 'Delete a checklist item from a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, todoId: { type: 'string' } }, required: ['taskId', 'todoId'], additionalProperties: false } },
  { name: 'task.todos.reorder', description: 'Reorder all checklist items for a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, orderedTodoIds: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'orderedTodoIds'], additionalProperties: false } },
  { name: 'task.image_upload', description: 'Upload a task image using base64 content.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' }, fileName: { type: 'string' }, mimeType: { type: 'string' }, base64: { type: 'string' } }, required: ['taskId', 'base64'], additionalProperties: false } },
  { name: 'timesheet.add', description: 'Add a timesheet entry.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, taskId: { type: ['string', 'null'] }, userId: { type: 'string' }, userName: { type: 'string' }, date: { type: 'string' }, minutes: { type: 'number' }, description: { type: 'string' }, billable: { type: 'boolean' }, validated: { type: 'boolean' } }, required: ['projectId', 'minutes'], additionalProperties: false } },
  { name: 'timesheet.update', description: 'Update a timesheet entry.', inputSchema: { type: 'object', properties: { ...workspaceFields(), timesheetId: { type: 'string' }, minutes: { type: 'number' }, description: { type: ['string', 'null'] }, date: { type: 'string' }, billable: { type: 'boolean' }, validated: { type: 'boolean' }, taskId: { type: ['string', 'null'] }, userId: { type: 'string' } }, required: ['timesheetId'], additionalProperties: false } },
  { name: 'timesheet.delete', description: 'Delete a timesheet entry.', inputSchema: { type: 'object', properties: { ...workspaceFields(), timesheetId: { type: 'string' } }, required: ['timesheetId'], additionalProperties: false } },
  { name: 'timesheet.project_list', description: 'List timesheets for a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
  { name: 'timesheet.task_list', description: 'List timesheets for a task.', inputSchema: { type: 'object', properties: { ...workspaceFields(), taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false } },
  { name: 'timesheet.users', description: 'List available timesheet users, optionally within a project.', inputSchema: { type: 'object', properties: { ...workspaceFields(), projectId: { type: 'string' } }, additionalProperties: false } },
  { name: 'timesheet.report', description: 'Run a timesheet report.', inputSchema: { type: 'object', properties: { ...workspaceFields(), from: { type: 'string' }, to: { type: 'string' }, projectId: { type: 'string' }, clientId: { type: 'string' }, taskId: { type: 'string' }, userId: { type: 'string' }, showValidated: { type: 'boolean' } }, additionalProperties: false } },
] as const

const server = new Server({ name: 'sally-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools] }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = (request.params.arguments || {}) as Record<string, any>
  const workspacePath = (path: string) => withWorkspace(path, args.workspaceId, args.workspaceSlug)

  try {
    switch (name) {
      case 'workspace.list':
        return ok({ items: await api<any[]>('/workspaces') })
      case 'workspace.members.list':
        return ok({ items: await api<any[]>(workspacePath(`/workspaces/${args.targetWorkspaceId || args.workspaceId}/members`)) })
      case 'workspace.members.add':
        return ok(await api<Json>(workspacePath(`/workspaces/${args.targetWorkspaceId || args.workspaceId}/members`), { method: 'POST', body: JSON.stringify(pick(args, ['accountId', 'email', 'name', 'role'])) }))
      case 'workspace.members.update':
        return ok(await api<Json>(workspacePath(`/workspaces/${args.targetWorkspaceId || args.workspaceId}/members/${args.membershipId}`), { method: 'PATCH', body: JSON.stringify({ role: args.role }) }))
      case 'workspace.members.remove':
        return ok(await api<Json>(workspacePath(`/workspaces/${args.targetWorkspaceId || args.workspaceId}/members/${args.membershipId}`), { method: 'DELETE' }))
      case 'workspace.invite':
        return ok(await api<Json>(workspacePath('/auth/invite'), { method: 'POST', body: JSON.stringify({ email: args.email, role: args.role }) }))
      case 'profile.get':
        return ok(await api<Json>('/auth/profile'))
      case 'profile.update':
        return ok(await api<Json>('/auth/profile', { method: 'PATCH', body: JSON.stringify(pick(args, ['name', 'email', 'avatarUrl'])) }))
      case 'profile.image_upload':
        return ok(await api<Json>('/auth/profile/image-upload', { method: 'POST', body: JSON.stringify(pick(args, ['fileName', 'mimeType', 'base64'])) }))
      case 'api_keys.list':
        return ok({ items: await api<any[]>('/auth/api-keys') })
      case 'api_keys.create':
        return ok(await api<Json>('/auth/api-keys', { method: 'POST', body: JSON.stringify({ label: args.label }) }))
      case 'api_keys.revoke':
        return ok(await api<Json>(`/auth/api-keys/${args.apiKeyId}`, { method: 'DELETE' }))
      case 'notification.list':
        return ok({ items: await api<any[]>(pathWithParams('/notifications', { unreadOnly: args.unreadOnly, limit: args.limit })) })
      case 'notification.read':
        return ok(await api<Json>(`/notifications/${args.notificationId}/read`, { method: 'POST', body: JSON.stringify({}) }))
      case 'notification.read_all':
        return ok(await api<Json>('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }))
      case 'notification.preferences.get':
        return ok({ items: await api<any[]>('/notifications/preferences') })
      case 'notification.preferences.update':
        return ok(await api<Json>('/notifications/preferences', { method: 'PUT', body: JSON.stringify({ preferences: args.preferences }) }))
      case 'mentionable_users.list':
        return ok({ items: await api<any[]>(workspacePath(pathWithParams('/mentionable-users', { projectId: args.projectId, query: args.query }))) })
      case 'client.list':
        return ok({ items: await api<any[]>(workspacePath('/clients')) })
      case 'client.create':
        return ok(await api<Json>(workspacePath('/clients'), { method: 'POST', body: JSON.stringify(pick(args, ['name', 'notes'])) }))
      case 'client.get':
        return ok(await api<Json>(workspacePath(`/clients/${args.clientId}`)))
      case 'client.update':
        return ok(await api<Json>(workspacePath(`/clients/${args.clientId}`), { method: 'PATCH', body: JSON.stringify(pick(args, ['name', 'notes'])) }))
      case 'client.delete':
        return ok(await api<Json>(workspacePath(`/clients/${args.clientId}`), { method: 'DELETE' }))
      case 'project.summary':
        return ok(await api<Json>(workspacePath('/projects/summary')))
      case 'project.list':
        return ok({ items: await api<any[]>(workspacePath(pathWithParams('/projects', { archived: args.archived }))) })
      case 'project.create':
        return ok(await api<Json>(workspacePath('/projects'), { method: 'POST', body: JSON.stringify(pick(args, ['name', 'description', 'clientId'])) }))
      case 'project.get':
        return ok(await api<Json>(workspacePath(pathWithParams(`/projects/${args.projectId}`, { archived: args.archived }))))
      case 'project.update': {
        const { workspaceId: _w1, workspaceSlug: _w2, projectId, ...rest } = args
        return ok(await api<Json>(workspacePath(`/projects/${projectId}`), { method: 'PATCH', body: JSON.stringify(rest) }))
      }
      case 'project.archive':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/archive`), { method: 'POST', body: JSON.stringify({ archived: args.archived }) }))
      case 'project.delete':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}`), { method: 'DELETE' }))
      case 'project.members.list':
        return ok({ items: await api<any[]>(workspacePath(`/projects/${args.projectId}/members`)) })
      case 'project.members.add':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/members`), { method: 'POST', body: JSON.stringify(pick(args, ['accountId', 'email', 'name', 'role'])) }))
      case 'project.members.update':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/members/${args.membershipId}`), { method: 'PATCH', body: JSON.stringify({ role: args.role }) }))
      case 'project.members.remove':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/members/${args.membershipId}`), { method: 'DELETE' }))
      case 'project.activity':
        return ok({ items: await api<any[]>(workspacePath(`/projects/${args.projectId}/activity`)) })
      case 'project.labels.create':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/labels`), { method: 'POST', body: JSON.stringify({ name: args.name }) }))
      case 'project.statuses.create':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/statuses`), { method: 'POST', body: JSON.stringify({ name: args.name }) }))
      case 'project.statuses.update':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/statuses/${args.statusId}`), { method: 'PATCH', body: JSON.stringify(pick(args, ['name', 'color'])) }))
      case 'project.statuses.delete':
        return ok(await api<Json>(workspacePath(`/projects/${args.projectId}/statuses/${args.statusId}/delete`), { method: 'POST', body: JSON.stringify({ targetStatusId: args.targetStatusId }) }))
      case 'board.get':
        return ok({ items: await api<any[]>(workspacePath(pathWithParams('/board', { projectId: args.projectId }))) })
      case 'task.list':
        return ok({ items: await api<any[]>(workspacePath(pathWithParams(`/projects/${args.projectId}/tasks`, pick(args, ['status', 'assignee', 'search', 'label', 'archived'])))) })
      case 'task.get':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}`)))
      case 'task.create': {
        const { workspaceId: _w1, workspaceSlug: _w2, ...payload } = args
        return ok(await api<Json>(workspacePath('/tasks'), { method: 'POST', body: JSON.stringify(payload) }))
      }
      case 'task.update': {
        const { workspaceId: _w1, workspaceSlug: _w2, taskId, ...payload } = args
        return ok(await api<Json>(workspacePath(`/tasks/${taskId}`), { method: 'PATCH', body: JSON.stringify(payload) }))
      }
      case 'task.move':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/move`), { method: 'POST', body: JSON.stringify({ targetStatus: args.targetStatus }) }))
      case 'task.reorder':
        return ok(await api<Json>(workspacePath('/tasks/reorder'), { method: 'POST', body: JSON.stringify(pick(args, ['taskId', 'targetStatusId', 'orderedTaskIds'])) }))
      case 'task.archive':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/archive`), { method: 'POST', body: JSON.stringify({ archived: args.archived }) }))
      case 'task.delete':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}`), { method: 'DELETE' }))
      case 'task.dependencies.add':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/dependencies`), { method: 'POST', body: JSON.stringify({ dependsOnId: args.dependsOnId }) }))
      case 'task.dependencies.remove':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/dependencies/${args.dependsOnId}`), { method: 'DELETE' }))
      case 'task.comments': {
        const task = await api<any>(workspacePath(`/tasks/${args.taskId}`))
        return ok({ items: task.comments || [] })
      }
      case 'comment.add':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/comments`), { method: 'POST', body: JSON.stringify({ body: args.body, author: args.author, mentions: args.mentions || [] }) }))
      case 'task.labels.update':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/labels`), { method: 'PATCH', body: JSON.stringify({ labels: args.labels || [] }) }))
      case 'task.todos.create':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/todos`), { method: 'POST', body: JSON.stringify({ text: args.text }) }))
      case 'task.todos.update':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/todos/${args.todoId}`), { method: 'PATCH', body: JSON.stringify(pick(args, ['text', 'done'])) }))
      case 'task.todos.delete':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/todos/${args.todoId}/delete`), { method: 'POST', body: JSON.stringify({}) }))
      case 'task.todos.reorder':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/todos/reorder`), { method: 'POST', body: JSON.stringify({ orderedTodoIds: args.orderedTodoIds || [] }) }))
      case 'task.image_upload':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/image-upload`), { method: 'POST', body: JSON.stringify(pick(args, ['fileName', 'mimeType', 'base64'])) }))
      case 'timesheet.add': {
        const { workspaceId: _w1, workspaceSlug: _w2, ...payload } = args
        return ok(await api<Json>(workspacePath('/timesheets'), { method: 'POST', body: JSON.stringify(payload) }))
      }
      case 'timesheet.update': {
        const { workspaceId: _w1, workspaceSlug: _w2, timesheetId, ...payload } = args
        return ok(await api<Json>(workspacePath(`/timesheets/${timesheetId}`), { method: 'PATCH', body: JSON.stringify(payload) }))
      }
      case 'timesheet.delete':
        return ok(await api<Json>(workspacePath(`/timesheets/${args.timesheetId}`), { method: 'DELETE' }))
      case 'timesheet.project_list':
        return ok(await api<Json>(workspacePath(pathWithParams(`/projects/${args.projectId}/timesheets`, pick(args, ['from', 'to'])))))
      case 'timesheet.task_list':
        return ok(await api<Json>(workspacePath(`/tasks/${args.taskId}/timesheets`)))
      case 'timesheet.users':
        return ok({ items: await api<any[]>(workspacePath(pathWithParams('/timesheets/users', { projectId: args.projectId }))) })
      case 'timesheet.report':
        return ok(await api<Json>(workspacePath(pathWithParams('/timesheets/report', pick(args, ['from', 'to', 'projectId', 'clientId', 'taskId', 'userId', 'showValidated'])))))
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return fail(error)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
