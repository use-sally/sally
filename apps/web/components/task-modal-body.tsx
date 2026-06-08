'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AccountIntegrationStatus, MentionableUser, ProviderResource, TaskConnectedResource } from '@sally/types/src'
import { archiveTask, createComment, createProjectLabel, createTaskResource, createTaskTodo, deleteTask, deleteTaskResource, deleteTaskTodo, getMentionableUsers, getProjectMembers, searchIntegrationResources, updateTask, updateTaskLabels, updateTaskTodo, uploadTaskDescriptionImage } from '../lib/api'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { canEditTask } from '../lib/task-permissions'
import { qk, useProjectQuery, useProjectsQuery, useTaskQuery } from '../lib/query'
import { pill, tagStyle } from './app-shell'
import { MarkdownDescriptionEditor, renderMarkdownToHtml } from './markdown-description-editor'
import { TimesheetsTable } from './timesheets-table'
import { AssigneeAvatar } from './assignee-avatar'
import { archiveTextAction, deleteTextAction, projectInputField } from '../lib/theme'
const commentSlashActions = [
  { command: 'h1', label: 'Heading 1', description: 'Large section heading', insert: '# ' },
  { command: 'h2', label: 'Heading 2', description: 'Medium section heading', insert: '## ' },
  { command: 'h3', label: 'Heading 3', description: 'Small section heading', insert: '### ' },
  { command: 'bullet', label: 'Bullet list', description: 'Start an unordered list', insert: '- ' },
  { command: 'numbered', label: 'Numbered list', description: 'Start an ordered list', insert: '1. ' },
  { command: 'quote', label: 'Quote', description: 'Insert a blockquote', insert: '> ' },
  { command: 'code', label: 'Code block', description: 'Insert a fenced code block', insert: '```\n\n```' },
  { command: 'bold', label: 'Bold', description: 'Strong text', insert: '**text**' },
  { command: 'italic', label: 'Italic', description: 'Emphasized text', insert: '_text_' },
  { command: 'link', label: 'Link', description: 'Markdown link', insert: '[text](https://)' },
  { command: 'image', label: 'Image', description: 'Upload and insert an image', insert: '' },
  { command: 'googledrive', label: 'Google Drive', description: 'Search connected Google Drive files', insert: '/googledrive ' },
  { command: 'sharepoint', label: 'SharePoint', description: 'Search connected SharePoint files', insert: '/sharepoint ' },
  { command: 'onedrive', label: 'OneDrive', description: 'Search connected OneDrive files', insert: '/onedrive ' },
  { command: 'dropbox', label: 'Dropbox', description: 'Search connected Dropbox files', insert: '/dropbox ' },
]

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

