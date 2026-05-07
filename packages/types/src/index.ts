export type Health = {
  ok: boolean
  service: 'api'
  timestamp: string
}

export type ProjectsSummary = {
  activeProjects: number
  openTasks: number
  cycleHealth: string
}

export type ProjectStatus = 'Active' | 'Review' | 'Planning'

export type Project = {
  id: string
  name: string
  client: { id: string; name: string } | null
  lead: string
  tasks: number
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type Client = {
  id: string
  name: string
  notes: string | null
  projectCount: number
}

export type ClientProjectSummary = {
  id: string
  name: string
  lead: string
  tasks: number
  status: ProjectStatus
  archivedAt: string | null
}

export type ClientDetail = {
  id: string
  name: string
  notes: string | null
  createdAt: string
  projectCount: number
  projects: ClientProjectSummary[]
}

export type LabelOption = {
  id: string
  name: string
}

export type StatusOption = {
  id: string
  name: string
  type: string
  position: number
  color?: string | null
  taskCount?: number
}

export type ProjectDependencyRef = {
  projectId: string
  name: string
}

export type TaskDependencyRef = {
  taskId: string
  number: number
  title: string
}

export type TodoItem = {
  id: string
  text: string
  done: boolean
  position: number
}

export type TodoProgress = string | null

export type NotificationActor = {
  id: string
  name: string | null
  email: string
  avatarUrl?: string | null
}

export type Notification = {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
  projectId?: string | null
  taskId?: string | null
  actor: NotificationActor | null
}

export type MentionableUser = {
  accountId: string
  name: string | null
  email: string
  avatarUrl?: string | null
}

export type NotificationPreference = {
  eventType: string
  inAppEnabled: boolean
  emailEnabled: boolean
}

export type TimesheetSelectableUser = { id: string; name: string }
export type SessionAccountIdentity = { name?: string | null; email?: string | null } | null | undefined

export function findCurrentTimesheetUserId(users: TimesheetSelectableUser[], account: SessionAccountIdentity): string | null {
  const accountName = account?.name?.trim().toLowerCase()
  const accountEmail = account?.email?.trim().toLowerCase()
  const match = users.find((user) => {
    const userName = user.name?.trim().toLowerCase()
    return Boolean(userName && ((accountName && userName === accountName) || (accountEmail && userName === accountEmail)))
  })
  return match?.id ?? null
}

export function getPreferredTimesheetCreateUserId(users: TimesheetSelectableUser[], account: SessionAccountIdentity): string {
  return findCurrentTimesheetUserId(users, account) ?? users[0]?.id ?? ''
}

export function getDefaultTimesheetUserName(account: SessionAccountIdentity): string {
  return account?.name?.trim() || account?.email?.trim() || 'Alex'
}

export type TimesheetUser = {
  id: string
  name: string
}

export type TimesheetEntry = {
  id: string
  userId: string
  userName: string
  projectId: string
  taskId: string | null
  taskTitle: string | null
  date: string
  minutes: number
  description: string | null
  billable: boolean
  validated: boolean
  createdAt: string
}

export type TimesheetSummary = {
  totalMinutes: number
  billableMinutes: number
  entries: number
}

export type TimesheetReportEntry = TimesheetEntry & {
  projectName: string
  clientId: string | null
  clientName: string | null
}

export type TimesheetReport = {
  summary: TimesheetSummary
  entries: TimesheetReportEntry[]
}

export type TaskCollaborator = {
  name: string
  avatarUrl?: string | null
}

export type TaskParticipant = {
  name: string
  role: 'OWNER' | 'PARTICIPANT'
  position: number
  avatarUrl?: string | null
}

export type ProjectTaskListItem = {
  id: string
  number: number
  position: number
  title: string
  owner: string
  ownerAvatarUrl?: string | null
  participants: TaskParticipant[]
  assignee: string
  assigneeAvatarUrl?: string | null
  collaborators: TaskCollaborator[]
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  statusColor?: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labels: string[]
  todoProgress: TodoProgress
  archivedAt: string | null
}

export type BoardCard = {
  id: string
  number: number
  position: number
  title: string
  meta: string
  description: string
  owner: string
  ownerAvatarUrl?: string | null
  participants: TaskParticipant[]
  assignee: string
  assigneeAvatarUrl?: string | null
  collaborators: TaskCollaborator[]
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  statusColor?: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labels: string[]
  todoProgress: TodoProgress
}

export type BoardColumn = {
  id: string
  title: string
  type: string
  color?: string | null
  cards: BoardCard[]
}

export type ProjectDetail = {
  id: string
  name: string
  description: string | null
  client: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  taskCount: number
  openTasks: number
  reviewTasks: number
  statuses: StatusOption[]
  labels: LabelOption[]
  dependencies: ProjectDependencyRef[]
  dependedOnBy: ProjectDependencyRef[]
  timesheetSummary: TimesheetSummary
  recentTimesheets: TimesheetEntry[]
  timesheetUsers: TimesheetUser[]
  recentTasks: {
    id: string
    number: number
    position: number
    title: string
    owner: string
    ownerAvatarUrl?: string | null
    participants: TaskParticipant[]
    assignee: string
    assigneeAvatarUrl?: string | null
    collaborators: TaskCollaborator[]
    priority: 'P1' | 'P2' | 'P3'
    status: string
    statusId: string
    statusColor?: string | null
    dueDate: string | null
    createdAt: string
    updatedAt: string
    labels: string[]
    todoProgress: TodoProgress
  }[]
}

export type TaskDetail = {
  id: string
  number: number
  position: number
  title: string
  description: string
  owner: string
  ownerAvatarUrl?: string | null
  participants: TaskParticipant[]
  assignee: string
  assigneeAvatarUrl?: string | null
  collaborators: TaskCollaborator[]
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labels: string[]
  dependencies: TaskDependencyRef[]
  dependedOnBy: TaskDependencyRef[]
  todos: TodoItem[]
  timesheetSummary: TimesheetSummary
  timesheets: TimesheetEntry[]
  timesheetUsers: TimesheetUser[]
  project: { id: string; name: string; client: { id: string; name: string } | null }
  comments: { id: string; author: string; authorAvatarUrl?: string | null; body: string; createdAt: string }[]
}

export type WorkspaceInfo = {
  id: string
  name: string
  slug: string
  createdAt: string
}

export type AccountSummary = {
  id: string
  name: string | null
  email: string
  platformRole?: string | null
  memberships: { id: string; workspaceId: string; workspaceName: string; role: string }[]
}

export type WorkspaceMember = {
  id: string
  accountId: string
  name: string | null
  email: string
  avatarUrl?: string | null
  role: string
  createdAt: string
  invited?: boolean
  inviteId?: string | null
  inviteAcceptedAt?: string | null
  inviteExpiresAt?: string | null
  platformRole?: string | null
}

export type ProjectActivityEvent = {
  id: string
  type: string
  summary: string
  actorName: string | null
  actorEmail: string | null
  actorApiKeyLabel: string | null
  actorMcpKeyLabel: string | null
  details: string[]
  createdAt: string
}

export type AgentIdentitySummary = {
  id: string
  name: string
  role: string
  hermesProfile: string | null
  capabilities: unknown
  enabled: boolean
  lastSeenAt: string | null
}

export type AgentConnectionSummary = {
  id: string
  workspaceId: string
  agentId: string | null
  name: string
  runtimeType: string
  runtimeVersion: string | null
  profileRef: string | null
  capabilities: unknown
  status: string
  lastSeenAt: string | null
  revokedAt: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export type AgentJobSummary = {
  id: string
  projectId: string | null
  taskId: string | null
  agentId: string | null
  role: string
  mode: string
  status: string
  triggerType: string
  workflowRunId: string | null
  workflowStep: number | null
  maxSteps: number | null
  lockedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  agent?: AgentIdentitySummary | null
}

export type ProjectAutomationConfig = {
  id: string
  workspaceId: string
  projectId: string
  workflowEnabled: boolean
  defaultPmAgentId: string | null
  roleAgents: unknown
  baselineTaskIds: unknown
  requiredCapabilities: unknown
  liveActionsRequireApproval: boolean
  stagingFirst: boolean
  currentStage: string
  nextRole: string | null
  automationState: string
  metadata: unknown
  createdAt: string
  updatedAt: string
}

export type AgentRunSummary = {
  id: string
  projectId: string | null
  taskId: string | null
  jobId: string | null
  agentId: string | null
  role: string
  status: string
  triggerType: string
  provider: string | null
  model: string | null
  workflowRunId: string | null
  workflowStep: number | null
  startedAt: string | null
  finishedAt: string | null
  latestHeartbeatAt: string | null
  summary: string | null
  error: string | null
  logUrl: string | null
  evidenceUrl: string | null
  createdAt: string
  updatedAt: string
  agent?: AgentIdentitySummary | null
}

export type ApprovalRequestSummary = {
  id: string
  projectId: string | null
  taskId: string | null
  requestedByAgentId: string | null
  decidedByAccountId: string | null
  type: string
  status: string
  question: string
  options: unknown
  recommendation: string | null
  decisionNote: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export type BlockerSummary = {
  id: string
  projectId: string | null
  taskId: string | null
  ownerAgentId: string | null
  type: string
  status: string
  summary: string
  requiredInput: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectAutomationOverview = {
  config: ProjectAutomationConfig | null
  agents: AgentIdentitySummary[]
  jobs: AgentJobSummary[]
  runs: AgentRunSummary[]
  connections: AgentConnectionSummary[]
  blockers: BlockerSummary[]
  approvalRequests: ApprovalRequestSummary[]
}

export type ProjectMember = {
  id: string
  accountId: string
  name: string | null
  email: string
  avatarUrl?: string | null
  role: string
  createdAt: string
  locked?: boolean
  workspaceRole?: string | null
  platformRole?: string | null
}

export type McpKey = {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  workspaceId: string | null
  workspaceSlug: string | null
  workspaceName: string | null
}
