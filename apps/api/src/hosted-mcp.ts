export type HostedMcpTaskCreateArgs = {
  projectId: string
  title: string
  owner?: string
  participants?: string[]
  assignee?: string
  collaborators?: string[]
  description?: string
  priority?: string
  status?: string
  statusId?: string
  dueDate?: string | null
  labels?: string[]
  todos?: { text: string }[]
}

export type HostedMcpTaskUpdateArgs = {
  title?: string
  description?: string
  owner?: string
  participants?: string[]
  assignee?: string
  collaborators?: string[]
  priority?: string
  statusId?: string
  dueDate?: string | null
}

export function buildHostedMcpTaskCreatePayload(args: HostedMcpTaskCreateArgs) {
  return {
    projectId: args.projectId,
    title: args.title,
    ...(args.owner !== undefined ? { owner: args.owner } : {}),
    ...(args.participants !== undefined ? { participants: args.participants } : {}),
    ...(args.assignee !== undefined ? { assignee: args.assignee } : {}),
    ...(args.collaborators !== undefined ? { collaborators: args.collaborators } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.statusId !== undefined ? { statusId: args.statusId } : {}),
    ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
    ...(args.labels !== undefined ? { labels: args.labels } : {}),
    ...(args.todos !== undefined ? { todos: args.todos } : {}),
  }
}

export function buildHostedMcpTaskUpdatePayload(args: HostedMcpTaskUpdateArgs) {
  return {
    ...(args.title !== undefined ? { title: args.title } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.owner !== undefined ? { owner: args.owner } : {}),
    ...(args.participants !== undefined ? { participants: args.participants } : {}),
    ...(args.assignee !== undefined ? { assignee: args.assignee } : {}),
    ...(args.collaborators !== undefined ? { collaborators: args.collaborators } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
    ...(args.statusId !== undefined ? { statusId: args.statusId } : {}),
    ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
  }
}
