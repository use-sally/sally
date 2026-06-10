'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectAutomationOverview } from '@sally/types/src'
import { useQueryClient } from '@tanstack/react-query'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { type ProjectIslandView, ProjectTabs } from '../../../components/project-tabs'
import { TimesheetsTable } from '../../../components/timesheets-table'
import { ProjectAutomationPanel } from '../../../components/project-automation-panel'
import { ProjectAutomationControls } from '../../../components/project-automation-controls'
import { ProjectTasksTable } from '../../../components/project-tasks-table'
import { TaskBoard } from '../../../components/task-board'
import { TaskModal } from '../../../components/task-modal'
import { SectionHeaderWithInfo } from '../../../components/info-flag'
import { MarkdownDescriptionEditor } from '../../../components/markdown-description-editor'
import { TaskDescriptionRender } from '../../../components/task-description-render'
import { addProjectMember, archiveProject, deleteProject, getProjectActivity, getProjectMembers, inviteWorkspaceMember, removeProjectMember, updateProject, updateProjectMember, uploadProjectDescriptionImage, type InviteResponse } from '../../../lib/api'
import { getWorkspaceId, loadSession, setWorkspaceId } from '../../../lib/auth'
import { qk, useBoardQuery, useClientsQuery, useProjectAutomationQuery, useProjectQuery } from '../../../lib/query'
import { projectWorkflowSummary } from '../../../lib/task-automation'
import { archiveTextAction, deleteTextAction, labelText, projectInputField } from '../../../lib/theme'
import { projectRoleOptions } from '../../../lib/roles'
import { workspaceProjectPath } from '../../../lib/routes'
import { canChangeProjectClient, canChangeProjectMemberRole, canEditProject, canInviteProjectMember, canManageProjectWorkflow, canRemoveProjectMember } from '../../../lib/permissions'

function formatActivityActor(event: { actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null; actorMcpKeyLabel: string | null }) {
  const actor = event.actorName || event.actorEmail || 'System'
  if (event.actorApiKeyLabel) return `${actor} · API key: ${event.actorApiKeyLabel}`
  if (event.actorMcpKeyLabel) return `${actor} · MCP key: ${event.actorMcpKeyLabel}`
  return actor
}

function formatActivityTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

function agentWorkflowFingerprint(automation: ProjectAutomationOverview | null | undefined) {
  if (!automation) return ''
  return JSON.stringify({
    config: {
      automationState: automation.config?.automationState ?? null,
      currentStage: automation.config?.currentStage ?? null,
      nextRole: automation.config?.nextRole ?? null,
      workflowEnabled: automation.config?.workflowEnabled ?? null,
    },
    jobs: (automation.jobs ?? []).map((job: any) => ({
      id: job.id,
      taskId: job.taskId ?? null,
      status: job.status,
      role: job.role ?? null,
      updatedAt: job.updatedAt ?? null,
      createdAt: job.createdAt ?? null,
      error: job.error ?? null,
    })),
    blockers: (automation.blockers ?? []).map((blocker: any) => ({
      id: blocker.id,
      taskId: blocker.taskId ?? null,
      status: blocker.status,
      updatedAt: blocker.updatedAt ?? null,
      createdAt: blocker.createdAt ?? null,
    })),
    approvals: (automation.approvalRequests ?? []).map((approval: any) => ({
      id: approval.id,
      taskId: approval.taskId ?? null,
      status: approval.status,
      updatedAt: approval.updatedAt ?? null,
      createdAt: approval.createdAt ?? null,
    })),
  })
}

function projectMemberRoleLabel(member: { role: string; workspaceRole?: string | null; platformRole?: string | null }) {
  return member.platformRole === 'SUPERADMIN'
    ? 'Superadmin'
    : member.platformRole === 'ADMIN'
      ? 'Admin'
      : member.workspaceRole === 'OWNER'
      ? 'Workspace owner'
      : member.role === 'OWNER'
        ? 'Project owner'
        : member.role === 'VIEWER'
          ? 'Project viewer'
          : member.role
}

function projectRoleRank(role?: string | null) {
  return role === 'OWNER' ? 3 : role === 'MEMBER' ? 2 : role === 'VIEWER' ? 1 : 0
}

function inviteLinkFromResponse(response: InviteResponse) {
  if (response.inviteUrl) return response.inviteUrl
  if (response.invitePath && typeof window !== 'undefined') return `${window.location.origin}${response.invitePath}`
  if (response.inviteToken && typeof window !== 'undefined') return `${window.location.origin}/accept-invite?token=${encodeURIComponent(response.inviteToken)}`
  return null
}

async function copyTextToClipboard(value: string) {
  await navigator.clipboard?.writeText(value)
}

