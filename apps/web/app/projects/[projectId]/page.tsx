'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { EditProjectModal } from '../../../components/edit-project-modal'
import { ProjectTabs } from '../../../components/project-tabs'
import { StatusSettings } from '../../../components/status-settings'
import { TaskDrawer } from '../../../components/task-drawer'
import { TimesheetsTable } from '../../../components/timesheets-table'
import { ProjectCurrentTasks } from '../../../components/project-current-tasks'
import { useProjectQuery } from '../../../lib/query'

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const searchParams = useSearchParams()
  const taskId = searchParams.get('task') || ''
  const [projectId, setProjectId] = useState<string>('')
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  const { data: project, error } = useProjectQuery(projectId)
  const recentTasks = project?.recentTasks.slice(0, 5) ?? []
  const taskOptions = project?.recentTasks.map((task) => ({ id: task.id, title: task.title })) ?? []

  return (
    <AppShell title={project?.name ?? 'Project'} subtitle={project?.description || 'Project overview and recent work.'} actions={<div style={{ display: 'flex', gap: 10 }}>{projectId ? <button onClick={() => setShowEdit(true)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>Edit project</button> : null}{projectId ? <Link href={`/projects/${projectId}/board`} style={{ background: '#0f172a', color: '#fff', borderRadius: 12, padding: '11px 14px', fontWeight: 700, textDecoration: 'none' }}>Open board</Link> : null}</div>}>
      {projectId ? <ProjectTabs projectId={projectId} current="overview" /> : null}
      {error ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load project'}</div> : null}

      {project ? (
        <>
          <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 14 }}>Client</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 750 }}>{project.client ? project.client.name : 'Not linked'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={pill(project.client ? '#ecfeff' : '#fee2e2', project.client ? '#155e75' : '#991b1b')}>{project.client ? 'Linked' : 'Not linked'}</span>
              <button onClick={() => setShowEdit(true)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 14px', fontWeight: 700 }}>{project.client ? 'Change client' : 'Assign client'}</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Total tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.taskCount}</div></div>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Open tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.openTasks}</div></div>
            <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>In review</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{project.reviewTasks}</div></div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Workflow</div>
              <StatusSettings projectId={projectId} statuses={project.statuses} />
            </div>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Recent tasks</div>
              <ProjectCurrentTasks project={project} />
            </div>

            <div style={panel}>
              <div style={{ fontWeight: 750, marginBottom: 14 }}>Timesheets</div>
              <TimesheetsTable lockedProjectId={projectId} lockedProjectName={project.name} taskOptions={taskOptions} showProjectColumn={false} showCustomerColumn={false} />
            </div>
          </div>
        </>
      ) : <div style={{ color: '#64748b' }}>Loading project…</div>}

      {taskId && projectId ? <TaskDrawer taskId={taskId} closeHref={`/projects/${projectId}`} projectId={projectId} /> : null}
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
