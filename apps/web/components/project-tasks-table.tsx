'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { ProjectMember, ProjectTaskListItem } from '@sally/types/src'
import { archiveTask, createTask, getProjectMembers } from '../lib/api'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { qk, useProjectQuery, useProjectTasksQuery } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'
import { AssigneeAvatar } from './assignee-avatar'
import { statusChipStyle } from '../lib/status-colors'
import { EditableTaskRow } from './editable-task-row'
import { InlineTaskPanel } from './inline-task-panel'
import { labelText, projectInputField, sortableHeaderButton } from '../lib/theme'

const inputStyle: React.CSSProperties = { ...projectInputField }

type SortKey = 'title' | 'assignee' | 'priority' | 'dueDate' | 'status'
type SortDir = 'asc' | 'desc'

export function ProjectTasksTable({ projectId, showFilters = true, limit, archived = false }: { projectId: string; showFilters?: boolean; limit?: number; archived?: boolean }) {
  const qc = useQueryClient()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tableRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(archived ? null : (searchParams.get('task') || null))
  const [status, setStatus] = useState('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newStatusId, setNewStatusId] = useState('')
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [creating, setCreating] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showArchived, setShowArchived] = useState(archived)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const session = loadSession()

  const filters = useMemo(() => ({ status: status.startsWith('!') ? '' : status, assignee, search, label, archived: showArchived }), [status, assignee, search, label, showArchived])

  useEffect(() => {
    setShowArchived(archived)
    if (archived) {
      setExpandedTaskId(null)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('task')
      const next = params.toString()
      window.history.replaceState(window.history.state, '', next ? `${pathname}?${next}` : pathname)
    }
  }, [archived, pathname, searchParams])

  useEffect(() => {
    if (archived) return
    setExpandedTaskId(searchParams.get('task') || null)
  }, [archived, searchParams])
  const { data: project } = useProjectQuery(projectId, { archived: showArchived || archived })
  const { data: tasks = [], error } = useProjectTasksQuery(projectId, filters)

  useEffect(() => {
    if (project?.statuses?.length && !newStatusId) setNewStatusId(project.statuses[0].id)
  }, [project?.statuses, newStatusId])

  useEffect(() => {
    let cancelled = false
    void getProjectMembers(projectId)
      .then((members) => { if (!cancelled) setProjectMembers(members) })
      .catch(() => { if (!cancelled) setProjectMembers([]) })
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    if (!expandedTaskId) return
    const node = rowRefs.current[expandedTaskId]
    if (!node) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const marginTop = 24
        const rect = node.getBoundingClientRect()
        const targetTop = Math.max(0, window.scrollY + rect.top - marginTop)
        window.scrollTo({ top: targetTop, behavior: 'smooth' })
      })
    })
  }, [expandedTaskId])

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
  }, [showFilters, pathname, searchParams])

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
    const list = [...tasks].filter((task) => {
      if (!status.startsWith('!')) return true
      return task.status !== status.slice(1)
    })
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const titleTieBreak = a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
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
  }, [tasks, status, sortKey, sortDir, limit])

  function setExpandedTaskParam(taskId: string | null) {
    setExpandedTaskId(taskId)
    const params = new URLSearchParams(searchParams.toString())
    if (taskId) params.set('task', taskId)
    else params.delete('task')
    const next = params.toString()
    window.history.replaceState(window.history.state, '', next ? `${pathname}?${next}` : pathname)
  }

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

  async function addTask() {
    const title = newTitle.trim()
    if (!title || !projectId) return
    setCreating(true)
    try {
      const created = await createTask({
        projectId,
        title,
        statusId: newStatusId || project?.statuses?.[0]?.id,
      })
      setNewTitle('')
      setNewStatusId(project?.statuses?.[0]?.id || '')
      setExpandedTaskParam(created.taskId)
      await invalidateAll()
    } finally {
      setCreating(false)
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

  if (error) return <div style={{ color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load tasks'}</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {showFilters ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" style={inputStyle} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            {(project?.statuses || []).flatMap((s) => [
              <option key={s.id} value={s.name}>{s.name}</option>,
              <option key={`${s.id}-not`} value={`!${s.name}`}>{`Not ${s.name}`}</option>,
            ])}
          </select>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={inputStyle}>
            <option value="">All assignees</option>
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

        {!showArchived ? (
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTask() } }}
            placeholder={creating ? 'Creating task…' : 'Add task title and press Enter'}
            disabled={creating || !projectId}
            style={{ ...inputStyle, padding: '14px 16px', borderRadius: 16 }}
          />
        ) : null}

        {sortedTasks.map((task) => {
          if (showArchived) {
            return (
              <div key={task.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 16, overflow: 'hidden', background: 'var(--form-bg)' }}>
                <ArchivedTaskRow task={task} restoring={restoringId === task.id} onRestore={() => void restoreTask(task.id)} />
              </div>
            )
          }

          const expanded = expandedTaskId === task.id
          return (
            <div
              key={task.id}
              ref={(node) => { rowRefs.current[task.id] = node }}
              style={{
                border: expanded ? '1px solid color-mix(in srgb, var(--form-border-focus) 55%, var(--panel-border))' : '1px solid var(--panel-border)',
                borderRadius: 16,
                overflow: 'hidden',
                background: expanded ? 'color-mix(in srgb, var(--panel-bg) 92%, white)' : 'var(--form-bg)',
                boxShadow: expanded ? '0 10px 24px rgba(16, 185, 129, 0.07)' : 'none',
              }}
            >
              <EditableTaskRow task={task} projectId={projectId} statuses={project?.statuses || []} expanded={expanded} onActivate={() => setExpandedTaskParam(task.id)} taskPermissionViewer={taskPermissionViewer} />
              {expanded ? <InlineTaskPanel taskId={task.id} projectId={projectId} /> : null}
            </div>
          )
        })}
        {!sortedTasks.length ? <div style={{ padding: 18, color: 'rgba(209, 250, 229, 0.58)', border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)' }}>No tasks match the current filters.</div> : null}
      </div>
    </div>
  )
}

function ArchivedTaskRow({ task, restoring, onRestore }: { task: ProjectTaskListItem; restoring: boolean; onRestore: () => void }) {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.9fr 1fr 1fr 1.4fr 110px', gap: 10, padding: '14px 16px', alignItems: 'center', background: 'var(--form-bg)' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}><AssigneeAvatar name={task.assignee} avatarUrl={task.assigneeAvatarUrl} size={28} /></div>
      <div style={{ color: 'rgba(209, 250, 229, 0.34)' }}>{priorityStars(task.priority)}</div>
      <div>{task.dueDate ? <span style={pill('#eef2ff', '#3730a3')}>{dueLabel}</span> : <span style={{ color: 'rgba(209, 250, 229, 0.34)' }}>—</span>}</div>
      <div><span className="status-chip" style={statusChipStyle(task.statusColor)}>{task.status}</span></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: 'rgba(209, 250, 229, 0.34)' }}>—</span>}
      </div>
      <button onClick={onRestore} disabled={restoring} style={{ background: 'rgba(250, 204, 21, 0.12)', color: '#fde68a', border: '1px solid rgba(250, 204, 21, 0.28)', borderRadius: 10, padding: '8px 10px', fontWeight: 700, cursor: 'pointer' }}>{restoring ? 'Restoring…' : 'Restore'}</button>
    </div>
  )
}

function headerBtn(active: boolean): React.CSSProperties { return sortableHeaderButton(active) }
