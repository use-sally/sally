'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { MentionableUser, TaskDetail } from '@sally/types/src'
import { AppShell, panel, priorityStars, tagStyle } from '../../../components/app-shell'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { MarkdownDescriptionEditor } from '../../../components/markdown-description-editor'
import { TaskDescriptionRender } from '../../../components/task-description-render'
import { getWorkspaceId, loadSession } from '../../../lib/auth'
import { createComment, createTaskTodo, deleteTaskTodo, getMentionableUsers, getProjectMembers, getTask, updateTask, updateTaskLabels, updateTaskTodo, uploadTaskDescriptionImage } from '../../../lib/api'
import { canEditTask } from '../../../lib/task-permissions'
import { projectInputField } from '../../../lib/theme'

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [taskId, setTaskId] = useState('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOptions, setMentionOptions] = useState<MentionableUser[]>([])
  const [mentionAnchor, setMentionAnchor] = useState<string | null>(null)
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    void params.then((p) => setTaskId(p.taskId))
  }, [params])

  useEffect(() => {
    if (!taskId) return
    void getTask(taskId).then(setTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
  }, [taskId])

  useEffect(() => {
    if (!task) return
    setTitleDraft(task.title)
    setDescriptionDraft(task.description || '')
    setLabelsDraft((task.labels || []).join(', '))
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
      return
    }
    let cancelled = false
    void getMentionableUsers(task.project.id, mentionQuery)
      .then((users) => { if (!cancelled) setMentionOptions(users) })
      .catch(() => { if (!cancelled) setMentionOptions([]) })
    return () => { cancelled = true }
  }, [mentionQuery, task?.project.id])

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const taskEditDecision = canEditTask({ platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole }, false)

  const refreshTask = async () => {
    if (!taskId) return
    const updated = await getTask(taskId)
    setTask(updated)
  }

  const saveTaskField = async (patch: Record<string, unknown>, field: string) => {
    if (!task) return
    setSavingField(field)
    try {
      await updateTask(task.id, patch)
      await refreshTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    } finally {
      setSavingField(null)
    }
  }

  const handleCommentChange = (value: string) => {
    setCommentBody(value)
    const match = value.match(/(^|\s)(@([a-zA-Z0-9._-]{0,30}))$/)
    if (!match) {
      setMentionAnchor(null)
      setMentionQuery('')
      setMentionOptions([])
      return
    }
    setMentionAnchor(match[2])
    setMentionQuery(match[3] || '')
  }

  const insertMention = (user: MentionableUser) => {
    if (!mentionAnchor) return
    const display = (user.name || user.email.split('@')[0]).replace(/\s+/g, '.').toLowerCase()
    setCommentBody((current) => current.replace(new RegExp(`${mentionAnchor}$`), `@${display} `))
    setMentionMap((current) => ({ ...current, [display]: user.accountId }))
    setMentionAnchor(null)
    setMentionQuery('')
    setMentionOptions([])
  }

  const handleSubmitComment = async () => {
    if (!task) return
    const body = commentBody.trim()
    if (!body) return
    const mentionedIds = Object.entries(mentionMap).filter(([display]) => body.includes(`@${display}`)).map(([, accountId]) => accountId)
    setSubmittingComment(true)
    try {
      await createComment(task.id, { body, author: session?.account?.name || session?.account?.email, mentions: mentionedIds })
      await refreshTask()
      setCommentBody('')
      setMentionMap({})
      setMentionAnchor(null)
      setMentionQuery('')
      setMentionOptions([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  return (
    <AppShell
      title=""
      subtitle={task ? `${task.project.name} · ${task.status}` : 'Task detail'}
      actions={task ? <Link href={`/projects/${task.project.id}/board`} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', borderRadius: 12, padding: '11px 14px', fontWeight: 700, textDecoration: 'none' }}>Back to board</Link> : null}
    >
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error}</div> : null}
      {task ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            {taskEditDecision.visible ? (
              editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => {
                    setEditingTitle(false)
                    if (titleDraft.trim() && titleDraft.trim() !== task.title) void saveTaskField({ title: titleDraft.trim() }, 'title')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                    if (event.key === 'Escape') {
                      setTitleDraft(task.title)
                      setEditingTitle(false)
                    }
                  }}
                  disabled={savingField === 'title'}
                  style={taskHeaderTitleInput}
                />
              ) : (
                <button type="button" onClick={() => setEditingTitle(true)} style={taskHeaderTitleButton}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6em', marginRight: 8 }}>#{task.number}</span> : null}{task.title}</button>
              )
            ) : <div style={taskHeaderTitleText}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6em', marginRight: 8 }}>#{task.number}</span> : null}{task.title}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
            <div style={panel}>
              <div style={sectionLabel}>Description</div>
              <div style={{ marginTop: 10, lineHeight: 1.6 }}>
                {taskEditDecision.visible ? (
                  <MarkdownDescriptionEditor
                    value={descriptionDraft}
                    onCommit={(nextValue) => { if (nextValue !== (task.description || '')) { setDescriptionDraft(nextValue); void saveTaskField({ description: nextValue }, 'description') } }}
                    onImageUpload={async (file) => {
                      const base64 = await fileToBase64(file)
                      return uploadTaskDescriptionImage(task.id, { base64, fileName: file.name, mimeType: file.type })
                    }}
                    busy={savingField === 'description'}
                  />
                ) : <TaskDescriptionRender description={task.description} />}
              </div>

              <div style={{ ...sectionLabel, marginTop: 24 }}>Tags</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {taskEditDecision.visible ? (
                  <input
                    value={labelsDraft}
                    onChange={(event) => setLabelsDraft(event.target.value)}
                    onBlur={() => {
                      const labels = Array.from(new Set(labelsDraft.split(',').map((label) => label.trim()).filter(Boolean)))
                      void updateTaskLabels(task.id, labels).then(refreshTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to update tags'))
                    }}
                    placeholder="comma, separated, tags"
                    style={projectInputField}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: 'var(--text-muted)' }}>No tags.</span>}</div>
                )}
              </div>

              <div style={{ ...sectionLabel, marginTop: 24 }}>Checklist</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {task.todos?.length ? task.todos.map((todo) => (
                  <div key={todo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', flex: 1 }}>
                      <input type="checkbox" checked={todo.done} onChange={() => taskEditDecision.allowed ? void updateTaskTodo(task.id, todo.id, { done: !todo.done, text: todo.text }).then(refreshTask) : undefined} disabled={!taskEditDecision.allowed} />
                      <span style={{ textDecoration: todo.done ? 'line-through' : 'none', opacity: todo.done ? 0.6 : 1 }}>{todo.text}</span>
                    </label>
                    {taskEditDecision.visible ? <button type="button" onClick={() => void deleteTaskTodo(task.id, todo.id).then(refreshTask)} style={taskMiniDelete}>Delete</button> : null}
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No checklist items.</div>}
                {taskEditDecision.visible ? <input value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter' && newTodo.trim()) {
                    event.preventDefault()
                    void createTaskTodo(task.id, { text: newTodo.trim() }).then(async () => { setNewTodo(''); await refreshTask() })
                  }
                }} placeholder="Add checklist item and press Enter" style={projectInputField} /> : null}
              </div>

              <div style={{ ...sectionLabel, marginTop: 24 }}>Comments</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
                {task.comments.length ? task.comments.map((comment) => (
                  <div key={comment.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AssigneeAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} size={32} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{comment.author}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{comment.body}</div>
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No comments yet.</div>}

                {taskEditDecision.visible ? (
                  <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
                    <textarea
                      value={commentBody}
                      onChange={(event) => handleCommentChange(event.target.value)}
                      placeholder="Write a comment… Use @name to mention a teammate."
                      rows={4}
                      disabled={!taskEditDecision.allowed}
                      style={{ ...projectInputField, padding: '12px 14px', resize: 'vertical' }}
                    />
                    {mentionOptions.length ? (
                      <div style={{ position: 'absolute', top: 'calc(100% - 8px)', left: 0, width: 'min(360px, 100%)', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
                        {mentionOptions.map((user) => (
                          <button key={user.accountId} type="button" onClick={() => insertMention(user)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--panel-border)', background: 'transparent', cursor: 'pointer' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user.name || user.email}</div>
                            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Type <strong>@</strong> to mention a teammate.</div>
                      <button type="button" onClick={() => void handleSubmitComment()} disabled={!taskEditDecision.allowed || submittingComment || !commentBody.trim()} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>
                        {submittingComment ? 'Posting…' : 'Post comment'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div style={panel}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={sectionLabel}>Project</div><div style={{ marginTop: 4 }}><Link href={`/projects/${task.project.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 700 }}>{task.project.name}</Link></div></div>
                <div><div style={sectionLabel}>Assignee</div><div style={{ marginTop: 6 }}><AssigneeAvatar name={task.assignee} avatarUrl={task.assigneeAvatarUrl} size={36} /></div></div>
                <div><div style={sectionLabel}>Priority</div><div style={{ marginTop: 4, fontSize: 18, color: 'var(--text-primary)' }}>{priorityStars(task.priority)}</div></div>
                <div><div style={sectionLabel}>Status</div><div style={{ marginTop: 4 }}><span style={tagStyle()}>{task.status}</span></div></div>
                <div><div style={sectionLabel}>Created</div><div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(task.createdAt).toLocaleDateString()}</div></div>
                <div><div style={sectionLabel}>Last updated</div><div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(task.updatedAt).toLocaleDateString()}</div></div>
              </div>
            </div>
          </div>
        </div>
      ) : <div style={{ color: 'var(--text-muted)' }}>Loading task…</div>}
    </AppShell>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.split(',').pop() || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const sectionLabel: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
const taskHeaderTitleText: React.CSSProperties = { fontSize: 30, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.1 }
const taskHeaderTitleButton: React.CSSProperties = { ...taskHeaderTitleText, display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'text' }
const taskHeaderTitleInput: React.CSSProperties = { ...projectInputField, fontSize: 30, fontWeight: 750, lineHeight: 1.1, padding: '8px 10px' }
const taskMiniDelete: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 12, cursor: 'pointer' }