export function TaskModalBody({ taskId, projectId }: { taskId: string; projectId: string }) {
  const qc = useQueryClient()
  const { data: task, error } = useTaskQuery(taskId)
  const { data: project } = useProjectQuery(projectId)
  const { data: projects = [] } = useProjectsQuery()
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
  const [commentFileCommand, setCommentFileCommand] = useState<{ from: number; to: number; query: string; providerCommand: string; top: number; left: number } | null>(null)
  const [commentFileResults, setCommentFileResults] = useState<ProviderResource[]>([])
  const [commentSlashCommand, setCommentSlashCommand] = useState<{ from: number; to: number; query: string; top: number; left: number } | null>(null)
  const [commentSlashIndex, setCommentSlashIndex] = useState(0)
  const [commentFileLoading, setCommentFileLoading] = useState(false)
  const [commentFileError, setCommentFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const [timesheetsOpen, setTimesheetsOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [moveProjectOpen, setMoveProjectOpen] = useState(false)
  const [moveProjectId, setMoveProjectId] = useState(projectId)
  const [resourceProvider, setResourceProvider] = useState<TaskConnectedResource['provider']>('GOOGLE_DRIVE')
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceResults, setResourceResults] = useState<ProviderResource[]>([])
  const [searchingResources, setSearchingResources] = useState(false)
  const [resourceError, setResourceError] = useState<string | null>(null)
  const lastCommittedDescriptionRef = useRef('')
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)
  const commentImageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingCommentImageCommandRef = useRef<typeof commentSlashCommand>(null)
  const commentSlashWheelAccumulatorRef = useRef(0)
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    setMoveProjectId(projectId)
  }, [projectId])

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

  async function invalidateAll(extraProjectId?: string) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(taskId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      extraProjectId ? qc.invalidateQueries({ queryKey: qk.project(extraProjectId) }) : Promise.resolve(),
      qc.invalidateQueries({ queryKey: ['projectTasks'] }),
      qc.invalidateQueries({ queryKey: ['board'] }),
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

  function providerSlug(provider: TaskConnectedResource['provider']): AccountIntegrationStatus['slug'] {
    if (provider === 'GOOGLE_DRIVE') return 'google-drive'
    if (provider === 'MICROSOFT_365') return 'microsoft-365'
    return 'dropbox'
  }

  function providerLabel(provider: TaskConnectedResource['provider']) {
    if (provider === 'GOOGLE_DRIVE') return 'Google Drive'
    if (provider === 'MICROSOFT_365') return 'Microsoft 365'
    return 'Dropbox'
  }

  async function searchResources() {
    setSearchingResources(true)
    setResourceError(null)
    try {
      const response = await searchIntegrationResources(providerSlug(resourceProvider), resourceSearch.trim())
      setResourceResults(response.items)
    } catch (err) {
      setResourceResults([])
      setResourceError(err instanceof Error ? err.message : 'Failed to search connected storage')
    } finally {
      setSearchingResources(false)
    }
  }

  async function attachProviderResource(resource: ProviderResource) {
    setBusy(true)
    setResourceError(null)
    try {
      await createTaskResource(taskId, { provider: resource.provider, kind: resource.kind, externalId: resource.externalId, name: resource.name, webUrl: resource.webUrl, mimeType: resource.mimeType, metadata: resource.metadata })
      setResourceResults([])
      setResourceSearch('')
      await invalidateAll()
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : 'Failed to attach resource')
    } finally {
      setBusy(false)
    }
  }

  async function removeResource(resourceId: string) {
    setBusy(true)
    try {
      await deleteTaskResource(taskId, resourceId)
      await invalidateAll()
    } finally {
      setBusy(false)
    }
  }

  const searchDescriptionFiles = useCallback(async (query: string, providerCommand: string) => {
    if (providerCommand === 'sharepoint') {
      const response = await searchIntegrationResources('microsoft-365', query, { source: 'sharepoint' })
      return response.items
    }
    if (providerCommand === 'onedrive') {
      const response = await searchIntegrationResources('microsoft-365', query, { source: 'onedrive' })
      return response.items
    }
    if (providerCommand === 'dropbox') {
      const response = await searchIntegrationResources('dropbox', query)
      return response.items
    }
    const response = await searchIntegrationResources('google-drive', query)
    return response.items
  }, [])

  useEffect(() => {
    if (!commentFileCommand) return
    let cancelled = false
    setCommentFileLoading(true)
    setCommentFileError(null)
    const timeout = window.setTimeout(() => {
      searchDescriptionFiles(commentFileCommand.query, commentFileCommand.providerCommand)
        .then((items) => { if (!cancelled) setCommentFileResults(items) })
        .catch((error) => {
          if (!cancelled) {
            setCommentFileResults([])
            setCommentFileError(error instanceof Error ? error.message : 'Failed to search files')
          }
        })
        .finally(() => { if (!cancelled) setCommentFileLoading(false) })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [commentFileCommand?.query, commentFileCommand?.providerCommand, searchDescriptionFiles])

  function insertCommentFileResource(resource: ProviderResource) {
    if (!commentFileCommand) return
    const nextValue = `${commentBody.slice(0, commentFileCommand.from)}[${resource.name}](${resource.webUrl}) ${commentBody.slice(commentFileCommand.to)}`
    const nextCaret = commentFileCommand.from + resource.name.length + resource.webUrl.length + 5
    setCommentBody(nextValue)
    setCommentFileCommand(null)
    setCommentFileResults([])
    setCommentFileError(null)
    setCommentSlashCommand(null)
    requestAnimationFrame(() => {
      commentInputRef.current?.focus()
      commentInputRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
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
    setCommentFileCommand(null)
    setCommentFileResults([])
    const start = caretIndex - match[0].length + match[1].length
    setMentionRange({ start, end: caretIndex })
    setMentionQuery(match[2] || '')
    if (commentInputRef.current) {
      const coords = getTextareaCaretPosition(commentInputRef.current, caretIndex)
      setMentionMenuPos({ top: coords.top + coords.lineHeight + 6, left: coords.left })
    }
  }

  function syncCommentFileCommand(value: string, caretIndex: number) {
    const beforeCaret = value.slice(0, caretIndex)
    const match = beforeCaret.match(/(?:^|\s)\/(googledrive|gdrive|sharepoint|onedrive|dropbox)(?:\s+([^\n]*))?$/i)
    if (!match) {
      setCommentFileCommand(null)
      setCommentFileResults([])
      setCommentFileError(null)
      return
    }
    setMentionOptions([])
    setMentionIndex(0)
    setMentionRange(null)
    setMentionMenuPos(null)
    setMentionQuery('')
    const commandText = match[0].trimStart()
    const from = caretIndex - commandText.length
    if (commentInputRef.current) {
      const coords = getTextareaCaretPosition(commentInputRef.current, caretIndex)
      setCommentFileCommand({ from, to: caretIndex, query: (match[2] || '').trim(), providerCommand: match[1].toLowerCase(), top: coords.top + coords.lineHeight + 6, left: coords.left })
    }
  }

  function syncCommentSlashCommand(value: string, caretIndex: number) {
    const beforeCaret = value.slice(0, caretIndex)
    const match = beforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,24})$/)
    if (!match) {
      setCommentSlashCommand(null)
      return
    }
    setMentionOptions([])
    setCommentFileCommand(null)
    setCommentFileResults([])
    const commandText = match[0].trimStart()
    const from = caretIndex - commandText.length
    if (commentInputRef.current) {
      const coords = getTextareaCaretPosition(commentInputRef.current, caretIndex)
      setCommentSlashCommand({ from, to: caretIndex, query: match[1].toLowerCase(), top: coords.top + coords.lineHeight + 6, left: coords.left })
      setCommentSlashIndex(0)
    }
  }

  function syncCommentMenus(value: string, caretIndex: number) {
    const beforeCaret = value.slice(0, caretIndex)
    if (/(?:^|\s)\/(googledrive|gdrive|sharepoint|onedrive|dropbox)(?:\s+([^\n]*))?$/i.test(beforeCaret)) syncCommentFileCommand(value, caretIndex)
    else if (/(?:^|\s)\/([a-zA-Z0-9_-]{0,24})$/.test(beforeCaret)) syncCommentSlashCommand(value, caretIndex)
    else syncMentionState(value, caretIndex)
  }

  function handleCommentChange(value: string, caretIndex: number) {
    setCommentBody(value)
    syncCommentMenus(value, caretIndex)
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
      setCommentFileCommand(null)
      setCommentFileResults([])
      setCommentFileError(null)
      setCommentSlashCommand(null)
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

  async function handleMoveTask() {
    if (!task || moveProjectId === projectId) return
    setBusy(true)
    try {
      await updateTask(task.id, { projectId: moveProjectId })
      setMoveProjectOpen(false)
      await invalidateAll(moveProjectId)
    } finally {
      setBusy(false)
    }
  }

  function insertCommentSlashAction(action: typeof commentSlashActions[number]) {
    if (!commentSlashCommand) return
    if (action.command === 'image') {
      pendingCommentImageCommandRef.current = commentSlashCommand
      commentImageInputRef.current?.click()
      return
    }
    const nextValue = `${commentBody.slice(0, commentSlashCommand.from)}${action.insert}${commentBody.slice(commentSlashCommand.to)}`
    const nextCaret = commentSlashCommand.from + action.insert.length
    setCommentBody(nextValue)
    setCommentSlashCommand(null)
    requestAnimationFrame(() => {
      commentInputRef.current?.focus()
      commentInputRef.current?.setSelectionRange(nextCaret, nextCaret)
      if (action.insert.startsWith('/')) syncCommentMenus(nextValue, nextCaret)
    })
  }

  async function handleCommentImageSelected(file: File | undefined) {
    if (!file || !task) return
    const command = pendingCommentImageCommandRef.current
    pendingCommentImageCommandRef.current = null
    setBusy(true)
    try {
      const uploaded = await handleDescriptionImageUpload(file)
      if (!uploaded) return
      const alt = uploaded.alt || file.name.replace(/\.[^.]+$/, '') || 'reference'
      const imageMarkdown = `![${alt}](${uploaded.url}) `
      const from = command?.from ?? commentBody.length
      const to = command?.to ?? commentBody.length
      const nextValue = `${commentBody.slice(0, from)}${imageMarkdown}${commentBody.slice(to)}`
      const nextCaret = from + imageMarkdown.length
      setCommentBody(nextValue)
      setCommentSlashCommand(null)
      requestAnimationFrame(() => {
        commentInputRef.current?.focus()
        commentInputRef.current?.setSelectionRange(nextCaret, nextCaret)
      })
    } finally {
      setBusy(false)
    }
  }

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const taskEditDecision = canEditTask({ platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole }, false)

  if (error) return <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task) return <div style={{ color: 'var(--text-muted)' }}>Loading task…</div>

  return (
    <div data-description-saving={busy ? 'true' : 'false'} style={{ borderTop: '1px solid color-mix(in srgb, var(--form-border-focus) 24%, var(--panel-border))', background: 'color-mix(in srgb, var(--panel-bg) 94%, white)', padding: 18, display: 'grid', gap: 16, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <style>{`
        .comment-markdown blockquote {
          margin: 10px 0;
          padding: 9px 12px;
          border-left: 4px solid var(--form-border-focus);
          border-radius: 10px;
          background: color-mix(in srgb, var(--form-border-focus) 10%, transparent);
          color: var(--text-secondary);
        }
        .comment-markdown pre {
          margin: 10px 0;
          padding: 10px 12px;
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.78);
          color: #e5e7eb;
          overflow-x: auto;
        }
        .comment-markdown code {
          border-radius: 6px;
          padding: 2px 5px;
          background: rgba(15, 23, 42, 0.68);
          color: #e5e7eb;
        }
        .comment-markdown pre code {
          padding: 0;
          background: transparent;
        }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ minWidth: 0 }}>
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
            onFileSearch={taskEditDecision.allowed ? searchDescriptionFiles : undefined}
            busy={busy}
          />
          {busy ? <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 12 }}>Saving…</div> : null}
        </div>
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>Checklist</div>
          {taskEditDecision.visible ? <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && taskEditDecision.allowed) { e.preventDefault(); void addTodo() } }} style={inputStyle} placeholder="Add checklist item and press Enter" disabled={!taskEditDecision.allowed} /> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {task.todos.map((todo) => <div key={todo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={todo.done} onChange={() => taskEditDecision.allowed ? void toggleTodo(todo.id, todo.done) : undefined} disabled={!taskEditDecision.allowed} /> <span style={{ textDecoration: todo.done ? 'line-through' : 'none', opacity: todo.done ? 0.55 : 1 }}>{todo.text}</span></label>{taskEditDecision.visible ? <button onClick={() => void removeTodo(todo.id)} style={deleteTextAction}>Delete</button> : null}</div>)}
          </div>
        </div>
      </div>

      <div style={sectionDivider} />

      <div style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          onClick={() => setCommentsOpen((current) => !current)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>Comments{task.comments.length ? ` (${task.comments.length})` : ''}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{commentsOpen ? 'Hide' : 'Show'}</span>
        </button>
        {commentsOpen ? <>
          <div style={{ display: 'grid', gap: 8 }}>
            {task.comments.map((comment) => (
              <div key={comment.id} style={{ background: 'var(--form-bg)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AssigneeAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} size={28} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{comment.author}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                <div className="comment-markdown" style={{ marginTop: 8, color: 'rgba(209, 250, 229, 0.72)', fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(comment.body) }} />
              </div>
            ))}
          </div>
          {taskEditDecision.visible ? <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
          <input ref={commentImageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void handleCommentImageSelected(file) }} />
          <div style={{ display: 'grid', gap: 8 }}>
            <MarkdownDescriptionEditor
              value={commentBody}
              onChange={setCommentBody}
              onCommit={setCommentBody}
              onImageUpload={(file) => taskEditDecision.allowed ? handleDescriptionImageUpload(file) : Promise.resolve(null)}
              onFileSearch={taskEditDecision.allowed ? searchDescriptionFiles : undefined}
              busy={busy || !taskEditDecision.allowed}
              compact
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Use the rich Markdown editor. Type <strong>/</strong> for formatting, images, and connected file search.</div>
              <button type="button" onClick={() => void addComment()} style={btnStyle} disabled={busy || !commentBody.trim() || !taskEditDecision.allowed}>Comment</button>
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
          {commentSlashCommand ? (
            <div onWheelCapture={(event) => { event.preventDefault(); event.stopPropagation() }} onWheel={(event) => { event.preventDefault(); event.stopPropagation(); commentSlashWheelAccumulatorRef.current += event.deltaY; if (Math.abs(commentSlashWheelAccumulatorRef.current) < 80) return; setCommentSlashIndex((current) => current + (commentSlashWheelAccumulatorRef.current > 0 ? 1 : -1)); commentSlashWheelAccumulatorRef.current = 0 }} style={{ position: 'absolute', top: commentSlashCommand.top, left: commentSlashCommand.left, width: 340, maxWidth: 'min(360px, calc(100% - 12px))', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)', fontSize: 12 }}>Markdown actions · ↑↓ Enter</div>
              {(() => {
                const actions = commentSlashActions.filter((action) => !commentSlashCommand.query || action.command.includes(commentSlashCommand.query) || action.label.toLowerCase().includes(commentSlashCommand.query)).slice(0, 10)
                const start = actions.length ? commentSlashIndex % actions.length : 0
                const visibleActions = actions.slice(start).concat(actions.slice(0, start))
                return visibleActions.map((action, index) => {
                  const actualIndex = actions.indexOf(action)
                  return (
                    <button key={action.command} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCommentSlashAction(action)} style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--panel-border)', padding: '10px 12px', background: index === 0 ? 'color-mix(in srgb, var(--form-border-focus) 18%, transparent)' : 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                      <div style={{ fontWeight: 800 }}>/{action.command} · {action.label}</div>
                      <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 12 }}>{action.description}</div>
                    </button>
                  )
                })
              })()}
            </div>
          ) : null}
          {commentFileCommand ? (
            <div style={{ position: 'absolute', top: commentFileCommand.top, left: commentFileCommand.left, width: 340, maxWidth: 'min(360px, calc(100% - 12px))', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)', fontSize: 12 }}>
                {commentFileLoading ? 'Searching connected files…' : commentFileCommand.query ? `/${commentFileCommand.providerCommand} files matching “${commentFileCommand.query}”` : `Type after /${commentFileCommand.providerCommand} to search connected files`}
              </div>
              {commentFileError ? <div style={{ padding: 10, color: 'var(--danger-text)', fontSize: 13 }}>{commentFileError}</div> : null}
              {!commentFileError && commentFileResults.length ? commentFileResults.slice(0, 8).map((resource) => (
                <button key={`${resource.provider}:${resource.externalId}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCommentFileResource(resource)} style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--panel-border)', padding: '10px 12px', background: 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.name}</div>
                  <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 12 }}>{resource.provider.replace('_', ' ').toLowerCase()} · {resource.kind.toLowerCase()}</div>
                </button>
              )) : null}
              {!commentFileLoading && !commentFileError && !commentFileResults.length ? <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 13 }}>No files found. Make sure your account is connected in Profile → Connected storage.</div> : null}
            </div>
          ) : null}
          </div> : null}
        </> : null}
      </div>

      <div style={sectionDivider} />

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

      {taskEditDecision.visible ? <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--panel-border)', flexWrap: 'wrap' }}>
        <button onClick={() => void handleArchiveTask()} disabled={busy || !taskEditDecision.allowed} aria-label="Archive task" title="Archive task" style={archiveTextAction}>Archive</button>
        {moveProjectOpen ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={moveProjectId} onChange={(event) => setMoveProjectId(event.target.value)} disabled={busy || !taskEditDecision.allowed} style={{ ...inputStyle, minWidth: 220 }} aria-label="Move task to project">
              {projects.map((projectOption) => <option key={projectOption.id} value={projectOption.id}>{projectOption.name}</option>)}
            </select>
            <button type="button" onClick={() => void handleMoveTask()} disabled={busy || !taskEditDecision.allowed || moveProjectId === projectId} style={archiveTextAction}>Move</button>
            <button type="button" onClick={() => { setMoveProjectOpen(false); setMoveProjectId(projectId) }} disabled={busy} style={archiveTextAction}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setMoveProjectOpen(true)} disabled={busy || !taskEditDecision.allowed || projects.length <= 1} style={archiveTextAction}>Move</button>
        )}
        <button onClick={() => void handleDeleteTask()} disabled={busy || !taskEditDecision.allowed} aria-label="Delete task" title="Delete task" style={deleteTextAction}>Delete</button>
      </div> : null}

    </div>
  )
}

const inputStyle: React.CSSProperties = { ...projectInputField }
const btnStyle: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
const sectionDivider: React.CSSProperties = { height: 1, background: 'var(--panel-border)', opacity: 0.85 }
