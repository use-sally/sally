'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MentionableUser } from '@sally/types/src'
import { archiveTask, createComment, createProjectLabel, createTaskTodo, deleteTask, deleteTaskTodo, getMentionableUsers, getProjectMembers, updateTask, updateTaskLabels, updateTaskTodo, uploadTaskDescriptionImage } from '../lib/api'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { canEditTask } from '../lib/task-permissions'
import { qk, useProjectQuery, useTaskQuery } from '../lib/query'
import { pill, tagStyle } from './app-shell'
import { MarkdownDescriptionEditor } from './markdown-description-editor'
import { TimesheetsTable } from './timesheets-table'
import { archiveTextAction, deleteTextAction, projectInputField } from '../lib/theme'
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

function getTextareaCaretPosition(textarea: HTMLTextAreaElement, caretIndex: number) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.boxSizing = 'border-box'
  mirror.style.font = style.font
  mirror.style.fontFamily = style.fontFamily
  mirror.style.fontSize = style.fontSize
  mirror.style.fontWeight = style.fontWeight
  mirror.style.lineHeight = style.lineHeight
  mirror.style.letterSpacing = style.letterSpacing
  mirror.style.padding = style.padding
  mirror.style.border = style.border
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.overflow = 'hidden'

  const before = textarea.value.slice(0, caretIndex)
  const after = textarea.value.slice(caretIndex) || ' '
  mirror.textContent = before
  const marker = document.createElement('span')
  marker.textContent = after[0]
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const top = marker.offsetTop - textarea.scrollTop
  const left = marker.offsetLeft - textarea.scrollLeft
  const lineHeight = Number.parseFloat(style.lineHeight || '20') || 20
  document.body.removeChild(mirror)
  return { top, left, lineHeight }
}

