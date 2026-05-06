'use client'

import type { ProjectTaskListItem, StatusOption } from '@sally/types/src'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleAvatarStack } from './task-people-avatar-stack'
import { statusChipStyle } from '../lib/status-colors'
import { taskTitleText } from '../lib/theme'

function dueBadge(dueDate: string | null) {
  if (!dueDate) return null
  const today = new Date()
  const due = new Date(dueDate)
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diff = Math.round((dueDateOnly.getTime() - todayDate.getTime()) / 86400000)
  if (diff < 0) return { label: 'Overdue', bg: '#fee2e2', color: '#991b1b' }
  if (diff === 0) return { label: 'Today', bg: '#fef3c7', color: '#92400e' }
  if (diff === 1) return { label: 'Tomorrow', bg: '#ecfeff', color: '#155e75' }
  return { label: due.toLocaleDateString(), bg: '#eef2ff', color: '#3730a3' }
}

export function EditableTaskRow({
  task,
  statuses,
  expanded,
  onActivate,
}: {
  task: ProjectTaskListItem
  projectId: string
  statuses: StatusOption[]
  expanded: boolean
  onActivate: () => void
  taskPermissionViewer?: { platformRole?: string | null; workspaceRole?: string | null; projectRole?: string | null }
}) {
  const activeStatus = statuses.find((status) => status.id === task.statusId)
  const due = dueBadge(task.dueDate)

  return (
    <div>
      <div onClick={onActivate} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate() } }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr)', gap: 10, padding: '14px 16px', alignItems: 'center', background: expanded ? 'var(--task-row-active-bg)' : 'var(--panel-bg)', boxShadow: expanded ? 'inset 0 0 0 1px rgba(250, 204, 21, 0.18)' : 'none', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden', cursor: 'pointer' }}>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <div style={{ ...taskTitleText, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 }}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{task.number}</span> : null}{task.title}</div>
        </div>

        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
          <TaskPeopleAvatarStack
            owner={task.owner}
            ownerAvatarUrl={task.ownerAvatarUrl}
            participants={task.participants}
            assignee={task.assignee}
            assigneeAvatarUrl={task.assigneeAvatarUrl}
            collaborators={task.collaborators}
            size={28}
            maxVisible={3}
          />
        </div>

        <div style={{ display: 'flex', gap: 2, alignItems: 'center', color: '#f59e0b', fontSize: 22, lineHeight: 1 }}>
          {priorityStars(task.priority)}
        </div>

        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
          {due ? <span style={pill(due.bg, due.color)}>{due.label}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </div>

        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
          <span className="status-chip" style={statusChipStyle(activeStatus?.color || task.statusColor)}>{activeStatus?.name || task.status}</span>
        </div>

        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
          {task.labels?.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>—</div>
          )}
        </div>

      </div>
    </div>
  )
}
