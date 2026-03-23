'use client'

import type { ProjectDetail } from '@automatethis-pm/types/src'
import { ProjectTasksTable } from './project-tasks-table'

export function ProjectCurrentTasks({ project }: { project: ProjectDetail }) {
  return <ProjectTasksTable projectId={project.id} showFilters={false} limit={5} />
}
