import type { AgentJobSummary, ApprovalRequestSummary, BlockerSummary, ProjectAutomationOverview } from '@sally/types/src'

export type TaskAutomationBadge = {
  label: string
  tone: 'queued' | 'working' | 'approval' | 'blocked' | 'review' | 'done' | 'failed'
  detail?: string
}

function roleLabel(role?: string | null) {
  const normalized = role?.toLowerCase()
  if (normalized === 'pm') return 'Planning'
  if (normalized === 'architect') return 'Designing'
  if (normalized === 'coder') return 'Agent working'
  if (normalized === 'reviewer') return 'Reviewing'
  if (normalized === 'tester') return 'Testing'
  if (normalized === 'infra') return 'Deploying'
  if (normalized === 'marketer') return 'Marketing'
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Agent working'
}

function latestByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
}

function badgeForJob(job: AgentJobSummary): TaskAutomationBadge | null {
  if (job.status === 'QUEUED') return { label: 'Queued', tone: 'queued', detail: roleLabel(job.role) }
  if (job.status === 'CLAIMED' || job.status === 'RUNNING') {
    const role = job.role?.toLowerCase()
    if (role === 'reviewer' || role === 'tester') return { label: roleLabel(role), tone: 'review', detail: job.agent?.name || undefined }
    return { label: roleLabel(role), tone: 'working', detail: job.agent?.name || undefined }
  }
  if (job.status === 'SUCCEEDED') return { label: 'Done by agent', tone: 'done', detail: roleLabel(job.role) }
  if (job.status === 'BLOCKED') return { label: 'Blocked', tone: 'blocked', detail: job.error || undefined }
  if (job.status === 'FAILED' || job.status === 'TIMED_OUT' || job.status === 'CANCELLED') return { label: 'Failed', tone: 'failed', detail: job.error || job.status }
  return null
}

export function getTaskAutomationBadge(automation: ProjectAutomationOverview | null | undefined, taskId: string): TaskAutomationBadge | null {
  if (!automation) return null
  const openBlocker = latestByCreatedAt((automation.blockers ?? []).filter((item: BlockerSummary) => item.taskId === taskId && item.status === 'OPEN'))
  if (openBlocker) return { label: 'Blocked', tone: 'blocked', detail: openBlocker.summary }

  const pendingApproval = latestByCreatedAt((automation.approvalRequests ?? []).filter((item: ApprovalRequestSummary) => item.taskId === taskId && item.status === 'PENDING'))
  if (pendingApproval) return { label: 'Waiting for approval', tone: 'approval', detail: pendingApproval.question }

  const activeJob = latestByCreatedAt((automation.jobs ?? []).filter((job) => job.taskId === taskId && ['RUNNING', 'CLAIMED', 'QUEUED'].includes(job.status)))
  const activeBadge = activeJob ? badgeForJob(activeJob) : null
  if (activeBadge) return activeBadge

  const recentTerminalJob = latestByCreatedAt((automation.jobs ?? []).filter((job) => job.taskId === taskId && ['SUCCEEDED', 'FAILED', 'BLOCKED', 'TIMED_OUT', 'CANCELLED'].includes(job.status)))
  return recentTerminalJob ? badgeForJob(recentTerminalJob) : null
}

export function automationBadgeStyle(tone: TaskAutomationBadge['tone']): { background: string; color: string } {
  if (tone === 'queued') return { background: '#fef3c7', color: '#92400e' }
  if (tone === 'working') return { background: '#dbeafe', color: '#1d4ed8' }
  if (tone === 'approval') return { background: '#ffedd5', color: '#9a3412' }
  if (tone === 'blocked') return { background: '#fee2e2', color: '#991b1b' }
  if (tone === 'review') return { background: '#ede9fe', color: '#5b21b6' }
  if (tone === 'done') return { background: '#dcfce7', color: '#166534' }
  return { background: '#fee2e2', color: '#991b1b' }
}

export function projectWorkflowSummary(automation: ProjectAutomationOverview | null | undefined) {
  const jobs = automation?.jobs ?? []
  const projectJobs = jobs.filter((job) => !job.taskId)
  const active = latestByCreatedAt(projectJobs.filter((job) => ['RUNNING', 'CLAIMED', 'QUEUED'].includes(job.status)))
  const latest = active ?? latestByCreatedAt(projectJobs)
  const config = automation?.config ?? null
  return {
    state: config?.automationState ?? 'not configured',
    phase: config?.currentStage ?? 'INTAKE',
    nextRole: roleLabel(config?.nextRole),
    activeJob: latest,
    activeLabel: latest ? (badgeForJob(latest)?.label ?? latest.status) : null,
    enabled: config?.workflowEnabled ?? false,
    connectionCount: (automation?.connections ?? []).filter((connection) => !connection.revokedAt && connection.status !== 'REVOKED').length,
    openBlockers: (automation?.blockers ?? []).filter((blocker) => blocker.status === 'OPEN').length,
    pendingApprovals: (automation?.approvalRequests ?? []).filter((approval) => approval.status === 'PENDING').length,
  }
}
