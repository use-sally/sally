'use client'

import { useRouter } from 'next/navigation'
import { EditableTaskRow } from './editable-task-row'
import { InlineTaskPanel } from './inline-task-panel'
import { useProjectQuery, useTaskQuery } from '../lib/query'

export function BottomTaskDrawer({ taskId, closeHref, projectId }: { taskId: string; closeHref: string; projectId: string }) {
  const router = useRouter()
  const { data: task, error } = useTaskQuery(taskId)
  const { data: project } = useProjectQuery(projectId)

  if (error) return <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load task'}</div>
  if (!task || !project) return null

  const rowTask = {
    id: task.id,
    title: task.title,
    assignee: task.assignee,
    priority: task.priority,
    status: task.status,
    statusId: task.statusId,
    dueDate: task.dueDate,
    labels: task.labels,
    todoProgress: task.todos.length ? `${task.todos.filter((todo) => todo.done).length}/${task.todos.length}` : null,
    archivedAt: null,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.18)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }} onClick={() => router.push(closeHref)}>
      <div style={{ width: '100%', maxHeight: '78vh', background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: '0 -20px 50px rgba(15,23,42,0.16)', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eef2f7' }}>
          <div style={{ fontWeight: 750 }}>Task</div>
          <button type="button" onClick={() => router.push(closeHref)} style={{ border: 'none', background: 'transparent', color: '#64748b', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <EditableTaskRow task={rowTask} projectId={projectId} statuses={project.statuses} expanded onActivate={() => {}} />
        <InlineTaskPanel taskId={taskId} projectId={projectId} />
      </div>
    </div>
  )
}
