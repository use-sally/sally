'use client'

import { useRouter } from 'next/navigation'
import { EditableTaskRow } from './editable-task-row'
import { InlineTaskPanel } from './inline-task-panel'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { getProjectMembers } from '../lib/api'
import { useProjectQuery, useTaskQuery } from '../lib/query'
import { useEffect, useState } from 'react'

export function BottomTaskDrawer({ taskId, closeHref, projectId }: { taskId: string; closeHref: string; projectId: string }) {
  const router = useRouter()
  const { data: task, error } = useTaskQuery(taskId)
  const { data: project } = useProjectQuery(projectId)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const session = loadSession()

  useEffect(() => {
    let cancelled = false
    void getProjectMembers(projectId)
      .then((members) => {
        if (!cancelled) setProjectRole(members.find((member) => member.accountId === session?.account?.id)?.role ?? null)
      })
      .catch(() => {
        if (!cancelled) setProjectRole(null)
      })
    return () => { cancelled = true }
  }, [projectId, session?.account?.id])

  if (error) return <div style={{ color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task || !project) return null

  const rowTask = {
    id: task.id,
    number: task.number,
    position: task.position,
    title: task.title,
    assignee: task.assignee,
    priority: task.priority,
    status: task.status,
    statusId: task.statusId,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    labels: task.labels,
    todoProgress: task.todos.length ? `${task.todos.filter((todo) => todo.done).length}/${task.todos.length}` : null,
    archivedAt: null,
  }

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const taskPermissionViewer = { platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.18)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} onClick={() => router.push(closeHref)}>
      <div style={{ width: '100%', maxHeight: '78vh', background: 'var(--form-bg)', borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -20px 50px rgba(15,23,42,0.16)', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--panel-border)' }}>
          <div style={{ fontWeight: 750 }}>Task</div>
          <button type="button" onClick={() => router.push(closeHref)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <EditableTaskRow task={rowTask} projectId={projectId} statuses={project.statuses} expanded onActivate={() => {}} taskPermissionViewer={taskPermissionViewer} />
        <InlineTaskPanel taskId={taskId} projectId={projectId} />
      </div>
    </div>
  )
}
