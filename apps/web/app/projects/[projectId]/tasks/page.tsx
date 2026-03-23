'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '../../../../components/app-shell'
import { ProjectTabs } from '../../../../components/project-tabs'
import { ProjectTasksTable } from '../../../../components/project-tasks-table'
import { useProjectQuery } from '../../../../lib/query'

export default function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState<string>('')

  useEffect(() => { void params.then((p) => setProjectId(p.projectId)) }, [params])

  const { data: project, error } = useProjectQuery(projectId)

  return (
    <AppShell title={project?.name ?? 'Project tasks'} subtitle={project ? `Tasks for ${project.name}.` : 'Project tasks.'}>
      {projectId ? <ProjectTabs projectId={projectId} current="tasks" /> : null}
      {error ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{error instanceof Error ? error.message : 'Failed to load tasks'}</div> : null}
      {projectId ? <ProjectTasksTable projectId={projectId} showFilters /> : null}
    </AppShell>
  )
}
