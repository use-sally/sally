'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { ProjectAutomationOverview, ProjectMember, ProjectTaskListItem } from '@sally/types/src'
import { archiveTask, createProjectStatus, createTask, getProjectMembers, reorderProjectStatuses, reorderProjectTasks, updateProjectStatus } from '../lib/api'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { qk, useProjectQuery, useProjectTasksQuery } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleAvatarStack } from './task-people-avatar-stack'
import { canonicalStatusColor, resolveStatusPair, statusChipStyle, STATUS_COLOR_PAIRS } from '../lib/status-colors'
import { EditableTaskRow } from './editable-task-row'
import { automationBadgeStyle, getTaskAutomationBadge } from '../lib/task-automation'
import { labelText, projectInputField, restoreTextAction, sortableHeaderButton } from '../lib/theme'

const inputStyle: React.CSSProperties = { ...projectInputField }

type SortKey = 'position' | 'title' | 'assignee' | 'priority' | 'dueDate' | 'status'
type SortDir = 'asc' | 'desc'
type StatusType = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE'
type ProjectStatusOption = { id: string; name: string; type?: StatusType | string; color?: string | null }
type StatusEditDraft = { name: string; type: StatusType; color: string }

export function ProjectTasksTable({ projectId, showFilters = true, limit, archived = false, automationOverview, canManageStatuses = false }: { projectId: string; showFilters?: boolean; limit?: number; archived?: boolean; automationOverview?: ProjectAutomationOverview | null; canManageStatuses?: boolean }) {
  const qc = useQueryClient()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(archived ? null : (searchParams.get('task') || null))
  const [status, setStatus] = useState('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({})
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [creatingTaskStatusId, setCreatingTaskStatusId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showArchived, setShowArchived] = useState(archived)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [newStatusType, setNewStatusType] = useState<StatusType>('BACKLOG')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<Record<string, boolean>>({})
  const [activeStatusDragId, setActiveStatusDragId] = useState<string | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [statusEditDraft, setStatusEditDraft] = useState<StatusEditDraft>({ name: '', type: 'BACKLOG', color: '#1F2937' })
  const session = loadSession()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const filters = useMemo(() => ({ status: status.startsWith('!') ? '' : status, assignee, search, label, archived: showArchived }), [status, assignee, search, label, showArchived])

  const setExpandedTaskParam = useCallback((taskId: string | null) => {
    setExpandedTaskId(taskId)
    const params = new URLSearchParams(searchParams.toString())
    if (taskId) params.set('task', taskId)
    else params.delete('task')
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    setShowArchived(archived)
    if (archived) {
      setExpandedTaskId(null)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('task')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }
  }, [archived, pathname, router, searchParams])

  useEffect(() => {
    if (archived) return
    setExpandedTaskId(searchParams.get('task') || null)
  }, [archived, searchParams])
  const { data: project } = useProjectQuery(projectId)
  const { data: tasks = [], error } = useProjectTasksQuery(projectId, filters)
  const [taskList, setTaskList] = useState<ProjectTaskListItem[]>([])
  const [statusList, setStatusList] = useState<ProjectStatusOption[]>([])

  useEffect(() => {
    setTaskList(tasks)
  }, [tasks])

  useEffect(() => {
    setStatusList(project?.statuses || [])
  }, [project?.statuses])


  useEffect(() => {
    let cancelled = false
    void getProjectMembers(projectId)
      .then((members) => { if (!cancelled) setProjectMembers(members) })
      .catch(() => { if (!cancelled) setProjectMembers([]) })
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    function closeWhenSafe() {
      if (!tableRef.current) return
      const saving = tableRef.current.querySelector('[data-description-saving="true"]')
      if (saving) {
        setTimeout(closeWhenSafe, 100)
        return
      }
      setExpandedTaskParam(null)
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null
      const targetElement = target instanceof Element ? target : null
      if (targetElement?.closest('[data-preserve-task-open="true"]')) return
      if (tableRef.current && target && !tableRef.current.contains(target)) {
        setTimeout(closeWhenSafe, 0)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [setExpandedTaskParam])

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const currentProjectRole = projectMembers.find((member) => member.accountId === session?.account?.id)?.role ?? null
  const taskPermissionViewer = { platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: currentProjectRole }

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of projectMembers) {
      const value = member.name?.trim() || member.email.trim()
      const label = member.name?.trim() ? `${member.name} (${member.email})` : member.email
      if (value) map.set(value, label)
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [projectMembers])

  const sortedTasks = useMemo(() => {
    const list = [...taskList].filter((task) => {
      if (!status.startsWith('!')) return true
      return task.status !== status.slice(1)
    })
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const titleTieBreak = a.position - b.position || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
      if (sortKey === 'position') {
        if (a.position !== b.position) return (a.position - b.position) * dir
        return titleTieBreak
      }
      if (sortKey === 'dueDate') {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
        if (av !== bv) return (av - bv) * dir
        return titleTieBreak
      }
      const av = String(a[sortKey] ?? '').toLowerCase()
      const bv = String(b[sortKey] ?? '').toLowerCase()
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return titleTieBreak
    })
    return typeof limit === 'number' ? list.slice(0, limit) : list
  }, [taskList, status, sortKey, sortDir, limit])

  const taskGroups = useMemo(() => {
    const projectStatuses: ProjectStatusOption[] = statusList
    const visibleStatuses = projectStatuses.filter((projectStatus) => {
      if (!status) return true
      if (status.startsWith('!')) return projectStatus.name !== status.slice(1)
      return projectStatus.name === status
    })
    const groups = visibleStatuses.map((projectStatus) => ({ status: projectStatus, tasks: [] as ProjectTaskListItem[] }))
    const byStatusId = new Map(groups.map((group) => [group.status.id, group]))
    const orphanTasks: ProjectTaskListItem[] = []

    for (const task of sortedTasks) {
      const group = byStatusId.get(task.statusId)
      if (group) group.tasks.push(task)
      else orphanTasks.push(task)
    }

    if (orphanTasks.length) {
      groups.push({ status: { id: '__unknown__', name: 'Other', color: null }, tasks: orphanTasks })
    }

    return groups
  }, [statusList, sortedTasks, status])


  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(nextKey); setSortDir('asc') }
  }
  function indicator(key: SortKey) { return sortKey !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓' }

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['project', projectId] }),
      qc.invalidateQueries({ queryKey: ['projectTasks', projectId] }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function addTask(statusId: string) {
    const title = (taskDrafts[statusId] || '').trim()
    if (!title || !projectId || !statusId || statusId === '__unknown__') return
    setCreatingTaskStatusId(statusId)
    try {
      const created = await createTask({
        projectId,
        title,
        statusId,
      })
      setTaskDrafts((current) => ({ ...current, [statusId]: '' }))
      setExpandedTaskParam(created.taskId)
      await invalidateAll()
    } finally {
      setCreatingTaskStatusId(null)
    }
  }

  async function addStatus() {
    const name = newStatus.trim()
    if (!name || statusSaving || !projectId) return
    setStatusSaving(true)
    setStatusError(null)
    try {
      await createProjectStatus(projectId, { name, type: newStatusType })
      setNewStatus('')
      setNewStatusType('BACKLOG')
      await invalidateAll()
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to add status')
    } finally {
      setStatusSaving(false)
    }
  }

  async function restoreTask(taskId: string) {
    if (!taskId) return
    setRestoringId(taskId)
    try {
      await archiveTask(taskId, false)
      await invalidateAll()
    } finally {
      setRestoringId(null)
    }
  }

  async function persistListOrder(reordered: ProjectTaskListItem[], _taskId: string) {
    const nextPositions = new Map(reordered.map((item, index) => [item.id, index]))
    setTaskList((current) => current.map((item) => nextPositions.has(item.id) ? { ...item, position: nextPositions.get(item.id)! } : item))
    await reorderProjectTasks(projectId, reordered.map((item) => item.id))
    await invalidateAll()
  }

  async function persistStatusOrder(reorderedStatusIds: string[]) {
    const previousStatuses = statusList
    const nextMovableIndex = new Map(reorderedStatusIds.map((id, index) => [id, index]))
    setStatusError(null)
    setStatusList((current) => {
      const pinned = current[0]
      const movable = current.slice(1).filter((item) => nextMovableIndex.has(item.id)).sort((a, b) => nextMovableIndex.get(a.id)! - nextMovableIndex.get(b.id)!)
      const extra = current.slice(1).filter((item) => !nextMovableIndex.has(item.id))
      return pinned ? [pinned, ...movable, ...extra] : [...movable, ...extra]
    })
    try {
      await reorderProjectStatuses(projectId, reorderedStatusIds)
      await invalidateAll()
    } catch (err) {
      setStatusList(previousStatuses)
      setStatusError(err instanceof Error ? err.message : 'Failed to reorder statuses')
    }
  }

  const statusDragPrefix = 'status:'
  const canReorderStatusGroups = canManageStatuses && !status
  const pinnedStatusGroup = taskGroups.find((group) => group.status.id !== '__unknown__') || null
  const movableStatusGroups = pinnedStatusGroup ? taskGroups.filter((group) => group.status.id !== pinnedStatusGroup.status.id && group.status.id !== '__unknown__') : []
  const movableStatusGroupIds = movableStatusGroups.map((group) => `${statusDragPrefix}${group.status.id}`)

  function resolveStatusDropTargetId(id: string) {
    if (id.startsWith(statusDragPrefix)) return id.slice(statusDragPrefix.length)
    const group = taskGroups.find((candidate) => candidate.tasks.some((task) => task.id === id))
    return group?.status.id ?? null
  }

  function toggleStatusGroupCollapsed(statusId: string) {
    setCollapsedStatusIds((current) => ({ ...current, [statusId]: !current[statusId] }))
  }

  function openStatusEditor(projectStatus: ProjectStatusOption) {
    if (!canManageStatuses || projectStatus.id === '__unknown__') return
    setEditingStatusId(projectStatus.id)
    setStatusEditDraft({ name: projectStatus.name, type: (projectStatus.type || 'BACKLOG') as StatusType, color: projectStatus.color || '#1F2937' })
    setStatusError(null)
  }

  function cancelStatusEdit() {
    setEditingStatusId(null)
  }

  async function saveStatusEdit(projectStatus: ProjectStatusOption) {
    const name = statusEditDraft.name.trim()
    if (statusSaving || projectStatus.id === '__unknown__') return
    if (!name) {
      setEditingStatusId(null)
      return
    }
    const color = canonicalStatusColor(statusEditDraft.color) || statusEditDraft.color || '#1F2937'
    setStatusSaving(true)
    setStatusError(null)
    try {
      setStatusList((current) => current.map((statusItem) => statusItem.id === projectStatus.id ? { ...statusItem, name, type: statusEditDraft.type, color } : statusItem))
      setTaskList((current) => current.map((task) => task.statusId === projectStatus.id ? { ...task, status: name, statusColor: color } : task))
      await updateProjectStatus(projectId, projectStatus.id, { name, type: statusEditDraft.type, color })
      setEditingStatusId(null)
      await invalidateAll()
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status')
      await invalidateAll()
    } finally {
      setStatusSaving(false)
    }
  }

  function handleListDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id)
    setActiveStatusDragId(activeId.startsWith(statusDragPrefix) ? activeId.slice(statusDragPrefix.length) : null)
  }

  async function handleListDragEnd(event: DragEndEvent) {
    setActiveStatusDragId(null)
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || activeId === overId) return

    if (activeId.startsWith(statusDragPrefix)) {
      if (!canReorderStatusGroups) return
      const activeStatusId = activeId.slice(statusDragPrefix.length)
      const overStatusId = resolveStatusDropTargetId(overId)
      if (!overStatusId || activeStatusId === overStatusId) return
      if (activeStatusId === pinnedStatusGroup?.status.id || overStatusId === pinnedStatusGroup?.status.id || overStatusId === '__unknown__') return
      const oldIndex = movableStatusGroups.findIndex((group) => group.status.id === activeStatusId)
      const newIndex = movableStatusGroups.findIndex((group) => group.status.id === overStatusId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      const reordered = arrayMove(movableStatusGroups, oldIndex, newIndex)
      await persistStatusOrder(reordered.map((group) => group.status.id))
      return
    }

    if (overId.startsWith(statusDragPrefix)) return

    const activeTask = sortedTasks.find((task) => task.id === activeId)
    const overTask = sortedTasks.find((task) => task.id === overId)
    if (!activeTask || !overTask || activeTask.statusId !== overTask.statusId) return
    const statusTasks = sortedTasks.filter((task) => task.statusId === activeTask.statusId)
    const oldIndex = statusTasks.findIndex((task) => task.id === activeId)
    const newIndex = statusTasks.findIndex((task) => task.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(statusTasks, oldIndex, newIndex)
    await persistListOrder(reordered, activeId)
  }

  if (error) return <div style={{ color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load tasks'}</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {showFilters ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" style={inputStyle} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            {(statusList || []).flatMap((s) => [
              <option key={s.id} value={s.name}>{s.name}</option>,
              <option key={`${s.id}-not`} value={`!${s.name}`}>{`Not ${s.name}`}</option>,
            ])}
          </select>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inputStyle}>
            <option value="">All people</option>
            {assigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Filter by label" style={inputStyle} />
        </div>
      ) : null}

      <div ref={tableRef} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          <div style={{ ...labelText, fontSize: 13 }}>Tasks{showArchived ? ' · Archived' : ''}</div>
          {!archived ? (
            <button onClick={() => { setShowArchived((prev) => !prev); setExpandedTaskParam(null) }} style={{ background: 'var(--form-bg)', color: 'var(--text-primary)', border: '1px solid var(--form-border)', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 12 }}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          ) : <div />}
        </div>

        {statusError ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{statusError}</div> : null}

        {showArchived ? sortedTasks.map((task) => (
          <div key={task.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 16, overflow: 'hidden', background: 'var(--form-bg)' }}>
            <ArchivedTaskRow task={task} restoring={restoringId === task.id} onRestore={() => void restoreTask(task.id)} />
          </div>
        )) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleListDragStart} onDragCancel={() => setActiveStatusDragId(null)} onDragEnd={(event) => { void handleListDragEnd(event) }}>
            <SortableContext items={movableStatusGroupIds} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'grid', gap: 14 }}>
                {taskGroups.map((group) => {
                  const collapsed = Boolean(collapsedStatusIds[group.status.id]) || activeStatusDragId !== null
                  return (
                    <TaskStatusGroup key={group.status.id} status={group.status} count={group.tasks.length} reorderable={canReorderStatusGroups && group.status.id !== pinnedStatusGroup?.status.id && group.status.id !== '__unknown__'} pinned={group.status.id === pinnedStatusGroup?.status.id} sortableId={`${statusDragPrefix}${group.status.id}`} collapsed={collapsed} dragCompact={activeStatusDragId !== null} canManageStatuses={canManageStatuses && group.status.id !== '__unknown__'} editing={editingStatusId === group.status.id} statusEditDraft={statusEditDraft} setStatusEditDraft={setStatusEditDraft} onOpenEditor={() => openStatusEditor(group.status)} onSaveEdit={() => void saveStatusEdit(group.status)} onCancelEdit={cancelStatusEdit} statusSaving={statusSaving} onToggleCollapsed={() => toggleStatusGroupCollapsed(group.status.id)}>
                      {!collapsed ? (
                        <SortableContext items={group.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                          <div style={{ display: 'grid', gap: 10 }}>
                            {group.tasks.map((task) => {
                              const expanded = expandedTaskId === task.id
                              return <SortableTaskListItem key={task.id} task={task} expanded={expanded} projectId={projectId} statuses={statusList} taskPermissionViewer={taskPermissionViewer} setExpandedTaskParam={setExpandedTaskParam} automationOverview={automationOverview} />
                            })}
                            {!group.tasks.length ? <div style={{ padding: '12px 14px', color: 'var(--text-muted)', border: '1px dashed var(--panel-border)', borderRadius: 14, background: 'var(--panel-bg)' }}>No tasks in {group.status.name}.</div> : null}
                            {group.status.id !== '__unknown__' ? (
                              <AddTaskInStatus
                                status={group.status}
                                value={taskDrafts[group.status.id] || ''}
                                onChange={(value) => setTaskDrafts((current) => ({ ...current, [group.status.id]: value }))}
                                onAdd={() => void addTask(group.status.id)}
                                creating={creatingTaskStatusId === group.status.id}
                              />
                            ) : null}
                          </div>
                        </SortableContext>
                      ) : null}
                    </TaskStatusGroup>
                  )
                })}
                {canManageStatuses ? <AddStatusRow newStatus={newStatus} setNewStatus={setNewStatus} newStatusType={newStatusType} setNewStatusType={setNewStatusType} addStatus={addStatus} statusSaving={statusSaving} /> : null}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {!sortedTasks.length && (showArchived || !taskGroups.length) ? <div style={{ padding: 18, color: 'rgba(209, 250, 229, 0.58)', border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)' }}>No tasks match the current filters.</div> : null}
      </div>
    </div>
  )
}

function TaskStatusGroup({ status, count, children, reorderable, pinned, sortableId, collapsed, dragCompact, canManageStatuses, editing, statusEditDraft, setStatusEditDraft, onOpenEditor, onSaveEdit, onCancelEdit, statusSaving, onToggleCollapsed }: { status: ProjectStatusOption; count: number; children: React.ReactNode; reorderable?: boolean; pinned?: boolean; sortableId: string; collapsed?: boolean; dragCompact?: boolean; canManageStatuses?: boolean; editing?: boolean; statusEditDraft: StatusEditDraft; setStatusEditDraft: (draft: StatusEditDraft) => void; onOpenEditor: () => void; onSaveEdit: () => void; onCancelEdit: () => void; statusSaving: boolean; onToggleCollapsed: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId, disabled: !reorderable })
  const taskLabel = count === 1 ? '1 task' : `${count} tasks`
  const displayColor = editing ? statusEditDraft.color : status.color
  return (
    <section
      data-task-status-editor={editing ? status.id : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onSaveEdit()
      }}
      ref={setNodeRef}
      style={{
        ...statusGroupCardStyle(displayColor),
        display: 'grid',
        gap: collapsed ? 0 : 12,
        padding: collapsed ? '10px 12px' : 14,
        borderRadius: 18,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          {reorderable ? <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${status.name}`} title="Drag to reorder status group" style={statusGroupDragHandle}>⋮⋮</button> : null}
          <button type="button" onClick={onToggleCollapsed} disabled={dragCompact} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${status.name}`} title={dragCompact ? 'Status groups are collapsed while dragging' : `${collapsed ? 'Expand' : 'Collapse'} status group`} style={statusGroupCollapseButton}>{collapsed ? '▸' : '▾'}</button>
          {canManageStatuses && editing ? (
            <input
              value={statusEditDraft.name}
              onChange={(event) => setStatusEditDraft({ ...statusEditDraft, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); onSaveEdit() }
                if (event.key === 'Escape') { event.preventDefault(); onCancelEdit() }
              }}
              aria-label={`Status name for ${status.name}`}
              disabled={statusSaving}
              autoFocus
              style={{ ...statusGroupTextStyle(displayColor), ...statusNameInputStyle }}
            />
          ) : canManageStatuses ? (
            <button type="button" onClick={onOpenEditor} title={`Edit ${status.name}`} style={{ ...statusGroupTextStyle(displayColor), ...statusTitleButton }}>
              {status.name}
            </button>
          ) : <span style={statusGroupTextStyle(displayColor)}>{status.name}</span>}
          {editing ? (
            <select
              value={statusEditDraft.type}
              onChange={(event) => setStatusEditDraft({ ...statusEditDraft, type: event.target.value as StatusType })}
              disabled={statusSaving}
              aria-label={`Status type for ${status.name}`}
              style={statusTypeSelectStyle}
            >
              <option value="BACKLOG">Backlog</option>
              <option value="TODO">Todo</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="REVIEW">Review</option>
              <option value="DONE">Done</option>
            </select>
          ) : status.type ? <span style={{ ...labelText, fontSize: 11 }}>{String(status.type).toLowerCase().replace(/_/g, ' ')}</span> : null}
          {pinned ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pinned</span> : null}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{taskLabel}</div>
      </div>
      {editing ? <StatusEditor draft={statusEditDraft} setDraft={setStatusEditDraft} saving={statusSaving} /> : null}
      {!collapsed ? children : null}
    </section>
  )
}

