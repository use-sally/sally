'use client'

import type { ProjectDetail } from '@sally/types/src'
import { pill, priorityStars, tagStyle } from './app-shell'
import { AssigneeAvatar } from './assignee-avatar'
import { ProjectTasksTable } from './project-tasks-table'
import { statusChipStyle } from '../lib/status-colors'
import { taskTitleText } from '../lib/theme'

export function ProjectCurrentTasks({ project, archived = false }: { project: ProjectDetail; archived?: boolean }) {
  if (!archived) {
    return <ProjectTasksTable projectId={project.id} showFilters={false} limit={5} archived={false} />
  }

  const recentTasks = project.recentTasks.slice(0, 5)

  if (!recentTasks.length) {
    return <div style={{ padding: 18, color: 'var(--text-muted)', border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)' }}>No tasks found in this archived project.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {recentTasks.map((task) => (
        <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.9fr 1fr 1fr 1.4fr', gap: 10, padding: '14px 16px', alignItems: 'center', border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)' }}>
          <div style={{ ...taskTitleText, fontWeight: 700 }}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{task.number}</span> : null}{task.title}</div>
          <div style={{ display: 'flex', alignItems: 'center' }}><AssigneeAvatar name={task.assignee} avatarUrl={task.assigneeAvatarUrl} size={28} /></div>
          <div style={{ color: 'var(--text-muted)' }}>{priorityStars(task.priority)}</div>
          <div>{task.dueDate ? <span style={pill('#eef2ff', '#3730a3')}>{new Date(task.dueDate).toLocaleDateString()}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
          <div><span className="status-chip" style={statusChipStyle(task.statusColor)}>{task.status}</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
