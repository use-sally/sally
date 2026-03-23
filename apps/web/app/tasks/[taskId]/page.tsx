'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { TaskDetail } from '@automatethis-pm/types/src'
import { AppShell, panel, pill, priorityStars, tagStyle } from '../../../components/app-shell'
import { TaskDescriptionRender } from '../../../components/task-description-render'
import { getTask } from '../../../lib/api'

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [taskId, setTaskId] = useState<string>('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void params.then((p) => setTaskId(p.taskId))
  }, [params])

  useEffect(() => {
    if (!taskId) return
    getTask(taskId).then(setTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
  }, [taskId])

  return (
    <AppShell
      title={task?.title ?? 'Task'}
      subtitle={task ? `${task.project.name} · ${task.status}` : 'Task detail'}
      actions={task ? <Link href={`/projects/${task.project.id}/board`} style={{ background: '#0f172a', color: '#fff', borderRadius: 12, padding: '11px 14px', fontWeight: 700, textDecoration: 'none' }}>Back to board</Link> : null}
    >
      {error ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{error}</div> : null}
      {task ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div style={panel}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
            <div style={{ marginTop: 10, lineHeight: 1.6 }}><TaskDescriptionRender description={task.description} /></div>

            <div style={{ marginTop: 24, color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Comments</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {task.comments.length ? task.comments.map((comment) => (
                <div key={comment.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{comment.author}</div>
                  <div style={{ marginTop: 6 }}>{comment.body}</div>
                </div>
              )) : <div style={{ color: '#64748b' }}>No comments yet.</div>}
            </div>
          </div>

          <div style={panel}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Project</div><div style={{ marginTop: 4 }}><Link href={`/projects/${task.project.id}`} style={{ textDecoration: 'none', color: '#0f172a', fontWeight: 700 }}>{task.project.name}</Link></div></div>
              <div><div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Assignee</div><div style={{ marginTop: 4 }}>{task.assignee}</div></div>
              <div><div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Priority</div><div style={{ marginTop: 4, fontSize: 18, color: '#0f172a' }}>{priorityStars(task.priority)}</div></div>
              <div><div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Status</div><div style={{ marginTop: 4 }}><span style={tagStyle()}>{task.status}</span></div></div>
            </div>
          </div>
        </div>
      ) : <div style={{ color: '#64748b' }}>Loading task…</div>}
    </AppShell>
  )
}