function AddTaskInStatus({ status, value, onChange, onAdd, creating }: { status: ProjectStatusOption; value: string; onChange: (value: string) => void; onAdd: () => void; creating: boolean }) {
  return (
    <div style={addTaskInStatusStyle}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAdd() } }}
        placeholder={creating ? 'Creating task…' : `Add to ${status.name}`}
        disabled={creating}
        style={{ ...inputStyle, padding: '10px 12px' }}
      />
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{creating ? 'Adding…' : 'Press Enter to create'}</div>
    </div>
  )
}

function StatusEditor({ draft, setDraft, saving }: { draft: StatusEditDraft; setDraft: (draft: StatusEditDraft) => void; saving: boolean }) {
  return (
    <div style={statusEditorStyle}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_COLOR_PAIRS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={saving}
            onClick={() => setDraft({ ...draft, color: canonicalStatusColor(preset.darkBg) || preset.darkBg })}
            title={`Set color ${preset.id}`}
            style={{ ...statusColorOptionButton, color: preset.darkText, borderColor: canonicalStatusColor(draft.color) === preset.darkBg ? preset.darkText : 'var(--panel-border)' }}
          >
            {preset.id}
          </button>
        ))}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{saving ? 'Saving…' : 'Changes save when focus leaves this editor.'}</div>
    </div>
  )
}

function statusGroupTextStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  return {
    color: pair?.darkText ?? 'var(--text-primary)',
    fontWeight: 800,
    fontSize: 14,
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function statusGroupCardStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  const border = pair?.darkText ?? 'var(--panel-border)'
  return {
    background: 'var(--panel-bg)',
    border: `1px solid ${border}`,
    boxShadow: `0 10px 24px color-mix(in srgb, ${border} 12%, transparent)`,
    minWidth: 0,
    overflow: 'hidden',
  }
}

const addTaskInStatusStyle: React.CSSProperties = { display: 'grid', gap: 6, paddingTop: 2 }
const statusTitleButton: React.CSSProperties = { background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }
const statusNameInputStyle: React.CSSProperties = { background: 'transparent', border: 'none', borderBottom: '1px solid currentColor', borderRadius: 0, padding: '2px 0', minWidth: 0, width: '100%', outline: 'none' }
const statusTypeSelectStyle: React.CSSProperties = { ...inputStyle, width: 'auto', minWidth: 118, padding: '7px 28px 7px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderRadius: 999 }
const statusEditorStyle: React.CSSProperties = { display: 'grid', gap: 8, padding: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)' }
const statusColorOptionButton: React.CSSProperties = { background: 'transparent', border: '1px solid var(--panel-border)', padding: '5px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, textTransform: 'lowercase', fontSize: 12, fontWeight: 700 }

const statusGroupCollapseButton: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--panel-border)',
  borderRadius: 9,
  background: 'var(--panel-bg)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  userSelect: 'none',
  fontWeight: 800,
}

