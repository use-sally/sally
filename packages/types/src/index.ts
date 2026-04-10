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

export type ProjectTaskListItem = {
  id: string
  number: number | null
  title: string
  assignee: string
  assigneeAvatarUrl?: string | null
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  statusColor?: string | null
  dueDate: string | null
  labels: string[]
  todoProgress: TodoProgress
  archivedAt: string | null
}

export type BoardCard = {
  id: string
  number: number | null
  title: string
  meta: string
  description: string
  assignee: string
  assigneeAvatarUrl?: string | null
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  dueDate: string | null
  labels: string[]
  todoProgress: TodoProgress
}

export type BoardColumn = {
  id: string
  title: string
  type: string
  cards: BoardCard[]
}

export type ProjectDetail = {
  id: string
  name: string
  description: string | null
  client: { id: string; name: string } | null
  taskCount: number
  openTasks: number
  reviewTasks: number
  statuses: StatusOption[]
  labels: LabelOption[]
  timesheetSummary: TimesheetSummary
  recentTimesheets: TimesheetEntry[]
  timesheetUsers: TimesheetUser[]
  recentTasks: {
    id: string
    number: number | null
    title: string
    assignee: string
    assigneeAvatarUrl?: string | null
    priority: 'P1' | 'P2' | 'P3'
    status: string
    statusId: string
    statusColor?: string | null
    dueDate: string | null
    labels: string[]
    todoProgress: TodoProgress
  }[]
}

export type TaskDetail = {
  id: string
  number: number | null
  title: string
  description: string
  assignee: string
  assigneeAvatarUrl?: string | null
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  dueDate: string | null
  labels: string[]
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
