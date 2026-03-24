'use client'

import type { ProjectDetail } from '@automatethis-pm/types/src'
import { pill, priorityStars, tagStyle } from './app-shell'
import { AssigneeAvatar } from './assignee-avatar'
import { ProjectTasksTable } from './project-tasks-table'
import { statusChipStyle } from '../lib/status-colors'

export function ProjectCurrentTasks({ project, archived = false }: { project: ProjectDetail; archived?: boolean }) {
  if (!archived) {
    return <ProjectTasksTable projectId={project.id} showFilters={false} limit={5} archived={false} />
  }

  const recentTasks = project.recentTasks.slice(0, 5)

  if (!recentTasks.length) {
    return <div style={{ padding: 18, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }}>No tasks found in this archived project.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {recentTasks.map((task) => (
        <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.9fr 1fr 1fr 1.4fr', gap: 10, padding: '14px 16px', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }}>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{task.title}</div>
          <div style={{ display: 'flex', alignItems: 'center' }}><AssigneeAvatar name={task.assignee} avatarUrl={task.assigneeAvatarUrl} size={28} /></div>
          <div style={{ color: '#94a3b8' }}>{priorityStars(task.priority)}</div>
          <div>{task.dueDate ? <span style={pill('#eef2ff', '#3730a3')}>{new Date(task.dueDate).toLocaleDateString()}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</div>
          <div><span style={statusChipStyle(task.statusColor)}>{task.status}</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: '#94a3b8' }}>—</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