const statusGroupDragHandle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--panel-border)',
  borderRadius: 9,
  background: 'var(--panel-bg)',
  color: 'var(--text-muted)',
  cursor: 'grab',
  userSelect: 'none',
  fontWeight: 800,
}

function AddStatusRow({ newStatus, setNewStatus, newStatusType, setNewStatusType, addStatus, statusSaving }: { newStatus: string; setNewStatus: (value: string) => void; newStatusType: StatusType; setNewStatusType: (value: StatusType) => void; addStatus: () => Promise<void>; statusSaving: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, alignItems: 'center', padding: 12, border: '1px dashed var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)', minWidth: 0 }}>
      <input
        value={newStatus}
        onChange={(event) => setNewStatus(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addStatus() } }}
        placeholder="Add new status"
        disabled={statusSaving}
        style={{ ...inputStyle, padding: '10px 12px' }}
      />
      <select value={newStatusType} onChange={(event) => setNewStatusType(event.target.value as StatusType)} disabled={statusSaving} style={{ ...inputStyle, padding: '10px 12px' }}>
        <option value="BACKLOG">Backlog</option>
        <option value="TODO">Todo</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="BLOCKED">Blocked</option>
        <option value="REVIEW">Review</option>
        <option value="DONE">Done</option>
      </select>
      <button type="button" onClick={() => void addStatus()} disabled={statusSaving || !newStatus.trim()} style={{ background: '#34d399', color: '#052e16', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 800, cursor: statusSaving || !newStatus.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>{statusSaving ? 'Adding…' : 'Add status'}</button>
    </div>
  )
}

