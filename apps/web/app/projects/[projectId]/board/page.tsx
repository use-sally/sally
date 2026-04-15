'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '../../../../components/app-shell'
import { TaskBoard } from '../../../../components/task-board'
import { ProjectTabs } from '../../../../components/project-tabs'
import { BottomTaskDrawer } from '../../../../components/bottom-task-drawer'
import { useBoardQuery, useProjectQuery } from '../../../../lib/query'

export default function ProjectBoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const searchParams = useSearchParams()
  const taskId = searchParams.get('task') || ''
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  const { data: project, error: projectError } = useProjectQuery(projectId)
  const { data: columns = [], error: boardError, isLoading } = useBoardQuery(projectId)

  const subtitle = project ? `Kanban view for ${project.name}.` : 'Kanban-style workflow for this project.'

  return (
    <AppShell
      title={project?.name ?? 'Project board'}
      subtitle={subtitle}
    >
      {projectId ? <ProjectTabs projectId={projectId} current="board" /> : null}
      {projectError ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{projectError instanceof Error ? projectError.message : 'Failed to load project'}</div> : null}
      {boardError ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{boardError instanceof Error ? boardError.message : 'Failed to load board'}</div> : null}
      {columns.length ? <TaskBoard columns={columns} taskBaseHref={`/projects/${projectId}/board`} projectId={projectId} canReorderStatuses={true} /> : <div style={{ color: 'var(--text-muted)' }}>{isLoading ? 'Loading board…' : 'No tasks yet.'}</div>}
      {taskId && projectId ? <BottomTaskDrawer taskId={taskId} closeHref={`/projects/${projectId}/board`} projectId={projectId} /> : null}
    </AppShell>
  )
}
