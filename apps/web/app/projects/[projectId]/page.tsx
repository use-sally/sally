'use client'

import { useEffect, useState } from 'react'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { useSearchParams } from 'next/navigation'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { EditProjectModal } from '../../../components/edit-project-modal'
import { ProjectTabs } from '../../../components/project-tabs'
import { StatusSettings } from '../../../components/status-settings'
import { TimesheetsTable } from '../../../components/timesheets-table'
import { ProjectCurrentTasks } from '../../../components/project-current-tasks'
import { getProjectActivity, getProjectMembers } from '../../../lib/api'
import { useProjectQuery } from '../../../lib/query'

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

function ProjectMemberAvatar({ member }: { member: { accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; workspaceRole?: string | null; platformRole?: string | null } }) {
  const [hovered, setHovered] = useState(false)
  const label = projectMemberRoleLabel(member)
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <AssigneeAvatar name={member.name || member.email} avatarUrl={member.avatarUrl} size={32} />
      {hovered ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 20, minWidth: 220, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--form-bg)', boxShadow: 'var(--panel-shadow)', pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{member.name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{member.email}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{label}</div>
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
  const archivedParam = searchParams.get('archived') === 'true'
  const [projectId, setProjectId] = useState<string>('')
  const [showEdit, setShowEdit] = useState(false)
  const [activity, setActivity] = useState<{ id: string; type: string; summary: string; actorName: string | null; actorEmail: string | null; actorApiKeyLabel: string | null; details: string[]; createdAt: string }[]>([])
  const [members, setMembers] = useState<{ id: string; accountId: string; name: string | null; email: string; avatarUrl?: string | null; role: string; createdAt: string; locked?: boolean; workspaceRole?: string | null; platformRole?: string | null }[]>([])

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const load = async () => {
      try {
        const [events, projectMembers] = await Promise.all([getProjectActivity(projectId), getProjectMembers(projectId)])
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

  const { data: project, error } = useProjectQuery(projectId, { archived: archivedParam })
  const recentTasks = project?.recentTasks.slice(0, 5) ?? []
  const taskOptions = project?.recentTasks.map((task) => ({ id: task.id, title: task.title })) ?? []

  return (
    <AppShell title={project?.name ?? 'Project'} subtitle={project?.description || 'Project overview and recent work.'}>
      {projectId && !archivedParam ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <ProjectTabs projectId={projectId} current="overview" />
          <button onClick={() => setShowEdit(true)} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700, flex: '0 0 auto' }}>Edit project</button>
        </div>
      ) : null}
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load project'}</div> : null}
      {archivedParam ? <div style={{ ...panel, border: '1px dashed var(--panel-border)', color: 'var(--text-secondary)', marginBottom: 18 }}>This project is archived. Restore it from the Projects list to resume work.</div> : null}

      {project ? (
        <>
          <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Client</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 750 }}>{project.client ? project.client.name : 'Not linked'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={pill(project.client ? '#ecfeff' : 'var(--form-bg)', project.client ? '#155e75' : 'var(--text-secondary)')}>{project.client ? 'Linked' : 'Not linked'}</span>
              {!archivedParam ? <button onClick={() => setShowEdit(true)} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '10px 14px', fontWeight: 700 }}>{project.client ? 'Change client' : 'Assign client'}</button> : null}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={panel}><div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Total tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.taskCount}</div></div>
            <div style={panel}><div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Open tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.openTasks}</div></div>
            <div style={panel}><div style={{ color: 'var(--text-muted)', fontSize: 14 }}>In review</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.reviewTasks}</div></div>
            <div style={panel}>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Project members</div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {members.length ? members.map((member) => <ProjectMemberAvatar key={member.accountId} member={member} />) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            {!archivedParam ? (
              <div style={panel}>
                <div style={{ fontWeight: 750, marginBottom: 14 }}>Workflow</div>
                <StatusSettings projectId={projectId} statuses={project.statuses} />
              </div>
            ) : null}

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

      {showEdit && project ? (
        <EditProjectModal
          projectId={projectId}
          initialName={project.name}
          initialDescription={project.description}
          initialClientId={project.client?.id || null}
          onClose={() => setShowEdit(false)}
        />
      ) : null}
    </AppShell>
  )
}
