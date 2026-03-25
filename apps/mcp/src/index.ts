import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

type Json = Record<string, unknown>

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Json
  isError?: boolean
}

const SALLY_URL = (process.env.SALLY_URL || '').trim().replace(/\/+$/, '')
const API_BASE_URL = SALLY_URL.endsWith('/api') ? SALLY_URL : `${SALLY_URL}/api`
const API_TOKEN = process.env.SALLY_API_KEY || process.env.SALLY_TOKEN
const WORKSPACE_ID = process.env.SALLY_WORKSPACE_ID || process.env.WORKSPACE_ID
const WORKSPACE_SLUG = process.env.SALLY_WORKSPACE_SLUG || process.env.WORKSPACE_SLUG

if (!SALLY_URL) {
  throw new Error('Missing SALLY_URL for MCP server target, e.g. https://yourdomain.com')
}

if (!API_TOKEN) {
  throw new Error('Missing SALLY_API_KEY or SALLY_TOKEN for MCP server auth')
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_TOKEN}`,
  }
  if (WORKSPACE_ID) headers['x-workspace-id'] = WORKSPACE_ID
  else if (WORKSPACE_SLUG) headers['x-workspace-slug'] = WORKSPACE_SLUG
  if (init?.body !== undefined && init.body !== null) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...headers, ...(init?.headers ? Object.fromEntries(new Headers(init.headers)) : {}) } })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status} for ${path}`)
  }
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

const tools = [
  {
    name: 'workspace.list',
    description: 'List accessible workspaces.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'project.list',
    description: 'List projects in the current workspace.',
    inputSchema: { type: 'object', properties: { archived: { type: 'boolean' } }, additionalProperties: false },
  },
  {
    name: 'project.create',
    description: 'Create a new project.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, clientId: { type: 'string' } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'project.get',
    description: 'Get full project details.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false },
  },
  {
    name: 'task.list',
    description: 'List tasks for a project.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, status: { type: 'string' }, assignee: { type: 'string' }, search: { type: 'string' }, label: { type: 'string' }, archived: { type: 'boolean' } }, required: ['projectId'], additionalProperties: false },
  },
  {
    name: 'task.get',
    description: 'Get full task details.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false },
  },
  {
    name: 'task.create',
    description: 'Create a task in a project.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, title: { type: 'string' }, assignee: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['P1', 'P2', 'P3'] }, status: { type: 'string' }, statusId: { type: 'string' }, dueDate: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } }, required: ['projectId', 'title'], additionalProperties: false },
  },
  {
    name: 'task.update',
    description: 'Update a task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, assignee: { type: 'string' }, priority: { type: 'string', enum: ['P1', 'P2', 'P3'] }, statusId: { type: 'string' }, dueDate: { type: 'string' } }, required: ['taskId'], additionalProperties: false },
  },
  {
    name: 'task.move',
    description: 'Move a task to a target status name.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, targetStatus: { type: 'string' } }, required: ['taskId', 'targetStatus'], additionalProperties: false },
  },
  {
    name: 'task.comments',
    description: 'List comments for a task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'], additionalProperties: false },
  },
  {
    name: 'comment.add',
    description: 'Add a comment to a task.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, body: { type: 'string' }, author: { type: 'string' }, mentions: { type: 'array', items: { type: 'string' } } }, required: ['taskId', 'body'], additionalProperties: false },
  },
  {
    name: 'timesheet.add',
    description: 'Add a timesheet entry.',
    inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, userId: { type: 'string' }, userName: { type: 'string' }, date: { type: 'string' }, minutes: { type: 'number' }, description: { type: 'string' }, billable: { type: 'boolean' }, validated: { type: 'boolean' } }, required: ['projectId', 'minutes'], additionalProperties: false },
  },
  {
    name: 'notification.list',
    description: 'List notifications for the authenticated account.',
    inputSchema: { type: 'object', properties: { unreadOnly: { type: 'boolean' }, limit: { type: 'number' } }, additionalProperties: false },
  },
  {
    name: 'notification.read',
    description: 'Read and clear a single notification.',
    inputSchema: { type: 'object', properties: { notificationId: { type: 'string' } }, required: ['notificationId'], additionalProperties: false },
  },
  {
    name: 'notification.read_all',
    description: 'Read and clear all notifications.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const

const server = new Server(
  { name: 'sally-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools] }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = (request.params.arguments || {}) as Record<string, any>
  try {
    switch (name) {
      case 'workspace.list':
        return ok({ items: await api<any[]>('/workspaces') })
      case 'project.list': {
        const params = new URLSearchParams()
        if (args.archived) params.set('archived', 'true')
        return ok({ items: await api<any[]>(`/projects${params.toString() ? `?${params.toString()}` : ''}`) })
      }
      case 'project.create':
        return ok(await api<Json>('/projects', { method: 'POST', body: JSON.stringify({ name: args.name, description: args.description, clientId: args.clientId ?? null }) }))
      case 'project.get': {
        const params = new URLSearchParams()
        if (args.archived) params.set('archived', 'true')
        return ok(await api<Json>(`/projects/${args.projectId}${params.toString() ? `?${params.toString()}` : ''}`))
      }
      case 'task.list': {
        const params = new URLSearchParams()
        for (const key of ['status', 'assignee', 'search', 'label']) {
          if (typeof args[key] === 'string' && args[key]) params.set(key, args[key])
        }
        if (args.archived) params.set('archived', 'true')
        return ok({ items: await api<any[]>(`/projects/${args.projectId}/tasks${params.toString() ? `?${params.toString()}` : ''}`) })
      }
      case 'task.get':
        return ok(await api<Json>(`/tasks/${args.taskId}`))
      case 'task.create':
        return ok(await api<Json>('/tasks', { method: 'POST', body: JSON.stringify(args) }))
      case 'task.update': {
        const { taskId, ...payload } = args
        return ok(await api<Json>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }))
      }
      case 'task.move':
        return ok(await api<Json>(`/tasks/${args.taskId}/move`, { method: 'POST', body: JSON.stringify({ targetStatus: args.targetStatus }) }))
      case 'task.comments': {
        const task = await api<any>(`/tasks/${args.taskId}`)
        return ok({ items: task.comments || [] })
      }
      case 'comment.add':
        return ok(await api<Json>(`/tasks/${args.taskId}/comments`, { method: 'POST', body: JSON.stringify({ body: args.body, author: args.author, mentions: args.mentions || [] }) }))
      case 'timesheet.add':
        return ok(await api<Json>('/timesheets', { method: 'POST', body: JSON.stringify(args) }))
      case 'notification.list': {
        const params = new URLSearchParams()
        if (args.unreadOnly) params.set('unreadOnly', 'true')
        if (typeof args.limit === 'number') params.set('limit', String(args.limit))
        return ok({ items: await api<any[]>(`/notifications${params.toString() ? `?${params.toString()}` : ''}`) })
      }
      case 'notification.read':
        return ok(await api<Json>(`/notifications/${args.notificationId}/read`, { method: 'POST', body: JSON.stringify({}) }))
      case 'notification.read_all':
        return ok(await api<Json>('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }))
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return fail(error)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