export function InlineTaskPanel({ taskId, projectId }: { taskId: string; projectId: string }) {
  const qc = useQueryClient()
  const { data: task, error } = useTaskQuery(taskId)
  const { data: project } = useProjectQuery(projectId)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>('P2')
  const [dueDate, setDueDate] = useState('')
  const [statusId, setStatusId] = useState('')
  const [description, setDescription] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOptions, setMentionOptions] = useState<MentionableUser[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null)
  const [mentionMenuPos, setMentionMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const [timesheetsOpen, setTimesheetsOpen] = useState(false)
  const lastCommittedDescriptionRef = useRef('')
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setAssignee(task.assignee === 'Unassigned' ? '' : task.assignee)
    setPriority(task.priority)
    setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '')
    setStatusId(task.statusId)
    const nextDescription = task.description === 'No description yet.' ? '' : task.description
    setDescription(nextDescription)
    lastCommittedDescriptionRef.current = nextDescription
  }, [task])

  useEffect(() => {
    if (!task?.project.id || !session?.account?.id) {
      setProjectRole(null)
      return
    }
    let cancelled = false
    void getProjectMembers(task.project.id)
      .then((members) => {
        if (!cancelled) setProjectRole(members.find((member) => member.accountId === session.account?.id)?.role ?? null)
      })
      .catch(() => {
        if (!cancelled) setProjectRole(null)
      })
    return () => { cancelled = true }
  }, [task?.project.id, session?.account?.id])

  useEffect(() => {
    if (!task?.project.id || !mentionQuery) {
      setMentionOptions([])
      setMentionIndex(0)
      return
    }
    let cancelled = false
    void getMentionableUsers(task.project.id, mentionQuery)
      .then((users) => {
        if (!cancelled) {
          setMentionOptions(users)
          setMentionIndex(0)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMentionOptions([])
          setMentionIndex(0)
        }
      })
    return () => { cancelled = true }
  }, [mentionQuery, task?.project.id])

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(taskId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function saveField(payload: { title?: string; assignee?: string; priority?: 'P1' | 'P2' | 'P3'; dueDate?: string | null; statusId?: string; description?: string }) {
    setBusy(true)
    try {
      await updateTask(taskId, payload)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }


  async function saveDescription(nextDescription?: string) {
    const value = nextDescription ?? description
    setBusy(true)
    try {
      await updateTask(taskId, { description: value })
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function handleDescriptionImageUpload(file: File) {
    if (!task) return null
    setBusy(true)
    try {
      const compressed = await compressImageForTask(file)
      const uploaded = await uploadTaskDescriptionImage(task.id, compressed)
      const alt = file.name.replace(/\.[^.]+$/, '') || 'reference'
      return { url: uploaded.url, alt }
    } finally {
      setBusy(false)
    }
  }

  async function addLabel() {
    const name = newLabel.trim()
    if (!task || !name) return
    setBusy(true)
    try {
      await createProjectLabel(projectId, { name })
      await updateTaskLabels(task.id, Array.from(new Set([...(task.labels || []), name])))
      setNewLabel('')
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function removeLabel(label: string) {
    if (!task) return
    setBusy(true)
    try {
      await updateTaskLabels(task.id, (task.labels || []).filter((l) => l !== label))
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function addTodo() {
    const text = newTodo.trim()
    if (!text) return
    setBusy(true)
    try {
      await createTaskTodo(taskId, { text })
      setNewTodo('')
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function toggleTodo(id: string, done: boolean) {
    setBusy(true)
    try {
      await updateTaskTodo(taskId, id, { done: !done })
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function removeTodo(id: string) {
    setBusy(true)
    try {
      await deleteTaskTodo(taskId, id)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  function syncMentionState(value: string, caretIndex: number) {
    const beforeCaret = value.slice(0, caretIndex)
    const match = beforeCaret.match(/(^|\s)@([a-zA-Z0-9._-]{0,30})$/)
    if (!match) {
      setMentionRange(null)
      setMentionMenuPos(null)
      setMentionQuery('')
      setMentionOptions([])
      setMentionIndex(0)
      return
    }
    const start = caretIndex - match[0].length + match[1].length
    setMentionRange({ start, end: caretIndex })
    setMentionQuery(match[2] || '')
    if (commentInputRef.current) {
      const coords = getTextareaCaretPosition(commentInputRef.current, caretIndex)
      setMentionMenuPos({ top: coords.top + coords.lineHeight + 6, left: coords.left })
    }
  }

  function handleCommentChange(value: string, caretIndex: number) {
    setCommentBody(value)
    syncMentionState(value, caretIndex)
  }

  function insertMention(user: MentionableUser) {
    if (!mentionRange) return
    const textarea = commentInputRef.current
    const display = (user.name || user.email.split('@')[0]).replace(/\s+/g, '.').toLowerCase()
    const nextValue = `${commentBody.slice(0, mentionRange.start)}@${display} ${commentBody.slice(mentionRange.end)}`
    const nextCaret = mentionRange.start + display.length + 2
    setCommentBody(nextValue)
    setMentionMap((current) => ({ ...current, [display]: user.accountId }))
    setMentionRange(null)
    setMentionMenuPos(null)
    setMentionQuery('')
    setMentionOptions([])
    setMentionIndex(0)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  async function addComment() {
    const body = commentBody.trim()
    if (!body) return
    const mentionedIds = Object.entries(mentionMap)
      .filter(([display]) => body.includes(`@${display}`))
      .map(([, accountId]) => accountId)
    setBusy(true)
    try {
      await createComment(taskId, { body, author: session?.account?.name || session?.account?.email, mentions: mentionedIds })
      setCommentBody('')
      setMentionMap({})
      setMentionRange(null)
      setMentionMenuPos(null)
      setMentionQuery('')
      setMentionOptions([])
      setMentionIndex(0)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function handleArchiveTask() {
    if (!task) return
    if (typeof window !== 'undefined' && !window.confirm('Archive this task? You can restore it later.')) return
    setBusy(true)
    try {
      await archiveTask(task.id)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTask() {
    if (!task) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this task? This removes its comments, todos, and time logs.')) return
    setBusy(true)
    try {
      await deleteTask(task.id)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const taskEditDecision = canEditTask({ platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole }, false)

  if (error) return <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task) return <div style={{ color: 'var(--text-muted)' }}>Loading task…</div>

  return (
    <div data-description-saving={busy ? 'true' : 'false'} style={{ borderTop: '1px solid color-mix(in srgb, var(--form-border-focus) 24%, var(--panel-border))', background: 'color-mix(in srgb, var(--panel-bg) 94%, white)', padding: 18, display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Description</div>
          <MarkdownDescriptionEditor
            value={description}
            onCommit={(nextValue) => {
              if (!taskEditDecision.allowed) return
              if (nextValue === lastCommittedDescriptionRef.current) return
              lastCommittedDescriptionRef.current = nextValue
              setDescription(nextValue)
              void saveDescription(nextValue)
            }}
            onImageUpload={(file) => taskEditDecision.allowed ? handleDescriptionImageUpload(file) : Promise.resolve(null)}
            busy={busy}
          />
          {busy ? <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>Saving…</div> : null}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>Checklist</div>
          {taskEditDecision.visible ? <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && taskEditDecision.allowed) { e.preventDefault(); void addTodo() } }} style={inputStyle} placeholder="Add checklist item and press Enter" disabled={!taskEditDecision.allowed} /> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {task.todos.map((todo) => <div key={todo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={todo.done} onChange={() => taskEditDecision.allowed ? void toggleTodo(todo.id, todo.done) : undefined} disabled={!taskEditDecision.allowed} /> <span style={{ textDecoration: todo.done ? 'line-through' : 'none', opacity: todo.done ? 0.55 : 1 }}>{todo.text}</span></label>{taskEditDecision.visible ? <button onClick={() => void removeTodo(todo.id)} style={deleteTextAction}>Delete</button> : null}</div>)}
          </div>
        </div>
      </div>


      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>Comments</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto' }}>
          {task.comments.map((comment) => <div key={comment.id} style={{ background: 'var(--form-bg)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 10 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{comment.author}</div><div style={{ marginTop: 6, color: 'rgba(209, 250, 229, 0.62)', fontSize: 14 }}>{comment.body}</div></div>)}
        </div>
        {taskEditDecision.visible ? <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <textarea
              ref={commentInputRef}
              value={commentBody}
              onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onClick={(e) => syncMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
              onKeyUp={(e) => syncMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
              onKeyDown={(e) => {
                if (mentionOptions.length) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex((current) => (current + 1) % mentionOptions.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex((current) => (current - 1 + mentionOptions.length) % mentionOptions.length)
                    return
                  }
                  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault()
                    const selected = mentionOptions[mentionIndex] || mentionOptions[0]
                    if (selected) insertMention(selected)
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setMentionOptions([])
                    setMentionIndex(0)
                    setMentionRange(null)
                    setMentionMenuPos(null)
                    setMentionQuery('')
                    return
                  }
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void addComment()
                }
              }}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 84 }}
              placeholder="Add comment… Use @name to mention a teammate."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Type <strong>@</strong> to mention a teammate. Press <strong>⌘/Ctrl+Enter</strong> to submit.</div>
              <button onClick={() => void addComment()} style={btnStyle} disabled={!taskEditDecision.allowed}>Comment</button>
            </div>
          </div>
          {mentionOptions.length && mentionMenuPos ? (
            <div style={{ position: 'absolute', top: mentionMenuPos.top, left: mentionMenuPos.left, width: 260, maxWidth: 'min(320px, calc(100% - 12px))', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
              {mentionOptions.map((user, index) => (
                <button
                  key={user.accountId}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMention(user)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--panel-border)', background: index === mentionIndex ? 'color-mix(in srgb, var(--form-border-focus) 18%, transparent)' : 'transparent', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user.name || user.email}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div> : null}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          onClick={() => setTimesheetsOpen((current) => !current)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>Timesheets</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{timesheetsOpen ? 'Hide' : 'Show'}</span>
        </button>
        {timesheetsOpen ? <TimesheetsTable lockedProjectId={projectId} lockedTaskId={taskId} lockedProjectName={project?.name} showProjectColumn={false} showCustomerColumn={false} showTaskColumn={false} showValidationColumn={false} /> : null}
      </div>

      {taskEditDecision.visible ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--panel-border)' }}>
        <button onClick={() => void handleArchiveTask()} disabled={busy || !taskEditDecision.allowed} aria-label="Archive task" title="Archive task" style={archiveTextAction}>Archive</button>
        <button onClick={() => void handleDeleteTask()} disabled={busy || !taskEditDecision.allowed} aria-label="Delete task" title="Delete task" style={deleteTextAction}>Delete</button>
      </div> : null}
    </div>
  )
}

const inputStyle: React.CSSProperties = { ...projectInputField }
const btnStyle: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
