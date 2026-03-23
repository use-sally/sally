'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createComment, createProjectLabel, createTaskTodo, deleteTaskTodo, updateTask, updateTaskLabels, updateTaskTodo, uploadTaskDescriptionImage } from '../lib/api'
import { qk, useProjectQuery, useTaskQuery } from '../lib/query'
import { pill, tagStyle } from './app-shell'
import { MarkdownDescriptionEditor } from './markdown-description-editor'
import { TimesheetsTable } from './timesheets-table'
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
  const [busy, setBusy] = useState(false)
  const lastCommittedDescriptionRef = useRef('')

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

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(taskId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projects }),
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

  async function addComment() {
    const body = commentBody.trim()
    if (!body) return
    setBusy(true)
    try {
      await createComment(taskId, { body, author: 'Alex' })
      setCommentBody('')
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task) return <div style={{ color: '#64748b' }}>Loading task…</div>

  return (
    <div data-description-saving={busy ? 'true' : 'false'} style={{ borderTop: '1px solid #eef2f7', background: '#f8fafc', padding: 18, display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Description</div>
          <MarkdownDescriptionEditor
            value={description}
            onCommit={(nextValue) => { if (nextValue === lastCommittedDescriptionRef.current) return; lastCommittedDescriptionRef.current = nextValue; void saveDescription(nextValue) }}
            onImageUpload={(file) => handleDescriptionImageUpload(file)}
            busy={busy}
          />
          {busy ? <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>Saving…</div> : null}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Checklist</div>
          <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTodo() } }} style={inputStyle} placeholder="Add checklist item and press Enter" />
          <div style={{ display: 'grid', gap: 8 }}>
            {task.todos.map((todo) => <div key={todo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={todo.done} onChange={() => void toggleTodo(todo.id, todo.done)} /> {todo.text}</label><button onClick={() => void removeTodo(todo.id)} style={ghostIconBtn}>🗑️</button></div>)}
          </div>
        </div>
      </div>


      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Timesheets</div>
        <TimesheetsTable lockedProjectId={projectId} lockedTaskId={taskId} lockedProjectName={project?.name} showProjectColumn={false} showCustomerColumn={false} showTaskColumn={false} showValidationColumn={false} />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Comments</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto' }}>
          {task.comments.map((comment) => <div key={comment.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{comment.author}</div><div style={{ marginTop: 6, color: '#475569', fontSize: 14 }}>{comment.body}</div></div>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addComment() } }} style={inputStyle} placeholder="Add comment" />
          <button onClick={() => void addComment()} style={btnStyle}>Comment</button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff' }
const btnStyle: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
const ghostIconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }
