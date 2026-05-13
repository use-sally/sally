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

export type WorkItemRefInput = {
  provider: 'sally' | 'linear' | 'jira' | 'github' | 'SALLY' | 'LINEAR' | 'JIRA' | 'GITHUB'
  externalId?: string | null
  externalUrl?: string | null
  title?: string | null
  description?: string | null
  sallyTaskId?: string | null
  metadata?: unknown
}

export type HostedMcpAgentJobCreateArgs = {
  projectId?: string | null
  taskId?: string | null
  agentId?: string | null
  role?: string
  mode?: string
  triggerType?: string
  workflowRunId?: string | null
  workflowStep?: number | null
  maxSteps?: number | null
  workItemRefId?: string | null
  workItemRef?: WorkItemRefInput | null
  payload?: unknown
}

export type HostedMcpAgentJobUpdateArgs = {
  status?: string
  error?: string | null
  payload?: unknown
}

export type HostedMcpAgentRunCreateArgs = {
  projectId?: string | null
  taskId?: string | null
  jobId?: string | null
  agentId?: string | null
  role?: string
  status?: string
  triggerType?: string
  provider?: string | null
  model?: string | null
  workflowRunId?: string | null
  workflowStep?: number | null
  workItemRefId?: string | null
  workItemRef?: WorkItemRefInput | null
  summary?: string | null
  logUrl?: string | null
  evidenceUrl?: string | null
  metadata?: unknown
}

export type HostedMcpAgentRunUpdateArgs = {
  status?: string
  summary?: string | null
  error?: string | null
  logUrl?: string | null
  evidenceUrl?: string | null
  metadata?: unknown
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

export function buildHostedMcpAgentJobCreatePayload(args: HostedMcpAgentJobCreateArgs) {
  return {
    ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
    ...(args.agentId !== undefined ? { agentId: args.agentId } : {}),
    ...(args.role !== undefined ? { role: args.role } : {}),
    ...(args.mode !== undefined ? { mode: args.mode } : {}),
    ...(args.triggerType !== undefined ? { triggerType: args.triggerType } : {}),
    ...(args.workflowRunId !== undefined ? { workflowRunId: args.workflowRunId } : {}),
    ...(args.workflowStep !== undefined ? { workflowStep: args.workflowStep } : {}),
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
    ...(args.workItemRefId !== undefined ? { workItemRefId: args.workItemRefId } : {}),
    ...(args.workItemRef !== undefined ? { workItemRef: args.workItemRef } : {}),
    ...(args.payload !== undefined ? { payload: args.payload } : {}),
  }
}

export function buildHostedMcpAgentJobUpdatePayload(args: HostedMcpAgentJobUpdateArgs) {
  return {
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.error !== undefined ? { error: args.error } : {}),
    ...(args.payload !== undefined ? { payload: args.payload } : {}),
  }
}

export function buildHostedMcpAgentRunCreatePayload(args: HostedMcpAgentRunCreateArgs) {
  return {
    ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
    ...(args.jobId !== undefined ? { jobId: args.jobId } : {}),
    ...(args.agentId !== undefined ? { agentId: args.agentId } : {}),
    ...(args.role !== undefined ? { role: args.role } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.triggerType !== undefined ? { triggerType: args.triggerType } : {}),
    ...(args.provider !== undefined ? { provider: args.provider } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.workflowRunId !== undefined ? { workflowRunId: args.workflowRunId } : {}),
    ...(args.workflowStep !== undefined ? { workflowStep: args.workflowStep } : {}),
    ...(args.workItemRefId !== undefined ? { workItemRefId: args.workItemRefId } : {}),
    ...(args.workItemRef !== undefined ? { workItemRef: args.workItemRef } : {}),
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.logUrl !== undefined ? { logUrl: args.logUrl } : {}),
    ...(args.evidenceUrl !== undefined ? { evidenceUrl: args.evidenceUrl } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
  }
}

export function buildHostedMcpAgentRunUpdatePayload(args: HostedMcpAgentRunUpdateArgs) {
  return {
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.error !== undefined ? { error: args.error } : {}),
    ...(args.logUrl !== undefined ? { logUrl: args.logUrl } : {}),
    ...(args.evidenceUrl !== undefined ? { evidenceUrl: args.evidenceUrl } : {}),
    ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
  }
}
