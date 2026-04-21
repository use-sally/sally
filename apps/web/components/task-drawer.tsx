'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useProjectQuery, qk, useTaskQuery, useTimesheetUsersQuery } from '../lib/query'
import { archiveTask, createComment, createProjectLabel, createTaskTodo, createTimesheetEntry, deleteTask, deleteTaskTodo, deleteTimesheetEntry, reorderTaskTodos, updateTask, updateTaskLabels, updateTaskTodo, updateTimesheetEntry, uploadTaskDescriptionImage } from '../lib/api'
import { findCurrentTimesheetUserId, getDefaultTimesheetUserName, getPreferredTimesheetCreateUserId } from '@sally/types/src'
import { pill, tagStyle } from './app-shell'
import { useEffect, useRef, useState } from 'react'
import type { TodoItem, TimesheetEntry } from '@sally/types/src'
import { DndContext, PointerSensor, type DragEndEvent, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MarkdownDescriptionEditor } from './markdown-description-editor'
import { TaskPeopleField } from './task-people-field'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { canAssignTask } from '../lib/task-permissions'
import { deleteTextAction, formControlMd, theme } from '../lib/theme'

async function compressImageForTask(file: File): Promise<{ mimeType: string; base64: string; fileName: string }> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUrl
    })

    const maxLongSide = 1600
    const longSide = Math.max(image.width, image.height)
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)

    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = mimeType === 'image/png' ? undefined : 0.82
    const dataUrl = canvas.toDataURL(mimeType, quality)
    const base64 = dataUrl.split(',')[1] || ''
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'reference'
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    return { mimeType, base64, fileName: `${baseName}.${ext}` }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export function TaskDrawer({ taskId, closeHref, projectId, drawerStyle }: { taskId: string; closeHref: string; projectId: string; drawerStyle?: React.CSSProperties }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { data: task, isLoading, error } = useTaskQuery(taskId)
  const { data: project } = useProjectQuery(projectId)
  const session = loadSession()
  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const assignDecision = canAssignTask({ platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: 'MEMBER' }, false)
  const { data: timesheetUsers = [] } = useTimesheetUsersQuery(projectId)
  const currentTimesheetUserId = findCurrentTimesheetUserId(timesheetUsers, session?.account)
  const [commentBody, setCommentBody] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [todoBusy, setTodoBusy] = useState(false)
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [descriptionBusy, setDescriptionBusy] = useState(false)
  const lastCommittedDescriptionRef = useRef('')
  const [timeMinutes, setTimeMinutes] = useState('')
  const [timeDescription, setTimeDescription] = useState('')
  const [timeUserId, setTimeUserId] = useState('')
  const [timeUserName, setTimeUserName] = useState(() => getDefaultTimesheetUserName(session?.account))
  const [timeDate, setTimeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [timeBillable, setTimeBillable] = useState(true)
  const [timeBusy, setTimeBusy] = useState(false)
  const [editingTimesheetId, setEditingTimesheetId] = useState<string | null>(null)
  const [editingTimesheetForm, setEditingTimesheetForm] = useState({ minutes: '', date: '', description: '', billable: true, validated: false, taskId: '' })
  const [timesheetEditBusy, setTimesheetEditBusy] = useState(false)
  const [showValidatedTimesheets, setShowValidatedTimesheets] = useState(false)
  const editingTimesheetMinutesRef = useRef<HTMLInputElement | null>(null)
  const editingTimesheetOriginal = useRef<TimesheetEntry | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    setTodoItems(task?.todos ?? [])
  }, [task?.todos])

  useEffect(() => {
    const nextDescription = task?.description ?? ''
    setDescriptionDraft(nextDescription)
    lastCommittedDescriptionRef.current = nextDescription
  }, [task?.description])


  useEffect(() => {
    if (editingTimesheetId && editingTimesheetMinutesRef.current) editingTimesheetMinutesRef.current.focus()
  }, [editingTimesheetId])

  useEffect(() => {
    const preferredUserId = getPreferredTimesheetCreateUserId(timesheetUsers, session?.account)
    if (preferredUserId && timeUserId !== preferredUserId) setTimeUserId(preferredUserId)
  }, [timesheetUsers, session?.account, timeUserId])

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(taskId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.projectTimesheets(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function save(payload: { title?: string; description?: string; assignee?: string; collaborators?: string[]; priority?: 'P1'|'P2'|'P3'; dueDate?: string | null; statusId?: string }) {
    await updateTask(taskId, payload)
    await invalidateAll()
  }

  async function saveDescription(nextDescription?: string) {
    const value = nextDescription ?? descriptionDraft
    setDescriptionBusy(true)
    try {
      await save({ description: value })
    } finally {
      setDescriptionBusy(false)
    }
  }


  async function handleDescriptionImageUpload(file: File) {
    if (!task) return null
    setDescriptionBusy(true)
    try {
      const compressed = await compressImageForTask(file)
      const uploaded = await uploadTaskDescriptionImage(task.id, compressed)
      const alt = file.name.replace(/\.[^.]+$/, '') || 'reference'
      return { url: uploaded.url, alt }
    } finally {
      setDescriptionBusy(false)
    }
  }

  async function submitTime() {
    if (!task) return
    const minutes = Number(timeMinutes)
    if (!minutes || minutes <= 0) return
    setTimeBusy(true)
    try {
      const userId = timeUserId || undefined
      const userName = userId ? undefined : (timeUserName.trim() || 'Alex')
      await createTimesheetEntry({ projectId: task.project.id, taskId: task.id, userId, userName, date: timeDate, minutes, description: timeDescription.trim() || undefined, billable: timeBillable })
      setTimeMinutes('')
      setTimeDescription('')
      await invalidateAll()
    } finally {
      setTimeBusy(false)
    }
  }

  async function handleArchiveTask() {
    if (!task) return
    if (typeof window !== 'undefined' && !window.confirm('Archive this task? You can still recover it later.')) return
    await archiveTask(taskId)
    await invalidateAll()
    router.push(closeHref)
  }

  async function handleDeleteTask() {
    if (!task) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this task? This removes its comments, todos, and time logs.')) return
    await deleteTask(taskId)
    await invalidateAll()
    router.push(closeHref)
  }

  async function deleteTimesheet(timesheetId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this time entry?')) return
    setTimesheetEditBusy(true)
    try {
      await deleteTimesheetEntry(timesheetId)
      if (editingTimesheetId === timesheetId) resetTimesheetEdit()
      await invalidateAll()
    } finally {
      setTimesheetEditBusy(false)
    }
  }

  function startTimesheetEdit(entry: TimesheetEntry) {
    if (timesheetEditBusy) return
    if (editingTimesheetId && editingTimesheetId !== entry.id) return
    editingTimesheetOriginal.current = entry
    setEditingTimesheetId(entry.id)
    setEditingTimesheetForm({
      minutes: String(entry.minutes),
      date: String(entry.date).slice(0, 10),
      description: entry.description ?? '',
      billable: entry.billable,
      validated: entry.validated,
      taskId: entry.taskId ?? '',
    })
  }

  function resetTimesheetEdit() {
    setEditingTimesheetId(null)
    setEditingTimesheetForm({ minutes: '', date: '', description: '', billable: true, validated: false, taskId: '' })
    editingTimesheetOriginal.current = null
  }

  async function saveEditedTimesheet() {
    if (!editingTimesheetId || timesheetEditBusy) return
    const minutes = Number(editingTimesheetForm.minutes)
    if (!minutes || minutes <= 0 || !editingTimesheetForm.date) return
    const original = editingTimesheetOriginal.current
    const originalDate = original ? String(original.date).slice(0, 10) : ''
    const nextDescription = editingTimesheetForm.description.trim()
    const nextTaskId = editingTimesheetForm.taskId.trim()
    const noChanges =
      original &&
      Math.round(minutes) === original.minutes &&
      editingTimesheetForm.billable === original.billable &&
      editingTimesheetForm.validated === original.validated &&
      editingTimesheetForm.date === originalDate &&
      nextDescription === (original.description ?? '') &&
      nextTaskId === (original.taskId ?? '')
    if (noChanges) {
      resetTimesheetEdit()
      return
    }
    setTimesheetEditBusy(true)
    try {
      await updateTimesheetEntry(editingTimesheetId, {
        minutes,
        date: editingTimesheetForm.date,
        description: nextDescription || null,
        billable: editingTimesheetForm.billable,
        validated: editingTimesheetForm.validated,
        taskId: nextTaskId || null,
      })
      resetTimesheetEdit()
      await invalidateAll()
    } finally {
      setTimesheetEditBusy(false)
    }
  }

  async function submitComment() {
    const body = commentBody.trim()
    if (!body) return
    setCommentSaving(true)
    try {
      await createComment(taskId, { body, author: 'Alex' })
      setCommentBody('')
      await invalidateAll()
    } finally {
      setCommentSaving(false)
    }
  }

  async function addLabel() {
    const name = newLabel.trim()
    if (!name || !task) return
    await createProjectLabel(projectId, { name })
    await updateTaskLabels(task.id, Array.from(new Set([...(task.labels || []), name])))
    setNewLabel('')
    await invalidateAll()
  }

  async function removeLabel(label: string) {
    if (!task) return
    await updateTaskLabels(task.id, (task.labels || []).filter((l) => l !== label))
    await invalidateAll()
  }

  async function addTodo() {
    const text = newTodo.trim()
    if (!task || !text) return
    setTodoBusy(true)
    try {
      await createTaskTodo(task.id, { text })
      setNewTodo('')
      await invalidateAll()
    } finally {
      setTodoBusy(false)
    }
  }

  async function toggleTodo(todo: TodoItem) {
    if (!task) return
    setTodoBusy(true)
    try {
      await updateTaskTodo(task.id, todo.id, { done: !todo.done })
      await invalidateAll()
    } finally {
      setTodoBusy(false)
    }
  }

  async function renameTodo(todo: TodoItem, text: string) {
    if (!task) return
    const nextText = text.trim()
    if (!nextText || nextText === todo.text) return
    setTodoBusy(true)
    try {
      await updateTaskTodo(task.id, todo.id, { text: nextText })
      await invalidateAll()
    } finally {
      setTodoBusy(false)
    }
  }

  async function removeTodo(todoId: string) {
    if (!task) return
    setTodoBusy(true)
    try {
      await deleteTaskTodo(task.id, todoId)
      await invalidateAll()
    } finally {
      setTodoBusy(false)
    }
  }

  async function persistTodoOrder(nextTodos: TodoItem[]) {
    if (!task) return
    setTodoItems(nextTodos)
    setTodoBusy(true)
    try {
      await reorderTaskTodos(task.id, nextTodos.map((item) => item.id))
      await invalidateAll()
    } catch (error) {
      setTodoItems(task.todos)
      throw error
    } finally {
      setTodoBusy(false)
    }
  }

  async function handleTodoDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || todoBusy) return
    const oldIndex = todoItems.findIndex((item) => item.id === active.id)
    const newIndex = todoItems.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
    await persistTodoOrder(arrayMove(todoItems, oldIndex, newIndex))
  }

  const doneTodos = todoItems.filter((todo) => todo.done).length
  const totalTodos = todoItems.length
  const todoProgress = totalTodos ? `${doneTodos}/${totalTodos}` : null
  const visibleTimesheets = task ? (showValidatedTimesheets ? task.timesheets : task.timesheets.filter((entry) => !entry.validated)) : []
  const validatedCount = task ? task.timesheets.filter((entry) => entry.validated).length : 0

  return (
    <div style={overlay}>
      <Link href={closeHref} style={backdrop} aria-label="Close task drawer" />
      <aside style={{ ...drawer, ...drawerStyle }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 750 }}>Task</div>
            {todoProgress ? <div style={{ marginTop: 6 }}><span style={pill('#ecfeff', '#155e75')}>Todos {todoProgress}</span></div> : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void handleArchiveTask()} style={secondaryBtn}>Archive</button>
            <button type="button" onClick={() => void handleDeleteTask()} style={deleteTextAction}>Delete</button>
            <Link href={closeHref} style={closeBtn}>Close</Link>
          </div>
        </div>

        {error ? <div style={{ color: '#991b1b', marginBottom: 12 }}>{error instanceof Error ? error.message : 'Failed to load task'}</div> : null}

        {task ? (
          <>
            <input defaultValue={task.title} onBlur={(e) => void save({ title: e.target.value })} style={{ width: '100%', fontSize: 28, fontWeight: 800, lineHeight: 1.15, border: 'none', outline: 'none', background: 'transparent' }} />
            <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
              <Link href={`/projects/${task.project.id}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 700 }}>{task.project.name}</Link>
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
              <Row label="People">
                <TaskPeopleField
                  projectId={task.project.id}
                  taskId={task.id}
                  owner={task.owner}
                  ownerAvatarUrl={task.ownerAvatarUrl}
                  participants={task.participants}
                  assignee={task.assignee}
                  assigneeAvatarUrl={task.assigneeAvatarUrl}
                  collaborators={task.collaborators}
                  canManage={assignDecision.allowed}
                />
              </Row>
              <Row label="Priority">
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {[1, 2, 3].map((rating) => {
                    const value = rating === 3 ? 'P1' : rating === 2 ? 'P2' : 'P3'
                    const filled = (task.priority === 'P1' ? 3 : task.priority === 'P2' ? 2 : 1) >= rating
                    return <button key={rating} type="button" aria-label={`Set priority to ${rating} star${rating === 1 ? '' : 's'}`} onClick={() => void save({ priority: value })} style={{ ...starIconBtn, color: filled ? '#f59e0b' : '#cbd5e1' }}>★</button>
                  })}
                </div>
              </Row>
              <Row label="Status">
                <select value={task.statusId} onChange={(e) => void save({ statusId: e.target.value })} style={inputStyle}>
                  {(project?.statuses || []).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                </select>
              </Row>
              <Row label="Due date">
                <input type="date" defaultValue={task.dueDate ? String(task.dueDate).slice(0, 10) : ''} onChange={(e) => void save({ dueDate: e.target.value || null })} style={inputStyle} />
              </Row>
              <Row label="Labels">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(task.labels || []).map((label) => <button key={label} onClick={() => void removeLabel(label)} style={{ ...chipButton, ...tagStyle() }}>{label} ×</button>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 8 }}>
                  <input list="project-labels" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addLabel() }} placeholder="Add label" style={inputStyle} />
                  <button onClick={() => void addLabel()} style={secondaryBtn}>Add</button>
                </div>
                <datalist id="project-labels">
                  {(project?.labels || []).map((label) => <option key={label.id} value={label.name} />)}
                </datalist>
              </Row>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={sectionLabel}>Description</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{descriptionBusy ? 'Saving…' : ''}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <MarkdownDescriptionEditor
                  value={descriptionDraft}
                  onCommit={(nextValue) => {
                    if (nextValue === lastCommittedDescriptionRef.current) return
                    lastCommittedDescriptionRef.current = nextValue
                    setDescriptionDraft(nextValue)
                    void saveDescription(nextValue)
                  }}
                  onImageUpload={(file) => handleDescriptionImageUpload(file)}
                  busy={descriptionBusy}
                />
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={sectionLabel}>Timesheets</div>
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
                  <input value={timeMinutes} onChange={(e) => setTimeMinutes(e.target.value)} placeholder="Minutes" inputMode="numeric" style={inputStyle} />
                  {timesheetUsers.length ? (
                    <select value={timeUserId} onChange={(e) => setTimeUserId(e.target.value)} style={inputStyle}>
                      {timesheetUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  ) : (
                    <input value={timeUserName} onChange={(e) => setTimeUserName(e.target.value)} placeholder="User" style={inputStyle} />
                  )}
                </div>
                <input type="date" value={timeDate} onChange={(e) => setTimeDate(e.target.value)} style={inputStyle} />
                <input value={timeDescription} onChange={(e) => setTimeDescription(e.target.value)} placeholder="What was done" style={inputStyle} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 14 }}><input type="checkbox" checked={timeBillable} onChange={(e) => setTimeBillable(e.target.checked)} /> Billable</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Total {task.timesheetSummary.totalMinutes} min · Billable {task.timesheetSummary.billableMinutes} min</div>
                  <button onClick={() => void submitTime()} disabled={timeBusy || !timeMinutes} style={secondaryBtn}>{timeBusy ? 'Saving…' : 'Add time'}</button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Click a row to edit. Changes save when you click away.</div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={showValidatedTimesheets} onChange={(e) => setShowValidatedTimesheets(e.target.checked)} /> Show validated entries ({validatedCount})</label>
                {project ? (
                  <datalist id="drawer-task-options">
                    {project.recentTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </datalist>
                ) : null}
                <div style={{ display: 'grid', gap: 8 }}>
                  {visibleTimesheets.length ? visibleTimesheets.map((entry) => (
                    <div
                      key={entry.id}
                      style={{ border: editingTimesheetId === entry.id ? '1px solid var(--form-border-focus)' : '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', cursor: editingTimesheetId ? 'default' : 'pointer' }}
                      onClick={() => { if (!editingTimesheetId) startTimesheetEdit(entry) }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ fontWeight: 700 }}>{entry.userName}</div><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{entry.minutes} min · {new Date(entry.date).toLocaleDateString()}</div></div>
                      {entry.description ? <div style={{ marginTop: 6, color: 'rgba(209, 250, 229, 0.72)' }}>{entry.description}</div> : null}
                      {editingTimesheetId === entry.id ? (
                        <div
                          style={{ marginTop: 10, display: 'grid', gap: 8 }}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(event) => {
                            const next = event.relatedTarget as Node | null
                            if (!event.currentTarget.contains(next)) void saveEditedTimesheet()
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8 }}>
                            <input ref={editingTimesheetMinutesRef} value={editingTimesheetForm.minutes} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, minutes: e.target.value }))} placeholder="Minutes" inputMode="numeric" style={inputStyle} />
                            <input type="date" value={editingTimesheetForm.date} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, date: e.target.value }))} style={inputStyle} />
                          </div>
                          <input list="drawer-task-options" value={editingTimesheetForm.taskId} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, taskId: e.target.value }))} placeholder="Task ID (leave blank for project only)" style={inputStyle} />
                          <input value={editingTimesheetForm.description} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="What was done" style={inputStyle} />
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 14 }}><input type="checkbox" checked={editingTimesheetForm.billable} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, billable: e.target.checked }))} /> Billable</label>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 14 }}><input type="checkbox" checked={editingTimesheetForm.validated} onChange={(e) => setEditingTimesheetForm((prev) => ({ ...prev, validated: e.target.checked }))} /> Validated</label>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Changes save on blur.</div><button type="button" onClick={() => void deleteTimesheet(entry.id)} style={deleteTextAction}>Delete</button></div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>Billable: {entry.billable ? 'Yes' : 'No'}{entry.validated ? ' · Validated' : ''} · Click to edit</div>
                      )}
                    </div>
                  )) : <div style={{ color: 'var(--text-muted)' }}>{validatedCount ? 'All entries are validated. Toggle “Show validated entries” to review.' : 'No time logged yet.'}</div>}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={sectionLabel}>Todos</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{todoProgress || '0/0'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 8 }}>
                <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addTodo() }} placeholder="Add a checklist item" style={inputStyle} />
                <button onClick={() => void addTodo()} disabled={todoBusy || !newTodo.trim()} style={secondaryBtn}>{todoBusy ? 'Saving…' : 'Add'}</button>
              </div>
              <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>Drag to reorder.</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {todoItems.length ? (
                  <DndContext sensors={sensors} onDragEnd={(event) => { void handleTodoDragEnd(event) }}>
                    <SortableContext items={todoItems.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {todoItems.map((todo) => <SortableTodoRow key={todo.id} todo={todo} todoBusy={todoBusy} onToggle={() => void toggleTodo(todo)} onRename={(text) => void renameTodo(todo, text)} onDelete={() => void removeTodo(todo.id)} />)}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : <div style={{ color: 'var(--text-muted)' }}>No checklist items yet.</div>}
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <div style={sectionLabel}>Comments</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {task.comments.length ? task.comments.map((comment) => (
                  <div key={comment.id} style={{ border: '1px solid rgba(16, 185, 129, 0.12)', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{comment.author}</div>
                    <div style={{ marginTop: 6 }}>{comment.body}</div>
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No comments yet.</div>}
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Add a comment" style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => void submitComment()} disabled={commentSaving || !commentBody.trim()} style={primaryBtn}>{commentSaving ? 'Posting…' : 'Add comment'}</button>
                </div>
              </div>
            </div>
          </>
        ) : isLoading ? <div style={{ color: 'var(--text-muted)' }}>Loading task…</div> : null}
      </aside>
    </div>
  )
}

function SortableTodoRow({ todo, todoBusy, onToggle, onRename, onDelete }: { todo: TodoItem; todoBusy: boolean; onToggle: () => void; onRename: (text: string) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  return (
    <div ref={setNodeRef} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px', background: isDragging ? 'rgba(250, 204, 21, 0.06)' : 'var(--form-bg)', border: '1px solid var(--panel-border)', borderRadius: 12, boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.22)' : 'none', opacity: isDragging ? 0.9 : 1, transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" aria-label="Drag to reorder" {...attributes} {...listeners} disabled={todoBusy} style={dragHandleBtn}>⋮⋮</button>
      <input type="checkbox" checked={todo.done} onChange={onToggle} style={todoCheckbox} />
      <input defaultValue={todo.text} onBlur={(e) => onRename(e.target.value)} style={{ ...todoInputStyle, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? '#94a3b8' : theme.color.formText, opacity: todo.done ? 0.55 : 1 }} />
      <button onClick={onDelete} style={deleteTextAction} aria-label="Delete todo">Delete</button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={sectionLabel}>{label}</div><div style={{ marginTop: 5 }}>{children}</div></div>
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 50 }
const backdrop: React.CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.28)', pointerEvents: 'auto' }
const drawer: React.CSSProperties = { position: 'absolute', right: 0, top: 0, bottom: 0, width: 460, maxWidth: '92vw', background: 'var(--panel-bg)', borderLeft: '1px solid var(--panel-border)', padding: 22, overflowY: 'auto', pointerEvents: 'auto', boxShadow: '0 10px 30px rgba(15,23,42,0.15)' }
const closeBtn: React.CSSProperties = { textDecoration: 'none', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '9px 12px', fontWeight: 700 }
const sectionLabel: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle: React.CSSProperties = formControlMd
const chipButton: React.CSSProperties = { border: 'none', cursor: 'pointer', fontWeight: 700 }
const primaryBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
const secondaryBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
const dragHandleBtn: React.CSSProperties = { background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '4px 2px', fontWeight: 700, cursor: 'grab', lineHeight: 1, fontSize: 16 }
const todoCheckbox: React.CSSProperties = { width: 16, height: 16, borderRadius: 0, cursor: 'pointer', flex: '0 0 auto' }
const todoInputStyle: React.CSSProperties = { width: '100%', border: 'none', borderRadius: 0, padding: '8px 0', background: 'transparent', outline: 'none', boxShadow: 'none', fontSize: 13 }
const starIconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px', fontSize: 24, cursor: 'pointer', lineHeight: 1 }
