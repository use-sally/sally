'use client'

import { useEffect, useState } from 'react'
import { AppShell, panel } from '../../../../components/app-shell'
import { ProjectTabs } from '../../../../components/project-tabs'
import { ProjectTasksTable } from '../../../../components/project-tasks-table'
import { useProjectQuery } from '../../../../lib/query'

export default function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  const { data: project, error } = useProjectQuery(projectId)

  return (
    <AppShell
      title={project?.name ?? 'Project tasks'}
      subtitle={project ? `All tasks in ${project.name}.` : 'Task list for this project.'}
    >
      {projectId ? <ProjectTabs projectId={projectId} current="tasks" /> : null}
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load project'}</div> : null}

      <div style={panel}>
        {projectId ? <ProjectTasksTable projectId={projectId} /> : <div style={{ color: 'var(--text-muted)' }}>Loading tasks…</div>}
      </div>

    </AppShell>
  )
}
