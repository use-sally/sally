'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { TaskModalHeader } from './task-modal-header'
import { TaskModalBody } from './task-modal-body'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { getProjectMembers } from '../lib/api'
import { useProjectQuery, useTaskQuery } from '../lib/query'
import { useCallback, useEffect, useState } from 'react'
import { TASK_MODAL_MAX_HEIGHT } from './task-modal-helpers'

const TASK_MODAL_MAX_WIDTH = 1200

export function TaskModal({ taskId, projectId }: { taskId: string; projectId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: task, error } = useTaskQuery(taskId)
  const activeProjectId = task?.project.id || projectId
  const { data: project } = useProjectQuery(activeProjectId)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const session = loadSession()

  const closeTaskModal = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('task')
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeTaskModal()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeTaskModal])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getProjectMembers(activeProjectId)
      .then((members) => {
        if (!cancelled) setProjectRole(members.find((member) => member.accountId === session?.account?.id)?.role ?? null)
      })
      .catch(() => {
        if (!cancelled) setProjectRole(null)
      })
    return () => { cancelled = true }
  }, [activeProjectId, session?.account?.id])

  if (error) return <div style={{ color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task || !project) return null

  const rowTask = {
    id: task.id,
    number: task.number,
    position: task.position,
    title: task.title,
    owner: task.owner,
    ownerAvatarUrl: task.ownerAvatarUrl,
    participants: task.participants,
    assignee: task.assignee,
    assigneeAvatarUrl: task.assigneeAvatarUrl,
    collaborators: task.collaborators,
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
    <div role="presentation" data-preserve-task-open="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50, overflow: 'hidden', overscrollBehavior: 'contain', boxSizing: 'border-box' }} onClick={closeTaskModal}>
      <div role="dialog" aria-modal="true" aria-label="Task" style={{ width: `min(calc(100vw - 32px), ${TASK_MODAL_MAX_WIDTH}px)`, maxWidth: 'calc(100vw - 32px)', maxHeight: TASK_MODAL_MAX_HEIGHT, background: 'var(--form-bg)', borderRadius: 20, boxShadow: '0 24px 80px rgba(15,23,42,0.34)', overflow: 'hidden', border: '1px solid var(--panel-border)', boxSizing: 'border-box', minWidth: 0, display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--panel-border)', flex: '0 0 auto' }}>
          <div style={{ fontWeight: 750 }}>Task</div>
          <button type="button" onClick={closeTaskModal} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 'var(--font-18)', cursor: 'pointer' }} aria-label="Close task modal">✕</button>
        </div>
        <TaskModalHeader task={rowTask} projectId={activeProjectId} statuses={project.statuses} availableLabels={project.labels} taskPermissionViewer={taskPermissionViewer} />
        <div data-task-modal-scroll-body="true" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain', position: 'relative', zIndex: 1 }}>
          <TaskModalBody taskId={taskId} projectId={activeProjectId} />
        </div>
      </div>
    </div>
  )
}
