'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { ProjectTabs } from '../../../components/project-tabs'
import { StatusSettings } from '../../../components/status-settings'
import { TimesheetsTable } from '../../../components/timesheets-table'
import { ProjectCurrentTasks } from '../../../components/project-current-tasks'
import { addProjectMember, archiveProject, deleteProject, getProjectActivity, getProjectMembers, getWorkspaceMembers, inviteWorkspaceMember, removeProjectMember, updateProject, updateProjectMember } from '../../../lib/api'
import { getWorkspaceId, loadSession } from '../../../lib/auth'
import { qk, useClientsQuery, useProjectQuery } from '../../../lib/query'
import { labelText, projectInputField } from '../../../lib/theme'
import { projectRoleOptions } from '../../../lib/roles'
import { canAddProjectMember, canChangeProjectClient, canChangeProjectMemberRole, canEditProject, canInviteProjectMember, canManageProjectWorkflow, canRemoveProjectMember } from '../../../lib/permissions'

function formatActivityActor(event: { actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null }) {
  const actor = event.actorName || event.actorEmail || 'System'
  return event.actorApiKeyLabel ? `${actor} · API key: ${event.actorApiKeyLabel}` : actor
}

function formatActivityTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

function projectMemberRoleLabel(member: { role: string; workspaceRole?: string | null; platformRole?: string | null }) {
  return member.platformRole === 'SUPERADMIN'
    ? 'Superadmin'
    : member.workspaceRole === 'OWNER'
      ? 'Workspace owner'
      : member.role === 'OWNER'
        ? 'Project owner'
        : member.role
}

