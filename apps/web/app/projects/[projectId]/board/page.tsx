'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Project } from '@automatethis-pm/types/src'
import { AppShell } from '../../../../components/app-shell'
import { ProjectTabs } from '../../../../components/project-tabs'
import { TaskBoard } from '../../../../components/task-board'
import { CreateTaskModal } from '../../../../components/create-task-modal'
import { BottomTaskDrawer } from '../../../../components/bottom-task-drawer'
import { useBoardQuery, useProjectQuery, useProjectsQuery } from '../../../../lib/query'

export default function ProjectBoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const searchParams = useSearchParams()
  const taskId = searchParams.get('task') || ''
  const [projectId, setProjectId] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { void params.then((p) => setProjectId(p.projectId)) }, [params])

  const { data: project, error: projectError } = useProjectQuery(projectId)
  const { data: columns = [], error: boardError } = useBoardQuery(projectId)
  const { data: projects = [] } = useProjectsQuery()

  return (
    <AppShell title={project?.name ?? 'Project board'} subtitle={project ? `Board for ${project.name}.` : 'Project board.'} actions={<button onClick={() => setShowCreate(true)} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>New task</button>}>
      {projectId ? <ProjectTabs projectId={projectId} current="board" /> : null}
      {projectError || boardError ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{(projectError || boardError) instanceof Error ? (projectError || boardError)?.message : 'Failed to load board'}</div> : null}
      {columns.length ? <TaskBoard columns={columns} taskBaseHref={`/projects/${projectId}/board`} projectId={projectId} /> : <div style={{ color: '#64748b' }}>Loading board…</div>}
      {showCreate ? <CreateTaskModal projects={projects as Project[]} defaultProjectId={projectId} onClose={() => setShowCreate(false)} onCreated={() => Promise.resolve()} /> : null}
      {taskId && projectId ? <BottomTaskDrawer taskId={taskId} closeHref={`/projects/${projectId}/board`} projectId={projectId} /> : null}
    </AppShell>
  )
}
