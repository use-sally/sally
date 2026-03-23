'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ProjectTaskListItem, StatusOption } from '@automatethis-pm/types/src'
import { createProjectLabel, updateTask, updateTaskLabels } from '../lib/api'
import { qk } from '../lib/query'
import { pill, tagStyle } from './app-shell'

type ActiveField = 'title' | 'assignee' | 'dueDate' | 'status' | 'labels' | null

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
  projectId,
  statuses,
  expanded,
  onActivate,
}: {
  task: ProjectTaskListItem
  projectId: string
  statuses: StatusOption[]
  expanded: boolean
  onActivate: () => void
}) {
  const qc = useQueryClient()
  const [activeField, setActiveField] = useState<ActiveField>(null)
  const [title, setTitle] = useState(task.title)
  const [assignee, setAssignee] = useState(task.assignee === 'Unassigned' ? '' : task.assignee)
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
  const [statusId, setStatusId] = useState(task.statusId)
  const [labelsInput, setLabelsInput] = useState((task.labels || []).join(', '))

  useEffect(() => {
    setActiveField(null)
    setTitle(task.title)
    setAssignee(task.assignee === 'Unassigned' ? '' : task.assignee)
    setPriority(task.priority)
    setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
    setStatusId(task.statusId)
    setLabelsInput((task.labels || []).join(', '))
  }, [task])

  const parsedLabels = useMemo(() => Array.from(new Set(labelsInput.split(',').map((label) => label.trim()).filter(Boolean))), [labelsInput])
  const activeStatus = statuses.find((status) => status.id === task.statusId)
  const due = dueBadge(task.dueDate)

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(task.id) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projects }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function saveTask(payload: { title?: string; assignee?: string; priority?: 'P1' | 'P2' | 'P3'; dueDate?: string | null; statusId?: string }) {
    await updateTask(task.id, payload)
    await invalidateAll()
  }

  async function saveLabels() {
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

  function startEdit(field: ActiveField) {
    setActiveField(field)
  }

  function priorityLevel(value: 'P1' | 'P2' | 'P3') {
    return value === 'P1' ? 3 : value === 'P2' ? 2 : 1
  }

  return (
    <div>
      <div onClick={onActivate} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.9fr 1fr 1fr 1.4fr 56px', gap: 10, padding: '14px 16px', alignItems: 'center', background: expanded ? '#f8fafc' : '#fff' }}>
        <div onClick={() => startEdit('title')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'text' }}>
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
            <div style={{ fontWeight: 700, color: '#0f172a' }}>{task.title}</div>
          )}
        </div>

        <div onClick={() => startEdit('assignee')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'text', color: '#475569' }}>
          {activeField === 'assignee' ? (
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={() => { if (assignee !== (task.assignee === 'Unassigned' ? '' : task.assignee)) void saveTask({ assignee: assignee.trim() || 'Unassigned' }); setActiveField(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (assignee !== (task.assignee === 'Unassigned' ? '' : task.assignee)) void saveTask({ assignee: assignee.trim() || 'Unassigned' }); setActiveField(null) } }}
              autoFocus
              style={inputStyle}
            />
          ) : (
            <div>{task.assignee}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {[1, 2, 3].map((rating) => {
            const value = rating === 3 ? 'P1' : rating === 2 ? 'P2' : 'P3'
            const filled = priorityLevel(priority) >= rating
            return (
              <button
                key={rating}
                type="button"
                onClick={() => { setPriority(value); if (value !== task.priority) void saveTask({ priority: value }) }}
                style={{ ...starBtn, color: filled ? '#f59e0b' : '#cbd5e1' }}
              >
                ★
              </button>
            )
          })}
        </div>

        <div onClick={() => startEdit('dueDate')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'text' }}>
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
            due ? <span style={pill(due.bg, due.color)}>{due.label}</span> : <span style={{ color: '#94a3b8' }}>—</span>
          )}
        </div>

        <div onClick={() => startEdit('status')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          {activeField === 'status' ? (
            <select
              value={statusId}
              onChange={(e) => { setStatusId(e.target.value); void saveTask({ statusId: e.target.value }); setActiveField(null) }}
              onBlur={() => setActiveField(null)}
              autoFocus
              style={inputStyle}
            >
              {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
            </select>
          ) : (
            <span style={pill('#f8fafc', '#334155')}>{activeStatus?.name || task.status}</span>
          )}
        </div>

        <div onClick={() => startEdit('labels')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'text' }}>
          {activeField === 'labels' ? (
            <input
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              onBlur={() => void saveLabels()}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveLabels() } }}
              autoFocus
              placeholder="tag1, tag2"
              style={inputStyle}
            />
          ) : task.labels?.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}
            </div>
          ) : (
            <div style={{ color: '#94a3b8' }}>—</div>
          )}
        </div>

        <div style={{ color: '#94a3b8', fontWeight: 700, textAlign: 'right', fontSize: 16 }}>{expanded ? '▲' : '▼'}</div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 10px', background: '#fff', fontSize: 14 }
const starBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px', fontSize: 22, cursor: 'pointer', lineHeight: 1 }