function projectRoleRank(role?: string | null) {
  return role === 'OWNER' ? 2 : 1
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
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={memberAvatarButton}>
        <AssigneeAvatar name={member.name || member.email} avatarUrl={member.avatarUrl} size={32} />
      </button>
      {open ? (
        <div style={memberPopover}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{member.name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{member.email}</div>
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
        <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 110px 1.5fr', gap: 10, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: 14, background: 'var(--form-bg)' }}>
          <div>{String(entry.date).slice(0, 10)}</div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{entry.taskTitle || 'Project only'}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{entry.userName}</div>
          </div>
          <div style={{ fontWeight: 700 }}>{entry.minutes} min</div>
          <div><span style={pill(entry.billable ? '#ecfeff' : 'var(--form-bg)', entry.billable ? '#155e75' : 'var(--text-secondary)')}>{entry.billable ? 'Billable' : 'Non-billable'}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}>{entry.description || '—'}</div>
        </div>
      ))}
    </div>
  )
}

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const archivedParam = searchParams.get('archived') === 'true'
  const [projectId, setProjectId] = useState<string>('')
  const [activity, setActivity] = useState<{ id: string; type: string; summary: string; actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null; details: string[]; createdAt: string }[]>([])
  const [members, setMembers] = useState<{ id: string; accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; createdAt: string; locked?: boolean; workspaceRole?: string | null; platformRole?: string | null }[]>([])
  const [workspaceMembers, setWorkspaceMembers] = useState<{ id: string; accountId: string; name: string | null; email: string; role: string }[]>([])
  const [selectedWorkspaceMemberId, setSelectedWorkspaceMemberId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [memberInviteMode, setMemberInviteMode] = useState(false)
  const [memberActionSaving, setMemberActionSaving] = useState(false)
  const [memberActionInfo, setMemberActionInfo] = useState<string | null>(null)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [clientSaving, setClientSaving] = useState(false)
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [editingProjectDescription, setEditingProjectDescription] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState('')
  const [projectHeaderSaving, setProjectHeaderSaving] = useState(false)
  const [projectDangerSaving, setProjectDangerSaving] = useState<'archive' | 'delete' | null>(null)

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const load = async () => {
      try {
        const workspaceId = getWorkspaceId()
        const requests = [getProjectActivity(projectId), getProjectMembers(projectId)] as const
        const [events, projectMembers] = await Promise.all(requests)
        const workspace = workspaceId ? await getWorkspaceMembers(workspaceId).catch(() => []) : []
        if (!cancelled) {
          setActivity(events)
          setMembers(projectMembers)
          setWorkspaceMembers(workspace)
          const projectMemberIds = new Set(projectMembers.map((member) => member.accountId))
          const available = workspace.filter((member) => !projectMemberIds.has(member.accountId))
          setSelectedWorkspaceMemberId((current) => current || available[0]?.accountId || '')
        }
      } catch {
        if (!cancelled) {
          setActivity([])
          setMembers([])
          setWorkspaceMembers([])
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

  const { data: project, error } = useProjectQuery(projectId, { archived: archivedParam })
  const { data: clients = [] } = useClientsQuery()

  useEffect(() => {
    if (!project) return
    setProjectNameDraft(project.name)
    setProjectDescriptionDraft(project.description || '')
  }, [project?.id, project?.name, project?.description])
  const session = loadSession()
  const recentTasks = project?.recentTasks.slice(0, 5) ?? []
  const taskOptions = project?.recentTasks.map((task) => ({ id: task.id, title: task.title })) ?? []
  const availableWorkspaceMembers = workspaceMembers.filter((member) => !members.some((projectMember) => projectMember.accountId === member.accountId))
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
  const addMemberDecision = canAddProjectMember(permissionViewer, permissionContext)
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

  const refreshMembers = async () => {
    const workspaceId = getWorkspaceId()
    const [projectMembers, workspace] = await Promise.all([
      getProjectMembers(projectId),
      workspaceId ? getWorkspaceMembers(workspaceId).catch(() => []) : Promise.resolve([]),
    ])
    setMembers(projectMembers)
    setWorkspaceMembers(workspace)
    const projectMemberIds = new Set(projectMembers.map((member) => member.accountId))
    const available = workspace.filter((member) => !projectMemberIds.has(member.accountId))
    setSelectedWorkspaceMemberId((current) => current && available.some((member) => member.accountId === current) ? current : (available[0]?.accountId || ''))
  }

  const handleAddExistingMember = async (accountId = selectedWorkspaceMemberId) => {
    if (!accountId || memberActionSaving) return
    try {
      setMemberActionSaving(true)
      setMemberActionError(null)
      setMemberActionInfo(null)
      await addProjectMember(projectId, { accountId, role: 'MEMBER' })
      await refreshMembers()
      setMemberPickerOpen(false)
      setSelectedWorkspaceMemberId('')
      setMemberActionInfo('Project member added.')
    } catch (err) {
      setMemberActionError(err instanceof Error ? err.message : 'Failed to add project member')
    } finally {
      setMemberActionSaving(false)
    }
  }

  const handleInviteProjectMember = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || memberActionSaving) return
    try {
      setMemberActionSaving(true)
      setMemberActionError(null)
      setMemberActionInfo(null)
      await inviteWorkspaceMember({ email, role: 'MEMBER' })
      await addProjectMember(projectId, { email, role: 'MEMBER' })
      await refreshMembers()
      setInviteEmail('')
      setMemberInviteMode(false)
      setMemberPickerOpen(false)
      setMemberActionInfo('Invite sent. User will join the workspace and this project.')
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
          <div>
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
                <textarea
                  autoFocus
                  value={projectDescriptionDraft}
                  onChange={(event) => setProjectDescriptionDraft(event.target.value)}
                  onBlur={() => {
                    setEditingProjectDescription(false)
                    if (projectDescriptionDraft !== (project.description || '')) void saveProjectHeader({ description: projectDescriptionDraft })
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                    if (event.key === 'Escape') {
                      setProjectDescriptionDraft(project.description || '')
                      setEditingProjectDescription(false)
                    }
                  }}
                  disabled={projectHeaderSaving}
                  style={projectHeaderDescriptionInput}
                />
              ) : (
                <button type="button" onClick={() => setEditingProjectDescription(true)} style={projectHeaderDescriptionButton}>{project.description || 'Project overview and recent work.'}</button>
              )
            ) : (
              <div style={projectHeaderDescriptionText}>{project.description || 'Project overview and recent work.'}</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <ProjectTabs projectId={projectId} current="overview" />
            {projectEditDecision.visible ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={() => void handleArchiveProject()} disabled={projectDangerSaving !== null} style={archiveHeaderButton}>{projectDangerSaving === 'archive' ? 'Archiving…' : 'Archive'}</button>
                <button onClick={() => void handleDeleteProject()} disabled={projectDangerSaving !== null} style={deleteHeaderButton}>{projectDangerSaving === 'delete' ? 'Deleting…' : 'Delete'}</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : projectId ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <ProjectTabs projectId={projectId} current="overview" />
        </div>
      ) : null}
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load project'}</div> : null}
      {archivedParam ? <div style={{ ...panel, border: '1px dashed var(--panel-border)', color: 'var(--text-secondary)', marginBottom: 18 }}>This project is archived. Restore it from the Projects list to resume work.</div> : null}

      {project ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.4fr) minmax(180px, 0.7fr) minmax(240px, 1fr)', gap: 16, marginBottom: 20, alignItems: 'stretch' }}>
            <div style={{ ...panel, ...summaryCardPanel, display: 'grid', alignContent: 'start', gap: 10 }}>
              <div style={labelText}>Client</div>
              {!clientChangeDecision.visible ? (
                <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>{project.client ? project.client.name : 'Not linked'}</div>
              ) : archivedParam ? (
                <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>{project.client ? project.client.name : 'Not linked'}</div>
              ) : (
                <select
                  value={project.client?.id || ''}
                  onChange={(event) => void handleClientChange(event.target.value)}
                  disabled={clientSaving || !clientChangeDecision.allowed}
                  style={projectInputField}
                >
                  <option value="">No client / internal</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={project.client ? linkedText : unlinkedText}>{project.client ? 'Linked' : 'Unlinked'}</span>
              </div>
            </div>

            <div style={{ ...panel, ...summaryCardPanel, display: 'grid', alignContent: 'start', gap: 8 }}>
              <div style={labelText}>Total tasks</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>{project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}</div>
            </div>

            <div style={{ ...panel, ...summaryCardPanel, display: 'grid', alignContent: 'start', gap: 10 }}>
              <div style={labelText}>Project members</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                }) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                {addMemberDecision.visible || inviteMemberDecision.visible ? (
                  <div style={{ position: 'relative' }}>
                    {memberInviteMode && inviteMemberDecision.visible ? (
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
                            setMemberInviteMode(false)
                            setMemberPickerOpen(false)
                          }
                        }}
                        placeholder="Invite by email"
                        style={memberAddInput}
                      />
                    ) : (
                      <button type="button" onClick={() => setMemberPickerOpen((value) => !value)} style={memberAddButton}>Add member</button>
                    )}
                    {memberPickerOpen && !memberInviteMode && (addMemberDecision.visible || inviteMemberDecision.visible) ? (
                      <div style={memberAddMenu}>
                        {addMemberDecision.visible ? availableWorkspaceMembers.map((member) => (
                          <button
                            key={member.accountId}
                            type="button"
                            onClick={() => {
                              setSelectedWorkspaceMemberId(member.accountId)
                              void handleAddExistingMember(member.accountId)
                            }}
                            disabled={memberActionSaving}
                            style={memberAddOption}
                          >
                            {member.name || member.email}
                          </button>
                        )) : null}
                        {inviteMemberDecision.visible ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMemberInviteMode(true)
                              setMemberPickerOpen(false)
                            }}
                            style={memberAddOption}
                          >
                            Invite by email
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {memberActionInfo ? <div style={{ color: '#34d399', fontSize: 12 }}>{memberActionInfo}</div> : null}
              {memberActionError ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{memberActionError}</div> : null}
            </div>
          </div>

          {workflowDecision.visible ? <div style={{ marginBottom: 24 }}><StatusSettings projectId={projectId} statuses={project.statuses} canManage={workflowDecision.allowed} /></div> : null}

          <div style={{ display: 'grid', gap: 20 }}>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Recent tasks</div>
              <ProjectCurrentTasks project={project} archived={archivedParam} />
            </div>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 8 }}>Recent activity</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>Live project log. Shows the latest 100 events with actor, API key usage, and timestamp.</div>
              {activity.length ? (
                <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)' }}>
                  {[...activity].reverse().map((event, index, items) => (
                    <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '170px minmax(220px, 320px) 1fr', gap: 12, alignItems: 'start', padding: '10px 12px', borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--panel-border)', fontSize: 13, lineHeight: 1.45 }}>
                      <div style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatActivityTimestamp(event.createdAt)}</div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatActivityActor(event)}</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ color: 'var(--text-primary)' }}>{event.summary}</div>
                        {event.details.length ? <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{event.details.join(' · ')}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: 'var(--text-muted)' }}>No activity recorded yet.</div>}
            </div>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Timesheets</div>
              {archivedParam ? <ArchivedProjectTimesheets entries={project.recentTimesheets} /> : <TimesheetsTable lockedProjectId={projectId} lockedProjectName={project.name} taskOptions={taskOptions} showProjectColumn={false} showCustomerColumn={false} />}
            </div>
          </div>
        </>
      ) : <div style={{ color: 'var(--text-muted)' }}>Loading project…</div>}

    </AppShell>
  )
}

