'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { MentionableUser, TaskDetail } from '@sally/types/src'
import { AppShell, panel, priorityStars, tagStyle } from '../../../components/app-shell'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { TaskDescriptionRender } from '../../../components/task-description-render'
import { loadSession } from '../../../lib/auth'
import { createComment, getMentionableUsers, getTask } from '../../../lib/api'

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [taskId, setTaskId] = useState<string>('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOptions, setMentionOptions] = useState<MentionableUser[]>([])
  const [mentionAnchor, setMentionAnchor] = useState<string | null>(null)
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({})
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    void params.then((p) => setTaskId(p.taskId))
  }, [params])

  useEffect(() => {
    if (!taskId) return
    getTask(taskId).then(setTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
  }, [taskId])

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
    const mentionedIds = Object.entries(mentionMap)
      .filter(([display]) => body.includes(`@${display}`))
      .map(([, accountId]) => accountId)
    setSubmittingComment(true)
    try {
      await createComment(task.id, { body, author: session?.account?.name || session?.account?.email, mentions: mentionedIds })
      const updated = await getTask(task.id)
      setTask(updated)
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
      title={task?.title ?? 'Task'}
      subtitle={task ? `${task.project.name} · ${task.status}` : 'Task detail'}
      actions={task ? <Link href={`/projects/${task.project.id}/board`} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', borderRadius: 12, padding: '11px 14px', fontWeight: 700, textDecoration: 'none' }}>Back to board</Link> : null}
    >
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error}</div> : null}
      {task ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div style={panel}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
            <div style={{ marginTop: 10, lineHeight: 1.6 }}><TaskDescriptionRender description={task.description} /></div>

            <div style={{ marginTop: 24, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Comments</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
              <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
                <textarea
                  value={commentBody}
                  onChange={(event) => handleCommentChange(event.target.value)}
                  placeholder="Write a comment… Use @name to mention a teammate."
                  rows={4}
                  style={{ width: '100%', border: '1px solid var(--form-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--form-bg)', color: 'var(--form-text)', resize: 'vertical' }}
                />
                {mentionOptions.length ? (
                  <div style={{ position: 'absolute', top: 'calc(100% - 8px)', left: 0, width: 'min(360px, 100%)', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
                    {mentionOptions.map((user) => (
                      <button
                        key={user.accountId}
                        type="button"
                        onClick={() => insertMention(user)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--panel-border)', background: 'transparent', cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user.name || user.email}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Type <strong>@</strong> to mention a teammate.</div>
                  <button type="button" onClick={() => void handleSubmitComment()} disabled={submittingComment || !commentBody.trim()} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>
                    {submittingComment ? 'Posting…' : 'Post comment'}
                  </button>
                </div>
              </div>

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
            </div>
          </div>

          <div style={panel}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Project</div><div style={{ marginTop: 4 }}><Link href={`/projects/${task.project.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 700 }}>{task.project.name}</Link></div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Assignee</div><div style={{ marginTop: 6 }}><AssigneeAvatar name={task.assignee} avatarUrl={task.assigneeAvatarUrl} size={36} /></div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Priority</div><div style={{ marginTop: 4, fontSize: 18, color: 'var(--text-primary)' }}>{priorityStars(task.priority)}</div></div>
              <div><div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Status</div><div style={{ marginTop: 4 }}><span style={tagStyle()}>{task.status}</span></div></div>
            </div>
          </div>
        </div>
      ) : <div style={{ color: 'var(--text-muted)' }}>Loading task…</div>}
    </AppShell>
  )
}
