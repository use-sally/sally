'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { StatusOption, TaskCollaborator, TaskParticipant } from '@sally/types/src'
import { createProjectLabel, updateTask, updateTaskLabels } from '../lib/api'
import { qk } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleField } from './task-people-field'
import { statusChipStyle } from '../lib/status-colors'
import { canAssignTask, canEditTask } from '../lib/task-permissions'
import { projectInputField, taskTitleText } from '../lib/theme'

type EditableHeaderField = 'title' | 'dueDate' | 'status' | 'labels' | null

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
  availableLabels = [],
  taskPermissionViewer,
}: {
  task: TaskModalHeaderTask
  projectId: string
  statuses: StatusOption[]
  availableLabels?: { id: string; name: string }[]
  taskPermissionViewer?: { platformRole?: string | null; workspaceRole?: string | null; projectRole?: string | null }
}) {
  const qc = useQueryClient()
  const [activeField, setActiveField] = useState<EditableHeaderField>(null)
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
  const [labelsInput, setLabelsInput] = useState((task.labels || []).join(', '))
  const [labelQuery, setLabelQuery] = useState('')
  const [labelIndex, setLabelIndex] = useState(0)
  const dueDateInputRef = useRef<HTMLInputElement | null>(null)
  const labelInputRef = useRef<HTMLInputElement | null>(null)
  const previousTaskIdRef = useRef(task.id)

  useEffect(() => {
    if (previousTaskIdRef.current !== task.id) {
      previousTaskIdRef.current = task.id
      setActiveField(null)
      setLabelQuery('')
      setLabelIndex(0)
    }
    if (activeField !== 'title') setTitle(task.title)
    setPriority(task.priority)
    if (activeField !== 'dueDate') setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
    if (activeField !== 'labels') setLabelsInput((task.labels || []).join(', '))
  }, [activeField, task.id, task.title, task.priority, task.dueDate, task.labels])

  const parsedLabels = useMemo(() => Array.from(new Set(labelsInput.split(',').map((label) => label.trim()).filter(Boolean))), [labelsInput])
  const availableLabelNames = useMemo(() => Array.from(new Set(availableLabels.map((label) => label.name).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [availableLabels])
  const filteredLabelOptions = useMemo(() => {
    const query = labelQuery.trim().toLowerCase()
    return availableLabelNames.filter((label) => !parsedLabels.includes(label) && (!query || label.toLowerCase().includes(query))).slice(0, 8)
  }, [availableLabelNames, labelQuery, parsedLabels])
  const canCreateLabel = Boolean(labelQuery.trim()) && !availableLabelNames.some((label) => label.toLowerCase() === labelQuery.trim().toLowerCase()) && !parsedLabels.some((label) => label.toLowerCase() === labelQuery.trim().toLowerCase())
  const activeStatus = statuses.find((status) => status.id === task.statusId)
  const due = dueBadge(task.dueDate)
  const taskEditDecision = canEditTask(taskPermissionViewer ?? {}, false)
  const assignDecision = canAssignTask(taskPermissionViewer ?? {}, false)

  useEffect(() => {
    if (activeField !== 'dueDate') return
    const input = dueDateInputRef.current
    if (!input) return
    input.focus()
    requestAnimationFrame(() => {
      try {
        input.showPicker?.()
      } catch {}
    })
  }, [activeField])

  useEffect(() => {
    if (activeField !== 'labels') return
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }, [activeField])

  async function invalidateAll(extraProjectId?: string) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(task.id) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      extraProjectId ? qc.invalidateQueries({ queryKey: qk.project(extraProjectId) }) : Promise.resolve(),
      qc.invalidateQueries({ queryKey: ['projectTasks'] }),
      qc.invalidateQueries({ queryKey: ['board'] }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function saveTask(payload: { title?: string; priority?: 'P1' | 'P2' | 'P3'; dueDate?: string | null; statusId?: string; projectId?: string }) {
    if (!taskEditDecision.allowed) return
    await updateTask(task.id, payload)
    await invalidateAll(payload.projectId)
  }

  async function saveLabelSet(nextLabels: string[], close = false) {
    if (!taskEditDecision.allowed) return
    const labels = Array.from(new Set(nextLabels.map((label) => label.trim()).filter(Boolean)))
    const current = task.labels || []
    const same = current.length === labels.length && current.every((label) => labels.includes(label))
    setLabelsInput(labels.join(', '))
    if (same) {
      if (close) setActiveField(null)
      return
    }
    for (const label of labels) {
      if (!availableLabelNames.some((existing) => existing.toLowerCase() === label.toLowerCase())) await createProjectLabel(projectId, { name: label }).catch(() => {})
    }
    await updateTaskLabels(task.id, labels)
    await invalidateAll()
    if (close) setActiveField(null)
  }

  function addLabel(label: string) {
    const next = label.trim()
    if (!next || parsedLabels.some((item) => item.toLowerCase() === next.toLowerCase())) return
    setLabelQuery('')
    setLabelIndex(0)
    void saveLabelSet([...parsedLabels, next])
    requestAnimationFrame(() => labelInputRef.current?.focus())
  }

  function removeLabel(label: string) {
    void saveLabelSet(parsedLabels.filter((item) => item !== label))
  }

  function pickCurrentLabel() {
    const option = filteredLabelOptions[labelIndex] || filteredLabelOptions[0]
    if (option) addLabel(option)
    else if (labelQuery.trim()) addLabel(labelQuery.trim())
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
      <style>{`
        .task-modal-date-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          opacity: 0.9;
          cursor: pointer;
        }
        .task-modal-date-input { color-scheme: dark; }
      `}</style>
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
        }) : <span style={{ color: '#f59e0b', fontSize: 'var(--font-22)', lineHeight: 1 }}>{priorityStars(task.priority)}</span>}
      </div>

      <div onClick={() => startEdit('dueDate')} style={{ minHeight: 40, display: 'flex', alignItems: 'center', cursor: taskEditDecision.allowed ? 'pointer' : 'default' }}>
        {activeField === 'dueDate' ? (
          <input
            ref={dueDateInputRef}
            className="task-modal-date-input"
            type="date"
            value={dueDate}
            onChange={(e) => { const next = e.target.value; setDueDate(next); if (next !== (task.dueDate ? String(task.dueDate).slice(0, 10) : '')) void saveTask({ dueDate: next || null }); setActiveField(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (dueDate !== (task.dueDate ? String(task.dueDate).slice(0, 10) : '')) void saveTask({ dueDate: dueDate || null }); setActiveField(null) } if (e.key === 'Escape') { e.preventDefault(); setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : ''); setActiveField(null) } }}
            autoFocus
            style={inputStyle}
          />
        ) : (
          due ? <span style={pill(due.bg, due.color)}>{due.label}</span> : <span style={{ color: 'var(--text-muted)' }}>due date</span>
        )}
      </div>

      <div style={{ position: 'relative', minHeight: 40, display: 'flex', alignItems: 'center', overflow: 'visible' }}>
        <button
          type="button"
          onClick={() => startEdit('status')}
          disabled={!taskEditDecision.allowed}
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: taskEditDecision.allowed ? 'pointer' : 'default' }}
          aria-haspopup="listbox"
          aria-expanded={activeField === 'status'}
          aria-label="Change task status"
        >
          <span className="status-chip" style={statusChipStyle(activeStatus?.color || task.statusColor)}>{activeStatus?.name || task.status}</span>
        </button>
        {activeField === 'status' ? (
          <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 190, maxWidth: 260, zIndex: 50, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', padding: 6, display: 'grid', gap: 4 }}>
            {statuses.map((status) => {
              const selected = status.id === task.statusId
              return (
                <button
                  key={status.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setActiveField(null); if (!selected) void saveTask({ statusId: status.id }) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', border: 'none', borderRadius: 9, background: selected ? 'color-mix(in srgb, var(--form-border-focus) 16%, transparent)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span className="status-chip" style={statusChipStyle(status.color)}>{status.name}</span>
                  {selected ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>✓</span> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div style={{ position: 'relative', minHeight: 40, display: 'flex', alignItems: 'center', overflow: 'visible' }}>
        {activeField === 'labels' ? (
          <div style={{ width: '100%', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minHeight: 36, border: '1px solid var(--form-border)', borderRadius: 10, padding: '6px 8px', background: 'var(--form-bg)' }}>
              {parsedLabels.map((label) => (
                <span key={label} style={{ ...tagStyle(), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {label}
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => removeLabel(label)} aria-label={`Remove tag ${label}`} style={{ border: 'none', background: 'transparent', color: 'inherit', padding: 0, cursor: 'pointer', fontWeight: 900 }}>×</button>
                </span>
              ))}
              <input
                ref={labelInputRef}
                value={labelQuery}
                onChange={(event) => { setLabelQuery(event.target.value); setLabelIndex(0) }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') { event.preventDefault(); setLabelIndex((current) => filteredLabelOptions.length ? (current + 1) % filteredLabelOptions.length : 0); return }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setLabelIndex((current) => filteredLabelOptions.length ? (current - 1 + filteredLabelOptions.length) % filteredLabelOptions.length : 0); return }
                  if (event.key === 'Enter') { event.preventDefault(); pickCurrentLabel(); return }
                  if (event.key === 'Escape') { event.preventDefault(); setActiveField(null); setLabelQuery(''); return }
                  if (event.key === 'Backspace' && !labelQuery && parsedLabels.length) { event.preventDefault(); removeLabel(parsedLabels[parsedLabels.length - 1]) }
                }}
                placeholder={parsedLabels.length ? 'type to filter or create' : 'type tag and press Enter'}
                style={{ flex: '1 1 120px', minWidth: 90, border: 'none', outline: 'none', background: 'transparent', color: 'var(--form-text)', font: 'inherit' }}
              />
            </div>
            <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260, maxWidth: 'min(320px, calc(100vw - 32px))', zIndex: 50, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', padding: 6, display: 'grid', gap: 4 }}>
              {filteredLabelOptions.map((label, index) => (
                <button key={label} type="button" role="option" aria-selected={index === labelIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => addLabel(label)} style={{ width: '100%', border: 'none', borderRadius: 9, padding: '8px 10px', background: index === labelIndex ? 'color-mix(in srgb, var(--form-border-focus) 16%, transparent)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontWeight: 700 }}>
                  {label}
                </button>
              ))}
              {canCreateLabel ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addLabel(labelQuery)} style={{ width: '100%', border: '1px dashed var(--form-border-focus)', borderRadius: 9, padding: '8px 10px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontWeight: 800 }}>Create “{labelQuery.trim()}”</button> : null}
              {!filteredLabelOptions.length && !canCreateLabel ? <div style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>No more tags.</div> : null}
            </div>
          </div>
        ) : task.labels?.length ? (
          <button type="button" onClick={() => startEdit('labels')} disabled={!taskEditDecision.allowed} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', border: 'none', background: 'transparent', padding: 0, cursor: taskEditDecision.allowed ? 'pointer' : 'default' }}>
            {task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}
          </button>
        ) : (
          <button type="button" onClick={() => startEdit('labels')} disabled={!taskEditDecision.allowed} style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--text-muted)', cursor: taskEditDecision.allowed ? 'pointer' : 'default' }}>tags</button>
        )}
      </div>

    </div>
  )
}

const inputStyle: React.CSSProperties = { ...projectInputField }
const starBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px', fontSize: 'var(--font-22)', cursor: 'pointer', lineHeight: 1 }