function ArchivedTaskRow({ task, restoring, onRestore }: { task: ProjectTaskListItem; restoring: boolean; onRestore: () => void }) {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 1fr 0.9fr 1fr 1fr 1.4fr 110px', gap: 10, padding: '14px 16px', alignItems: 'center', background: 'var(--form-bg)' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0 }}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{task.number}</span> : null}{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}><TaskPeopleAvatarStack owner={task.owner} ownerAvatarUrl={task.ownerAvatarUrl} participants={task.participants} assignee={task.assignee} assigneeAvatarUrl={task.assigneeAvatarUrl} collaborators={task.collaborators} size={28} /></div>
      <div style={{ color: 'rgba(209, 250, 229, 0.34)' }}>{priorityStars(task.priority)}</div>
      <div>{task.dueDate ? <span style={pill('#eef2ff', '#3730a3')}>{dueLabel}</span> : <span style={{ color: 'rgba(209, 250, 229, 0.34)' }}>—</span>}</div>
      <div><span className="status-chip" style={statusChipStyle(task.statusColor)}>{task.status}</span></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: 'rgba(209, 250, 229, 0.34)' }}>—</span>}
      </div>
      <button onClick={onRestore} disabled={restoring} style={{ ...restoreTextAction, opacity: restoring ? 0.5 : 1 }}>{restoring ? 'Restoring…' : 'Restore'}</button>
    </div>
  )
}