async function compressImageForProject(file: File): Promise<{ mimeType: string; base64: string; fileName: string }> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUrl
    })

    const maxLongSide = 1600
    const longSide = Math.max(image.width, image.height)
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)

    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = mimeType === 'image/png' ? undefined : 0.82
    const dataUrl = canvas.toDataURL(mimeType, quality)
    const base64 = dataUrl.split(',')[1] || ''
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'reference'
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    return { mimeType, base64, fileName: `${baseName}.${ext}` }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function ProjectMemberAvatar({ member, canEditRole, canRemove, onChangeRole, onRemove, roleSaving }: { member: { id: string; accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; workspaceRole?: string | null; platformRole?: string | null; locked?: boolean }; canEditRole: boolean; canRemove: boolean; onChangeRole: (membershipId: string, role: string) => void; onRemove: (membershipId: string, memberLabel: string) => void; roleSaving: boolean }) {
  const [open, setOpen] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const label = projectMemberRoleLabel(member)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setRoleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} data-project-member-person="true" style={{ position: 'relative' }}>
      <button
        type="button"
        data-project-member-avatar-trigger="true"
        aria-label={`Open project member details for ${member.name || member.email}`}
        title={member.name || member.email}
        onClick={() => setOpen((value) => !value)}
        style={memberAvatarButton}
      >
        <AssigneeAvatar name={member.name || member.email} avatarUrl={member.avatarUrl} size={28} />
      </button>
      {open ? (
        <div style={memberPopover}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{member.name || '—'}</div>
          <div style={{ fontSize: 'var(--font-12)', color: 'var(--text-muted)', marginTop: 2 }}>{member.email}</div>
          <div style={{ marginTop: 8, position: 'relative' }}>
            {canEditRole && !member.locked ? (
              <>
                <button type="button" onClick={() => setRoleMenuOpen((value) => !value)} style={memberRoleTrigger}>
                  {label}
                </button>
                {roleMenuOpen ? (
                  <div style={memberRoleMenu}>
                    {projectRoleOptions.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => {
                          setRoleMenuOpen(false)
                          onChangeRole(member.id, role.value)
                        }}
                        disabled={roleSaving}
                        style={{ ...memberRoleOption, fontWeight: member.role === role.value ? 700 : 400 }}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={memberRoleStatic}>{label}</div>
            )}
            {canRemove ? (
              <button
                type="button"
                onClick={() => onRemove(member.id, member.name || member.email)}
                disabled={roleSaving}
                style={memberRemoveText}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ArchivedProjectTimesheets({ entries }: { entries: { id: string; userName: string; taskTitle: string | null; date: string; minutes: number; description: string | null; billable: boolean; validated: boolean }[] }) {
  if (!entries.length) return <div style={{ color: 'var(--text-muted)' }}>No timesheets in this archived project.</div>

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {entries.map((entry) => (
        <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: 14, background: 'var(--form-bg)', minWidth: 0 }}>
          <div>{String(entry.date).slice(0, 10)}</div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{entry.taskTitle || 'Project only'}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>{entry.userName}</div>
          </div>
          <div style={{ fontWeight: 700 }}>{entry.minutes} min</div>
          <div><span style={pill(entry.billable ? '#ecfeff' : 'var(--form-bg)', entry.billable ? '#155e75' : 'var(--text-secondary)')}>{entry.billable ? 'Billable' : 'Non-billable'}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}>{entry.description || '—'}</div>
        </div>
      ))}
    </div>
  )
}

export default function ProjectDetailPage({ params }: { params: Promise<{ workspaceId?: string; projectId: string }> }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const archivedParam = searchParams.get('archived') === 'true'
  const rawView = searchParams.get('view')
  const currentView: ProjectIslandView = rawView === 'automation' || rawView === 'board' || rawView === 'timesheets' ? rawView : 'tasks'
  const taskId = searchParams.get('task') || ''
  const [projectId, setProjectId] = useState<string>('')
  const [activity, setActivity] = useState<{ id: string; type: string; summary: string; actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null; actorMcpKeyLabel: string | null; details: string[]; createdAt: string }[]>([])
  const [members, setMembers] = useState<{ id: string; accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; createdAt: string; locked?: boolean; workspaceRole?: string | null; platformRole?: string | null }[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [memberInviteMode, setMemberInviteMode] = useState(false)
  const [memberActionSaving, setMemberActionSaving] = useState(false)
  const [memberActionInfo, setMemberActionInfo] = useState<string | null>(null)
  const [memberInviteLink, setMemberInviteLink] = useState<string | null>(null)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [clientSaving, setClientSaving] = useState(false)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [editingProjectDescription, setEditingProjectDescription] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState('')
  const [projectHeaderSaving, setProjectHeaderSaving] = useState(false)
  const [projectDangerSaving, setProjectDangerSaving] = useState<'archive' | 'delete' | null>(null)
  const [workflowRefreshNotice, setWorkflowRefreshNotice] = useState<string | null>(null)
  const [boardSearch, setBoardSearch] = useState('')
  const [boardStatus, setBoardStatus] = useState('')
  const [boardAssignee, setBoardAssignee] = useState('')
  const [boardLabel, setBoardLabel] = useState('')
  const workflowFingerprintRef = useRef<string | null>(null)
  const clientPickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void params.then((p) => {
      if (p.workspaceId) setWorkspaceId(p.workspaceId)
      setProjectId(p.projectId)
    })
  }, [params])

  useEffect(() => {
    if (!clientPickerOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (clientPickerRef.current && !clientPickerRef.current.contains(event.target as Node)) setClientPickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [clientPickerOpen])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const load = async () => {
      try {
        const requests = [getProjectActivity(projectId), getProjectMembers(projectId)] as const
        const [events, projectMembers] = await Promise.all(requests)
        if (!cancelled) {
          setActivity(events)
          setMembers(projectMembers)
        }
      } catch {
        if (!cancelled) {
          setActivity([])
          setMembers([])
        }
      }
    }

    void load()
    const interval = window.setInterval(() => { void load() }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [projectId])

  const { data: project, error, isLoading: projectLoading } = useProjectQuery(projectId, { archived: archivedParam })
  const { data: clients = [] } = useClientsQuery()
  const { data: automationOverview } = useProjectAutomationQuery(projectId)
  const { data: boardColumns = [], error: boardError, isLoading: boardLoading } = useBoardQuery(projectId)
  const workflowSummary = projectWorkflowSummary(automationOverview)
  const workflowFingerprint = agentWorkflowFingerprint(automationOverview)

  useEffect(() => {
    if (!projectId || !workflowFingerprint) return
    if (workflowFingerprintRef.current === null) {
      workflowFingerprintRef.current = workflowFingerprint
      return
    }
    if (workflowFingerprintRef.current === workflowFingerprint) return
    workflowFingerprintRef.current = workflowFingerprint

    void Promise.all([
      qc.invalidateQueries({ queryKey: ['projectTasks', projectId], exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId, archivedParam) }),
      taskId ? qc.invalidateQueries({ queryKey: qk.task(taskId) }) : Promise.resolve(),
    ])
    setWorkflowRefreshNotice('Agent workflow changed. Tasks and board refreshed.')
    const timeout = window.setTimeout(() => setWorkflowRefreshNotice(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [archivedParam, projectId, qc, taskId, workflowFingerprint])

  useEffect(() => {
    if (!project) return
    setProjectNameDraft(project.name)
    setProjectDescriptionDraft(project.description || '')
  }, [project])
  const session = loadSession()
  const taskOptions = project?.recentTasks.map((task) => ({ id: task.id, title: task.title })) ?? []
  const boardAssigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    members.forEach((member) => {
      const value = member.name || member.email
      const label = member.name?.trim() ? `${member.name} (${member.email})` : member.email
      if (value) map.set(value, label)
      if (member.email) map.set(member.email, label)
    })
    boardColumns.flatMap((column) => column.cards).forEach((task) => {
      const people = [task.owner, task.assignee, ...task.participants.map((participant) => participant.name), ...task.collaborators.map((collaborator) => collaborator.name)]
      people.filter(Boolean).forEach((name) => map.set(name, map.get(name) || name))
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [boardColumns, members])
  const filteredBoardColumns = useMemo(() => {
    const query = boardSearch.trim().toLowerCase()
    const labelQuery = boardLabel.trim().toLowerCase()
    return boardColumns.map((column) => ({
      ...column,
      cards: column.cards.filter((task) => {
        if (boardStatus) {
          const negated = boardStatus.startsWith('!')
          const value = negated ? boardStatus.slice(1) : boardStatus
          const matchesStatus = task.status === value
          if (negated ? matchesStatus : !matchesStatus) return false
        }
        if (boardAssignee) {
          const people = [task.owner, task.assignee, ...task.participants.map((participant) => participant.name), ...task.collaborators.map((collaborator) => collaborator.name)]
          if (!people.includes(boardAssignee)) return false
        }
        if (labelQuery && !task.labels.some((label) => label.toLowerCase().includes(labelQuery))) return false
        if (query) {
          const haystack = [task.title, task.description, task.owner, task.assignee, task.status, ...task.labels].join(' ').toLowerCase()
          if (!haystack.includes(query)) return false
        }
        return true
      }),
    }))
  }, [boardAssignee, boardColumns, boardLabel, boardSearch, boardStatus])
  const currentAccountId = session?.account?.id ?? null
  const currentMember = members.find((member) => member.accountId === currentAccountId)
  const currentWorkspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const permissionViewer = {
    accountId: currentAccountId,
    platformRole: session?.account?.platformRole ?? null,
    workspaceRole: currentWorkspaceRole,
    projectRole: currentMember?.role ?? null,
  }
  const permissionContext = {
    archived: archivedParam,
    projectOwnerCount: members.filter((member) => member.role === 'OWNER').length,
  }
  const projectEditDecision = canEditProject(permissionViewer, permissionContext)
  const clientChangeDecision = canChangeProjectClient(permissionViewer, permissionContext)
  const workflowDecision = canManageProjectWorkflow(permissionViewer, permissionContext)
  const inviteMemberDecision = canInviteProjectMember(permissionViewer, permissionContext)

  const refreshProjectPage = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.project(projectId, archivedParam) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      qc.invalidateQueries({ queryKey: qk.clients }),
    ])
  }

  const handleClientChange = async (clientId: string) => {
    if (!project || clientSaving) return
    try {
      setClientSaving(true)
      setClientPickerOpen(false)
      await updateProject(projectId, {
        name: project.name,
        description: project.description || '',
        clientId: clientId || null,
      })
      await refreshProjectPage()
    } finally {
      setClientSaving(false)
    }
  }

  const saveProjectHeader = async (patch: { name?: string; description?: string }) => {
    if (!project || projectHeaderSaving) return
    try {
      setProjectHeaderSaving(true)
      await updateProject(projectId, {
        name: patch.name ?? project.name,
        description: patch.description ?? (project.description || ''),
        clientId: project.client?.id ?? null,
      })
      await refreshProjectPage()
    } finally {
      setProjectHeaderSaving(false)
    }
  }

  const saveProjectDescription = async (nextDescription: string) => {
    if (!project || nextDescription === (project.description || '')) return
    setProjectDescriptionDraft(nextDescription)
    await saveProjectHeader({ description: nextDescription })
  }

  const handleProjectDescriptionImageUpload = async (file: File) => {
    if (!project || !projectEditDecision.allowed) return null
    setProjectHeaderSaving(true)
    try {
      const compressed = await compressImageForProject(file)
      const uploaded = await uploadProjectDescriptionImage(project.id, compressed)
      const alt = file.name.replace(/\.[^.]+$/, '') || 'reference'
      return { url: uploaded.url, alt }
    } finally {
      setProjectHeaderSaving(false)
    }
  }

  const refreshMembers = async () => {
    const projectMembers = await getProjectMembers(projectId)
    setMembers(projectMembers)
  }

  const handleInviteProjectMember = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || memberActionSaving) return
    try {
      setMemberActionSaving(true)
      setMemberActionError(null)
      setMemberActionInfo(null)
      setMemberInviteLink(null)
      const inviteResponse = await inviteWorkspaceMember({ email, role: 'MEMBER' })
      await addProjectMember(projectId, { email, role: inviteRole })
      await refreshMembers()
      setInviteEmail('')
      setInviteRole('MEMBER')
      setMemberInviteMode(false)
      const inviteLink = inviteLinkFromResponse(inviteResponse)
      setMemberInviteLink(inviteLink)
      setMemberActionInfo(inviteResponse.emailed ? 'Invite sent. User will join the workspace and this project.' : inviteLink ? 'Invite created. Copy and share the link with the user.' : 'Invite created, but no email was sent. Check SMTP configuration.')
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : 'Failed to invite project member')
    } finally {
      setMemberActionSaving(false)
    }
  }

  const handleProjectRoleChange = async (membershipId: string, role: string) => {
    try {
      setMemberActionSaving(true)
      setMemberActionError(null)
      setMemberActionInfo(null)
      setMemberInviteLink(null)
      await updateProjectMember(projectId, membershipId, { role })
      await refreshMembers()
      setMemberActionInfo('Project role updated.')
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : 'Failed to update project role')
    } finally {
      setMemberActionSaving(false)
    }
  }

  const handleRemoveProjectMember = async (membershipId: string, memberLabel: string) => {
    if (!window.confirm(`Remove ${memberLabel} from this project?`)) return
    try {
      setMemberActionSaving(true)
      setMemberActionError(null)
      setMemberActionInfo(null)
      setMemberInviteLink(null)
      await removeProjectMember(projectId, membershipId)
      await refreshMembers()
      setMemberActionInfo('Project member removed.')
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : 'Failed to remove project member')
    } finally {
      setMemberActionSaving(false)
    }
  }

  const handleArchiveProject = async () => {
    if (!window.confirm('Archive this project?')) return
    try {
      setProjectDangerSaving('archive')
      await archiveProject(projectId, true)
      router.push('/projects')
      router.refresh()
    } finally {
      setProjectDangerSaving(null)
    }
  }

  const handleDeleteProject = async () => {
    if (!window.confirm('Delete this project permanently?')) return
    try {
      setProjectDangerSaving('delete')
      await deleteProject(projectId)
      router.push('/projects')
      router.refresh()
    } finally {
      setProjectDangerSaving(null)
    }
  }

  const projectTitle = projectEditDecision.visible ? '' : (project?.name ?? 'Project')
  const projectSubtitle = projectEditDecision.visible ? '' : (project?.description || 'Project overview and recent work.')

  return (
    <AppShell title={projectTitle} subtitle={projectSubtitle}>
      {project ? (
        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
          <div style={projectHeaderGrid}>
            <div style={{ minWidth: 0 }}>
              {projectEditDecision.visible ? (
                editingProjectName ? (
                  <input
                    autoFocus
                    value={projectNameDraft}
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                    onBlur={() => {
                      setEditingProjectName(false)
                      if (projectNameDraft.trim() && projectNameDraft.trim() !== project.name) void saveProjectHeader({ name: projectNameDraft.trim() })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                      if (event.key === 'Escape') {
                        setProjectNameDraft(project.name)
                        setEditingProjectName(false)
                      }
                    }}
                    disabled={projectHeaderSaving}
                    style={projectHeaderNameInput}
                  />
                ) : (
                  <button type="button" onClick={() => setEditingProjectName(true)} style={projectHeaderNameButton}>{project.name}</button>
                )
              ) : (
                <div style={projectHeaderNameText}>{project.name}</div>
              )}

              {projectEditDecision.visible ? (
                editingProjectDescription ? (
                  <div data-project-description-editor="true" style={{ marginTop: 8 }}>
                    <MarkdownDescriptionEditor
                      autoFocus={true}
                      commitOnOutsideClick={true}
                      value={projectDescriptionDraft}
                      onCommit={(nextValue) => {
                        if (!projectEditDecision.allowed) return
                        setEditingProjectDescription(false)
                        void saveProjectDescription(nextValue)
                      }}
                      onImageUpload={(file) => projectEditDecision.allowed ? handleProjectDescriptionImageUpload(file) : Promise.resolve(null)}
                      busy={projectHeaderSaving}
                    />
                    {projectHeaderSaving ? <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>Saving…</div> : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    data-project-description-preview="true"
                    onClick={() => {
                      setProjectDescriptionDraft(project.description || '')
                      setEditingProjectDescription(true)
                    }}
                    style={projectHeaderDescriptionButton}
                    title="Click to edit description"
                  >
                    {project.description ? <TaskDescriptionRender description={project.description || ''} /> : 'Project overview and recent work.'}
                  </button>
                )
              ) : (
                <div style={projectHeaderDescriptionText}>{project.description ? <TaskDescriptionRender description={project.description || ''} /> : 'Project overview and recent work.'}</div>
              )}
            </div>

            <div data-project-meta-stack="true" style={{ display: 'grid', gap: 14, alignContent: 'start', justifyItems: 'end', minWidth: 0 }}>
              <section data-project-client-section="true" style={{ display: 'grid', gap: 6, justifyItems: 'end', textAlign: 'right', minWidth: 0 }}>
                <div style={labelText}>Client</div>
                {!clientChangeDecision.visible || archivedParam ? (
                  <div data-project-client-person="true" style={{ position: 'relative', width: 'fit-content' }}>
                    <button
                      type="button"
                      data-project-client-avatar-trigger="true"
                      aria-label={`Project client: ${project.client ? project.client.name : 'No client / internal'}`}
                      title={project.client ? project.client.name : 'No client / internal'}
                      style={clientAvatarButton}
                      disabled
                    >
                      <span style={clientInitialAvatar}>{project.client ? project.client.name.slice(0, 1).toUpperCase() : '–'}</span>
                    </button>
                  </div>
                ) : (
                  <div ref={clientPickerRef} data-project-client-picker="true" style={{ position: 'relative', width: 'fit-content', maxWidth: '100%' }}>
                    <button
                      type="button"
                      data-project-client-person="true"
                      data-project-client-avatar-trigger="true"
                      aria-label={`Choose project client. Current client: ${project.client ? project.client.name : 'No client / internal'}`}
                      title={project.client ? project.client.name : 'No client / internal'}
                      onClick={() => setClientPickerOpen((value) => !value)}
                      disabled={clientSaving || !clientChangeDecision.allowed}
                      style={clientAvatarButton}
                    >
                      <span style={clientInitialAvatar}>{project.client ? project.client.name.slice(0, 1).toUpperCase() : '–'}</span>
                    </button>
                    {clientPickerOpen && clientChangeDecision.allowed ? (
                      <div style={clientPickerMenu}>
                        <div style={{ padding: '5px 8px 7px', color: 'var(--text-muted)', fontSize: 'var(--font-11)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Client</div>
                        <button
                          type="button"
                          onClick={() => void handleClientChange('')}
                          disabled={clientSaving || !project.client}
                          style={{ ...clientPickerOption, fontWeight: project.client ? 650 : 800 }}
                        >
                          <span style={clientOptionInitial}>–</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>No client / internal</span>
                        </button>
                        {clients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => void handleClientChange(client.id)}
                            disabled={clientSaving || project.client?.id === client.id}
                            style={{ ...clientPickerOption, fontWeight: project.client?.id === client.id ? 800 : 650 }}
                          >
                            <span style={clientOptionInitial}>{client.name.slice(0, 1).toUpperCase()}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              <section data-project-members-section="true" style={{ display: 'grid', gap: 8, justifyItems: 'end', textAlign: 'right', minWidth: 0 }}>
                <div style={labelText}>Project members</div>
                <div data-project-members-list="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                  {members.length ? members.map((member) => {
                    const roleDecision = canChangeProjectMemberRole(permissionViewer, member, permissionContext)
                    const removeDecision = canRemoveProjectMember(permissionViewer, member, permissionContext)
                    return (
                      <ProjectMemberAvatar
                        key={member.accountId}
                        member={member}
                        canEditRole={roleDecision.visible}
                        canRemove={removeDecision.visible}
                        onChangeRole={handleProjectRoleChange}
                        onRemove={handleRemoveProjectMember}
                        roleSaving={memberActionSaving}
                      />
                    )
                  }) : <span style={{ color: 'var(--text-muted)' }}>No members</span>}
                  {inviteMemberDecision.visible ? (
                    <div style={{ position: 'relative' }}>
                      {memberInviteMode ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={memberActionSaving} style={memberRoleSelect} aria-label="Project role for invited member">
                            {projectRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                          <input
                            autoFocus
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            onBlur={() => { if (!memberActionSaving && !inviteEmail.trim()) setMemberInviteMode(false) }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void handleInviteProjectMember()
                              }
                              if (event.key === 'Escape') {
                                setInviteEmail('')
                                setInviteRole('MEMBER')
                                setMemberInviteMode(false)
                              }
                            }}
                            placeholder="add email address to invite"
                            style={memberAddInput}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-project-member-add-trigger="true"
                          aria-label="Add project member by email"
                          title="Add project member by email"
                          onClick={() => setMemberInviteMode(true)}
                          disabled={memberActionSaving || !inviteMemberDecision.allowed}
                          style={memberAddButton}
                        >+</button>
                      )}
                    </div>
                  ) : null}
                </div>
                {memberActionInfo ? <div style={{ color: '#34d399', fontSize: 'var(--font-12)' }}>{memberActionInfo}</div> : null}
                {memberInviteLink ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', fontSize: 'var(--font-12)' }}>
                    <code style={{ color: 'var(--text-secondary)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{memberInviteLink}</code>
                    <button type="button" onClick={() => void copyTextToClipboard(memberInviteLink).then(() => setMemberActionInfo('Invite link copied.'))} style={memberCopyButton}>Copy link</button>
                  </div>
                ) : null}
                {memberActionError ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-12)' }}>{memberActionError}</div> : null}
              </section>

              {projectEditDecision.visible ? (
                <div data-project-danger-actions="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                  <button onClick={() => void handleArchiveProject()} disabled={projectDangerSaving !== null} style={archiveHeaderButton}>{projectDangerSaving === 'archive' ? 'Archiving…' : 'Archive'}</button>
                  <button onClick={() => void handleDeleteProject()} disabled={projectDangerSaving !== null} style={deleteHeaderButton}>{projectDangerSaving === 'delete' ? 'Deleting…' : 'Delete'}</button>
                </div>
              ) : null}
            </div>
          </div>
          <div data-project-island-toolbar="true" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <ProjectTabs projectId={projectId} current={currentView} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {workflowDecision.visible ? (
                <div data-project-workflow-toolbar="true" style={{ display: 'grid', gap: 6, justifyItems: 'end', minWidth: 0 }}>
                  <ProjectAutomationControls projectId={projectId} canManage={workflowDecision.allowed} compact />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={pill('var(--form-bg)', 'var(--text-secondary)')}>Listening for agent changes</span>
                    <span style={pill('var(--form-bg)', 'var(--text-secondary)')}>{workflowSummary.phase}</span>
                    {workflowSummary.activeLabel ? <span style={pill('#dbeafe', '#1d4ed8')}>{workflowSummary.activeLabel}</span> : null}
                    {workflowSummary.pendingApprovals ? <span style={pill('#ffedd5', '#9a3412')}>{workflowSummary.pendingApprovals} approval</span> : null}
                    {workflowSummary.openBlockers ? <span style={pill('#fee2e2', '#991b1b')}>{workflowSummary.openBlockers} blocker</span> : null}
                    {workflowRefreshNotice ? <span role="status" aria-live="polite" style={pill('#dcfce7', '#166534')}>{workflowRefreshNotice}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : projectId ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <ProjectTabs projectId={projectId} current={currentView} />
        </div>
      ) : null}
      {archivedParam ? <div style={{ ...panel, border: '1px dashed var(--panel-border)', color: 'var(--text-secondary)', marginBottom: 18 }}>This project is archived. Restore it from the Projects list to resume work.</div> : null}

      {project ? (
        <>
          {project.dependencies?.length || project.dependedOnBy?.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16, marginBottom: 20, alignItems: 'stretch', minWidth: 0 }}>
              <div style={{ ...panel, ...summaryCardPanel, display: 'grid', alignContent: 'start', gap: 8 }}>
                {project.dependencies?.length ? (
                  <div>
                    <div style={labelText}>Depends on</div>
                    <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>
                      {project.dependencies.map((dep: { projectId: string; name: string }) => (
                        <a key={dep.projectId} href={workspaceProjectPath(getWorkspaceId(), dep.projectId)} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: 'var(--font-13)', fontWeight: 600 }}>{dep.name}</a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {project.dependedOnBy?.length ? (
                  <div>
                    <div style={labelText}>Blocks</div>
                    <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>
                      {project.dependedOnBy.map((dep: { projectId: string; name: string }) => (
                        <a key={dep.projectId} href={workspaceProjectPath(getWorkspaceId(), dep.projectId)} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: 'var(--font-13)', fontWeight: 600 }}>{dep.name}</a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 20 }}>

            {currentView === 'automation' ? (
              workflowDecision.visible ? (
                <ProjectAutomationPanel projectId={projectId} canManage={workflowDecision.allowed} />
              ) : (
                <div style={panel}>
                  <div style={{ fontWeight: 750 }}>Agent automation</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-13)', marginTop: 6 }}>Agent automation is not available for your current project role.</div>
                </div>
              )
            ) : currentView === 'timesheets' ? (
              <div style={panel}>
                <SectionHeaderWithInfo
                  title="Timesheets"
                  info="Validated entries are hidden by default. Turn this on to review them and uncheck validation to restore them."
                  marginBottom={14}
                />
                {archivedParam ? <ArchivedProjectTimesheets entries={project.recentTimesheets} /> : <TimesheetsTable lockedProjectId={projectId} lockedProjectName={project.name} taskOptions={taskOptions} showProjectColumn={false} showCustomerColumn={false} />}
              </div>
            ) : (
              <>
                <div style={panel}>
                  {currentView === 'board' ? (
                    boardError ? <div style={{ color: 'var(--danger-text)' }}>{boardError instanceof Error ? boardError.message : 'Failed to load board'}</div> : (
                      <div style={{ display: 'grid', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 12 }}>
                          <input value={boardSearch} onChange={(event) => setBoardSearch(event.target.value)} placeholder="Search tasks" style={projectInputField} />
                          <select value={boardStatus} onChange={(event) => setBoardStatus(event.target.value)} style={projectInputField}>
                            <option value="">All statuses</option>
                            {(project?.statuses || []).flatMap((statusOption) => [
                              <option key={statusOption.id} value={statusOption.name}>{statusOption.name}</option>,
                              <option key={`${statusOption.id}-not`} value={`!${statusOption.name}`}>{`Not ${statusOption.name}`}</option>,
                            ])}
                          </select>
                          <select value={boardAssignee} onChange={(event) => setBoardAssignee(event.target.value)} style={projectInputField}>
                            <option value="">All people</option>
                            {boardAssigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <input value={boardLabel} onChange={(event) => setBoardLabel(event.target.value)} placeholder="Filter by label" style={projectInputField} />
                        </div>
                        {boardColumns.length ? <TaskBoard columns={filteredBoardColumns} taskBaseHref={workspaceProjectPath(getWorkspaceId(), projectId)} projectId={projectId} canReorderStatuses={workflowDecision.allowed} canManageStatuses={workflowDecision.allowed} automationOverview={automationOverview} /> : <div style={{ color: 'var(--text-muted)' }}>{boardLoading ? 'Loading board…' : 'No tasks yet.'}</div>}
                      </div>
                    )
                  ) : (
                    <ProjectTasksTable projectId={projectId} automationOverview={automationOverview} canManageStatuses={workflowDecision.allowed} />
                  )}
                </div>

                <div style={panel}>
                  <SectionHeaderWithInfo
                    title="Recent activity"
                    info="Live project log. Shows the latest 100 events with actor, API key usage, and timestamp."
                    marginBottom={14}
                  />
                  {activity.length ? (
                    <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)' }}>
                      {[...activity].reverse().map((event, index, items) => (
                        <div key={event.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, alignItems: 'start', padding: '10px 12px', borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--panel-border)', fontSize: 'var(--font-13)', lineHeight: 1.45, minWidth: 0 }}>
                          <div style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatActivityTimestamp(event.createdAt)}</div>
                          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatActivityActor(event)}</div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ color: 'var(--text-primary)' }}>{event.summary}</div>
                            {event.details.length ? <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-12)' }}>{event.details.join(' · ')}</div> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: 'var(--text-muted)' }}>No activity recorded yet.</div>}
                </div>
              </>
            )}
          </div>
        </>
      ) : error ? (
        <div style={{ ...panel, border: '1px solid var(--panel-border)', color: 'var(--danger-text)', display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 700 }}>{"This project doesn't exist or you don't have access to it."}</div>
          {error instanceof Error && error.message && error.message !== 'Project not found' ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>{error.message}</div>
          ) : null}
        </div>
      ) : projectLoading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading project…</div>
      ) : (
        <div style={{ color: 'var(--text-muted)' }}>Select a project from the sidebar.</div>
      )}
      {taskId && projectId ? <TaskModal taskId={taskId} projectId={projectId} /> : null}

    </AppShell>
  )
}

const summaryCardPanel: React.CSSProperties = { minHeight: 120, height: '100%' }
const projectHeaderGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 280px)', gap: 16, alignItems: 'start', minWidth: 0 }
const smallActionBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap' }
const memberAvatarButton: React.CSSProperties = { padding: 2, border: '1px solid var(--panel-border)', background: 'var(--form-bg)', cursor: 'pointer', borderRadius: 999, display: 'inline-grid', placeItems: 'center', width: 34, height: 34 }
const clientAvatarButton: React.CSSProperties = { ...memberAvatarButton }
const clientInitialAvatar: React.CSSProperties = { width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontSize: 'var(--font-12)', fontWeight: 800 }
const clientPickerMenu: React.CSSProperties = { position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 240, maxWidth: 'min(320px, calc(100vw - 32px))', display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', textAlign: 'left' }
const clientPickerOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '7px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 'var(--font-12)', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }
const clientOptionInitial: React.CSSProperties = { width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', flex: '0 0 auto', background: 'var(--form-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontSize: 'var(--font-10)', fontWeight: 800 }
const memberPopover: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 20, minWidth: 220, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--form-bg)', boxShadow: 'var(--panel-shadow)', textAlign: 'left' }
const memberRoleTrigger: React.CSSProperties = { marginTop: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 'var(--font-12)', cursor: 'pointer', textDecoration: 'underline', lineHeight: 1.2 }
const memberRoleStatic: React.CSSProperties = { marginTop: 0, fontSize: 'var(--font-12)', color: 'var(--text-secondary)', lineHeight: 1.2 }
const memberRoleMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 140, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const memberRoleOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 'var(--font-12)' }
const memberAddButton: React.CSSProperties = { width: 34, height: 34, padding: 0, border: '1px solid var(--panel-border)', borderRadius: 999, background: 'var(--form-bg)', color: 'var(--heading-text)', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', fontSize: 'var(--font-20)', lineHeight: 1, fontWeight: 700 }
const memberAddInput: React.CSSProperties = { ...projectInputField, width: 220, padding: '6px 10px', fontSize: 'var(--font-12)', fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberRoleSelect: React.CSSProperties = { ...projectInputField, width: 104, padding: '6px 8px', fontSize: 'var(--font-12)', fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberCopyButton: React.CSSProperties = { border: '1px solid var(--panel-border)', borderRadius: 999, background: 'var(--form-bg)', color: 'var(--text-primary)', padding: '4px 8px', fontSize: 'var(--font-12)', cursor: 'pointer' }
const memberRemoveText: React.CSSProperties = { marginTop: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--font-12)', cursor: 'pointer', textAlign: 'left', lineHeight: 1.2 }
const projectHeaderNameText: React.CSSProperties = { fontSize: 'var(--font-30)', fontWeight: 750, color: 'var(--heading-text)', lineHeight: 1.1 }
const projectHeaderNameButton: React.CSSProperties = { ...projectHeaderNameText, display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'text', textAlign: 'left' }
const projectHeaderNameInput: React.CSSProperties = { ...projectInputField, fontSize: 'var(--font-30)', fontWeight: 750, lineHeight: 1.1, padding: '8px 10px' }
const projectHeaderDescriptionText: React.CSSProperties = { marginTop: 8, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.45 }
const projectHeaderDescriptionButton: React.CSSProperties = { ...projectHeaderDescriptionText, display: 'block', width: '100%', maxHeight: 88, overflow: 'hidden', padding: 0, border: 'none', background: 'transparent', cursor: 'text', textAlign: 'left' }
const archiveHeaderButton: React.CSSProperties = { ...archiveTextAction }
const deleteHeaderButton: React.CSSProperties = { ...deleteTextAction }
