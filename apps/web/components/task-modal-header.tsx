'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { StatusOption, TaskCollaborator, TaskParticipant } from '@sally/types/src'
import { createProjectLabel, updateTask, updateTaskLabels } from '../lib/api'
import { qk } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleField } from './task-people-field'
import { statusChipStyle } from '../lib/status-colors'
import { canAssignTask, canEditTask } from '../lib/task-permissions'
import { projectInputField, taskTitleText } from '../lib/theme'

type EditableHeaderField = 'title' | 'dueDate' | 'labels' | null

type TaskModalHeaderTask = {
  id: string
  number?: number | null
  title: string
  owner: string
  ownerAvatarUrl?: string | null
  participants?: TaskParticipant[]
  assignee: string
  assigneeAvatarUrl?: string | null
  collaborators?: TaskCollaborator[]
  priority: 'P1' | 'P2' | 'P3'
  status: string
  statusId: string
  statusColor?: string | null
  dueDate: string | null
  labels?: string[]
}

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

export function TaskModalHeader({
  task,
  projectId,
  statuses,
  taskPermissionViewer,
}: {
  task: TaskModalHeaderTask
  projectId: string
  statuses: StatusOption[]
  taskPermissionViewer?: { platformRole?: string | null; workspaceRole?: string | null; projectRole?: string | null }
}) {
  const qc = useQueryClient()
  const [activeField, setActiveField] = useState<EditableHeaderField>(null)
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
  const [labelsInput, setLabelsInput] = useState((task.labels || []).join(', '))

  useEffect(() => {
    setActiveField(null)
    setTitle(task.title)
    setPriority(task.priority)
    setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
    setLabelsInput((task.labels || []).join(', '))
  }, [task])

  const parsedLabels = useMemo(() => Array.from(new Set(labelsInput.split(',').map((label) => label.trim()).filter(Boolean))), [labelsInput])
  const activeStatus = statuses.find((status) => status.id === task.statusId)
  const due = dueBadge(task.dueDate)
  const taskEditDecision = canEditTask(taskPermissionViewer ?? {}, false)
  const assignDecision = canAssignTask(taskPermissionViewer ?? {}, false)

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(task.id) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function saveTask(payload: { title?: string; priority?: 'P1' | 'P2' | 'P3'; dueDate?: string | null }) {
    if (!taskEditDecision.allowed) return
    await updateTask(task.id, payload)
    await invalidateAll()
  }

  async function saveLabels() {
    if (!taskEditDecision.allowed) return
    const current = task.labels || []
    const same = current.length === parsedLabels.length && current.every((label) => parsedLabels.includes(label))
    if (same) {
      setActiveField(null)
      return
    }
    for (const label of parsedLabels) {
      if (!current.includes(label)) await createProjectLabel(projectId, { name: label }).catch(() => {})
    }
    await updateTaskLabels(task.id, parsedLabels)
    await invalidateAll()
    setActiveField(null)
  }

  function startEdit(field: EditableHeaderField) {
    if (!taskEditDecision.allowed) return
    setActiveField(field)
  }

  function priorityLevel(value: 'P1' | 'P2' | 'P3') {
    return value === 'P1' ? 3 : value === 'P2' ? 2 : 1
  }

  return (
    <div data-task-modal-header="true" style={{ position: 'relative', zIndex: 20, overflow: 'visible', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr)', gap: 10, padding: '14px 16px', alignItems: 'center', background: 'var(--task-row-active-bg)', boxShadow: 'inset 0 0 0 1px rgba(250, 204, 21, 0.18)', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', flex: '0 0 auto' }}>
      <div onClick={() => startEdit('title')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: taskEditDecision.allowed ? 'text' : 'default', minWidth: 0 }}>
        {activeField === 'title' ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { const next = title.trim(); if (next && next !== task.title) void saveTask({ title: next }); setActiveField(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const next = title.trim(); if (next && next !== task.title) void saveTask({ title: next }); setActiveField(null) } }}
            autoFocus
            style={inputStyle}
          />
        ) : (
          <div style={{ ...taskTitleText, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 }}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{task.number}</span> : null}{task.title}</div>
        )}
      </div>

      <div data-task-modal-header-people="true" style={{ position: 'relative', zIndex: 30, overflow: 'visible', minHeight: 40, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
        <TaskPeopleField
          projectId={projectId}
          taskId={task.id}
          owner={task.owner}
          ownerAvatarUrl={task.ownerAvatarUrl}
          participants={task.participants}
          assignee={task.assignee}
          assigneeAvatarUrl={task.assigneeAvatarUrl}
          collaborators={task.collaborators}
          canManage={assignDecision.allowed}
          compact
        />
      </div>

      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {taskEditDecision.allowed ? [1, 2, 3].map((rating) => {
          const value = rating === 3 ? 'P1' : rating === 2 ? 'P2' : 'P3'
          const filled = priorityLevel(priority) >= rating
          return (
            <button
              key={rating}
              type="button"
              onClick={() => { setPriority(value); if (value !== task.priority) void saveTask({ priority: value }) }}
              style={{ ...starBtn, color: filled ? '#f59e0b' : 'var(--text-muted)' }}
              aria-label={`Set priority ${value}`}
            >
              ★
            </button>
          )
        }) : <span style={{ color: '#f59e0b', fontSize: 22, lineHeight: 1 }}>{priorityStars(task.priority)}</span>}
      </div>

      <div onClick={() => startEdit('dueDate')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: taskEditDecision.allowed ? 'text' : 'default' }}>
        {activeField === 'dueDate' ? (
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={() => { if (dueDate !== (task.dueDate ? String(task.dueDate).slice(0, 10) : '')) void saveTask({ dueDate: dueDate || null }); setActiveField(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (dueDate !== (task.dueDate ? String(task.dueDate).slice(0, 10) : '')) void saveTask({ dueDate: dueDate || null }); setActiveField(null) } }}
            autoFocus
            style={inputStyle}
          />
        ) : (
          due ? <span style={pill(due.bg, due.color)}>{due.label}</span> : <span style={{ color: 'var(--text-muted)' }}>due date</span>
        )}
      </div>

      <div style={{ minHeight: 40, display: 'flex', alignItems: 'center' }}>
        <span className="status-chip" style={statusChipStyle(activeStatus?.color || task.statusColor)}>{activeStatus?.name || task.status}</span>
      </div>

      <div onClick={() => startEdit('labels')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: taskEditDecision.allowed ? 'text' : 'default' }}>
        {activeField === 'labels' ? (
          <input
            value={labelsInput}
            onChange={(e) => setLabelsInput(e.target.value)}
            onBlur={() => void saveLabels()}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveLabels() } }}
            autoFocus
            placeholder="tags"
            style={inputStyle}
          />
        ) : task.labels?.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>tags</span>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { ...projectInputField }
const starBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px', fontSize: 22, cursor: 'pointer', lineHeight: 1 }
