'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { EditProjectModal } from '../../../components/edit-project-modal'
import { ProjectTabs } from '../../../components/project-tabs'
import { StatusSettings } from '../../../components/status-settings'
import { TimesheetsTable } from '../../../components/timesheets-table'
import { ProjectCurrentTasks } from '../../../components/project-current-tasks'
import { getProjectActivity } from '../../../lib/api'
import { useProjectQuery } from '../../../lib/query'

function ArchivedProjectTimesheets({ entries }: { entries: { id: string; userName: string; taskTitle: string | null; date: string; minutes: number; description: string | null; billable: boolean; validated: boolean }[] }) {
  if (!entries.length) return <div style={{ color: '#64748b' }}>No timesheets in this archived project.</div>

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {entries.map((entry) => (
        <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 110px 1.5fr', gap: 10, alignItems: 'center', padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff' }}>
          <div>{String(entry.date).slice(0, 10)}</div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{entry.taskTitle || 'Project only'}</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>{entry.userName}</div>
          </div>
          <div style={{ fontWeight: 700 }}>{entry.minutes} min</div>
          <div><span style={pill(entry.billable ? '#ecfeff' : '#f8fafc', entry.billable ? '#155e75' : '#475569')}>{entry.billable ? 'Billable' : 'Non-billable'}</span></div>
          <div style={{ color: '#475569' }}>{entry.description || '—'}</div>
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
  const [activity, setActivity] = useState<{ id: string; type: string; summary: string; actorName: string | null; actorEmail: string | null; createdAt: string }[]>([])

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void getProjectActivity(projectId)
      .then((events) => { if (!cancelled) setActivity(events) })
      .catch(() => { if (!cancelled) setActivity([]) })
    return () => { cancelled = true }
  }, [projectId])

  const { data: project, error } = useProjectQuery(projectId, { archived: archivedParam })
  const recentTasks = project?.recentTasks.slice(0, 5) ?? []
  const taskOptions = project?.recentTasks.map((task) => ({ id: task.id, title: task.title })) ?? []

  return (
    <AppShell title={project?.name ?? 'Project'} subtitle={project?.description || 'Project overview and recent work.'}>
      {projectId && !archivedParam ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <ProjectTabs projectId={projectId} current="overview" />
          <button onClick={() => setShowEdit(true)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 14px', fontWeight: 700, flex: '0 0 auto' }}>Edit project</button>
        </div>
      ) : null}
      {error ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load project'}</div> : null}
      {archivedParam ? <div style={{ ...panel, border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#475569', marginBottom: 18 }}>This project is archived. Restore it from the Projects list to resume work.</div> : null}

      {project ? (
        <>
          <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 14 }}>Client</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 750 }}>{project.client ? project.client.name : 'Not linked'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={pill(project.client ? '#ecfeff' : '#fee2e2', project.client ? '#155e75' : '#991b1b')}>{project.client ? 'Linked' : 'Not linked'}</span>
              {!archivedParam ? <button onClick={() => setShowEdit(true)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 14px', fontWeight: 700 }}>{project.client ? 'Change client' : 'Assign client'}</button> : null}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Total tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.taskCount}</div></div>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Open tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.openTasks}</div></div>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>In review</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.reviewTasks}</div></div>
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
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Recent activity</div>
              {activity.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {activity.slice(0, 15).map((event) => (
                    <div key={event.id} style={{ display: 'grid', gap: 4, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{event.summary}</div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>{event.actorName || event.actorEmail || 'System'} · {new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#64748b' }}>No activity recorded yet.</div>}
            </div>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Timesheets</div>
              {archivedParam ? <ArchivedProjectTimesheets entries={project.recentTimesheets} /> : <TimesheetsTable lockedProjectId={projectId} lockedProjectName={project.name} taskOptions={taskOptions} showProjectColumn={false} showCustomerColumn={false} />}
            </div>
          </div>
        </>
      ) : <div style={{ color: '#64748b' }}>Loading project…</div>}

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
