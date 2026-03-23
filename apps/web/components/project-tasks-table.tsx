'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTask } from '../lib/api'
import { qk, useProjectQuery, useProjectTasksQuery } from '../lib/query'
import { EditableTaskRow } from './editable-task-row'
import { InlineTaskPanel } from './inline-task-panel'

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 10px', background: '#fff', fontSize: 14 }

type SortKey = 'title' | 'assignee' | 'priority' | 'dueDate' | 'status'
type SortDir = 'asc' | 'desc'

export function ProjectTasksTable({ projectId, showFilters = true, limit }: { projectId: string; showFilters?: boolean; limit?: number }) {
  const qc = useQueryClient()
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [assignee, setAssignee] = useState('')
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newPriority, setNewPriority] = useState<'P1' | 'P2' | 'P3'>('P2')
  const [newDueDate, setNewDueDate] = useState('')
  const [newStatusId, setNewStatusId] = useState('')
  const [creating, setCreating] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('dueDate')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filters = useMemo(() => ({ status, assignee, search, label }), [status, assignee, search, label])
  const { data: project } = useProjectQuery(projectId)
  const { data: tasks = [], error } = useProjectTasksQuery(projectId, filters)

  useEffect(() => {
    if (project?.statuses?.length && !newStatusId) setNewStatusId(project.statuses[0].id)
  }, [project?.statuses, newStatusId])

  useEffect(() => {
    function closeWhenSafe() {
      if (!tableRef.current) return
      const saving = tableRef.current.querySelector('[data-description-saving="true"]')
      if (saving) {
        setTimeout(closeWhenSafe, 100)
        return
      }
      setExpandedTaskId(null)
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (tableRef.current && target && !tableRef.current.contains(target)) {
        setTimeout(closeWhenSafe, 0)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])

  const sortedTasks = useMemo(() => {
    const list = [...tasks]
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
  }, [tasks, sortKey, sortDir, limit])

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(nextKey); setSortDir('asc') }
  }
  function indicator(key: SortKey) { return sortKey !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓' }

  async function addTask() {
    const title = newTitle.trim()
    if (!title || !projectId) return
    setCreating(true)
    try {
      const created = await createTask({
        projectId,
        title,
        assignee: newAssignee.trim() || undefined,
        priority: newPriority,
        dueDate: newDueDate || null,
        statusId: newStatusId || project?.statuses?.[0]?.id,
      })
      setNewTitle('')
      setNewAssignee('')
      setNewPriority('P2')
      setNewDueDate('')
      setNewStatusId(project?.statuses?.[0]?.id || '')
      setExpandedTaskId(created.taskId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
        qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
        qc.invalidateQueries({ queryKey: qk.board(projectId) }),
        qc.invalidateQueries({ queryKey: qk.projects }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
    } finally {
      setCreating(false)
    }
  }

  if (error) return <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load tasks'}</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {showFilters ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 12 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" style={inputStyle} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}><option value="">All statuses</option>{(project?.statuses || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</select>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Filter by assignee" style={inputStyle} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Filter by label" style={inputStyle} />
        </div>
      ) : null}

      <div ref={tableRef} style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, padding: '0 4px' }}>Tasks</div>

        <form onSubmit={(e) => { e.preventDefault(); void addTask() }} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.9fr 1fr 1fr 1.4fr 56px', padding: '14px 16px', gap: 10, alignItems: 'center', background: '#fcfcfd', border: '1px solid #e2e8f0', borderRadius: 16 }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add task title" style={inputStyle} />
          <input value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} placeholder="Assignee" style={inputStyle} />
          <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as 'P1'|'P2'|'P3')} style={inputStyle}><option value="P1">High</option><option value="P2">Medium</option><option value="P3">Low</option></select>
          <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} style={inputStyle} />
          <select value={newStatusId} onChange={(e) => setNewStatusId(e.target.value)} style={inputStyle}>{(project?.statuses || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>Add tags after create</div>
          <button type="submit" disabled={creating || !newTitle.trim() || !projectId} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>{creating ? '…' : '+'}</button>
        </form>

        {sortedTasks.map((task) => {
          const expanded = expandedTaskId === task.id
          return (
            <div key={task.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
              <EditableTaskRow task={task} projectId={projectId} statuses={project?.statuses || []} expanded={expanded} onActivate={() => setExpandedTaskId(task.id)} />
              {expanded ? <InlineTaskPanel taskId={task.id} projectId={projectId} /> : null}
            </div>
          )
        })}
        {!sortedTasks.length ? <div style={{ padding: 18, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }}>No tasks match the current filters.</div> : null}
      </div>
    </div>
  )
}

function headerBtn(active: boolean): React.CSSProperties { return { background: 'transparent', border: 'none', textAlign: 'left', color: active ? '#0f172a' : '#64748b', fontSize: 13, fontWeight: active ? 800 : 700, padding: 0, cursor: 'pointer' } }