function SortableTaskListItem({ task, expanded, projectId, statuses, taskPermissionViewer, setExpandedTaskParam, automationOverview }: { task: ProjectTaskListItem; expanded: boolean; projectId: string; statuses: any[]; taskPermissionViewer: any; setExpandedTaskParam: (taskId: string | null) => void; automationOverview?: ProjectAutomationOverview | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const automationBadge = getTaskAutomationBadge(automationOverview, task.id)
  const automationTone = automationBadge ? automationBadgeStyle(automationBadge.tone) : null
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        border: expanded ? '1px solid color-mix(in srgb, var(--form-border-focus) 55%, var(--panel-border))' : '1px solid var(--panel-border)',
        borderRadius: 16,
        overflow: 'hidden',
        background: expanded ? 'color-mix(in srgb, var(--panel-bg) 92%, white)' : 'var(--form-bg)',
        boxShadow: expanded ? '0 10px 24px rgba(16, 185, 129, 0.07)' : 'none',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'stretch' }}>
        <div {...attributes} {...listeners} style={{ display: 'grid', placeItems: 'center', padding: '10px 8px', borderRight: '1px solid var(--panel-border)', background: expanded ? 'color-mix(in srgb, var(--panel-bg) 92%, white)' : 'var(--form-bg)', cursor: 'grab', color: 'var(--text-muted)', userSelect: 'none' }} aria-label="Drag to reorder" title="Drag to reorder">⋮⋮</div>
        <EditableTaskRow task={task} projectId={projectId} statuses={statuses} expanded={expanded} onActivate={() => setExpandedTaskParam(task.id)} taskPermissionViewer={taskPermissionViewer} />
      </div>
      {automationBadge && automationTone ? <div style={{ display: 'flex', padding: '0 14px 12px 40px', marginTop: -4 }}><span title={automationBadge.detail || undefined} style={pill(automationTone.background, automationTone.color)}>{automationBadge.label}</span></div> : null}
    </div>
  )
}

function headerBtn(active: boolean): React.CSSProperties { return sortableHeaderButton(active) }