const summaryCardPanel: React.CSSProperties = { minHeight: 120, height: '100%' }
const linkedText: React.CSSProperties = { color: '#34d399', fontSize: 14, fontWeight: 400 }
const unlinkedText: React.CSSProperties = { color: 'var(--danger-text)', fontSize: 14, fontWeight: 400 }
const smallActionBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap' }
const memberAvatarButton: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 999 }
const memberPopover: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 20, minWidth: 220, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--form-bg)', boxShadow: 'var(--panel-shadow)' }
const memberRoleTrigger: React.CSSProperties = { marginTop: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', lineHeight: 1.2 }
const memberRoleStatic: React.CSSProperties = { marginTop: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.2 }
const memberRoleMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 140, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const memberRoleOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }
const memberAddButton: React.CSSProperties = { ...projectInputField, width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`, background: 'var(--form-bg)', cursor: 'pointer' }
const memberAddInput: React.CSSProperties = { ...projectInputField, width: 180, padding: '6px 10px', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberAddMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 200, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const memberAddOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '7px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberRemoveText: React.CSSProperties = { marginTop: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', lineHeight: 1.2 }
const projectHeaderNameText: React.CSSProperties = { fontSize: 30, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.1 }
const projectHeaderNameButton: React.CSSProperties = { ...projectHeaderNameText, display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'text', textAlign: 'left' }
const projectHeaderNameInput: React.CSSProperties = { ...projectInputField, fontSize: 30, fontWeight: 750, lineHeight: 1.1, padding: '8px 10px' }
const projectHeaderDescriptionText: React.CSSProperties = { marginTop: 8, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.45 }
const projectHeaderDescriptionButton: React.CSSProperties = { ...projectHeaderDescriptionText, display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'text', textAlign: 'left' }
const projectHeaderDescriptionInput: React.CSSProperties = { ...projectInputField, marginTop: 8, minHeight: 96, resize: 'vertical', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.45 }
const archiveHeaderButton: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }
const deleteHeaderButton: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 13, cursor: 'pointer' }
